import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { Prisma, Role, TripStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { diskStorage } from 'multer';
import { join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { AddPassengersDto, CreateIncidentDto, CreateVehicleCheckDto, DriverPassengerDto, HandleIncidentDto, INCIDENT_LABEL, SignoffDto } from './field.dto';

/** Ảnh hiện trường (sự cố, nhận / trả xe): apps/api/uploads/field */
export const FIELD_DIR = resolve(process.env.UPLOAD_DIR ?? join(__dirname, '..', '..', 'uploads'), 'field');
mkdirSync(FIELD_DIR, { recursive: true });
const ALLOWED: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAX_PHOTOS = 8;

export const fieldUpload: MulterOptions = {
  storage: diskStorage({
    destination: FIELD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}${ALLOWED[file.mimetype] ?? '.jpg'}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (ALLOWED[file.mimetype] ? cb(null, true) : cb(new BadRequestException('Chỉ nhận ảnh JPG, PNG, WEBP'), false)),
};

export function removeFieldPhoto(name: string) {
  const path = join(FIELD_DIR, name);
  if (resolve(path).startsWith(FIELD_DIR) && existsSync(path)) unlinkSync(path);
}

/** Bắt buộc đo nồng độ cồn khi nhận xe (cài đặt alcoholCheckRequired, mặc định bật) */
export async function alcoholRequired(prisma: PrismaService) {
  const row = await prisma.setting.findUnique({ where: { key: 'alcoholCheckRequired' } });
  return row?.value !== '0';
}

/** Mốc 0 giờ hôm nay theo giờ Việt Nam */
const vnToday = () => new Date(`${new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)}T00:00:00+07:00`);

/** Lần đo nồng độ cồn gần nhất trong ngày (giờ VN) của lái xe */
export function alcoholToday(prisma: PrismaService, driverId: number) {
  return prisma.vehicleCheck.findFirst({
    where: { driverId, kind: 'NHAN', alcoholOk: { not: null }, createdAt: { gte: vnToday() } },
    select: { id: true, alcoholMgL: true, alcoholOk: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Chặn bắt đầu chuyến xe công ty khi lái xe chưa đo nồng độ cồn hôm nay, hoặc lần đo gần nhất có cồn
 * (Luật Trật tự, an toàn giao thông đường bộ 2024: cấm điều khiển xe mà trong hơi thở có nồng độ cồn).
 */
export async function assertAlcoholOk(prisma: PrismaService, driverId: number) {
  if (!(await alcoholRequired(prisma))) return;
  const last = await alcoholToday(prisma, driverId);
  if (!last) throw new BadRequestException('Chưa đo nồng độ cồn hôm nay. Vào tab Nhận xe → Nhận xe, đo nồng độ cồn rồi mới bắt đầu chuyến.');
  if (!last.alcoholOk) {
    throw new BadRequestException(
      `Lần đo nồng độ cồn gần nhất có cồn (${last.alcoholMgL?.toLocaleString('vi-VN')} mg/L) – không được lái xe. Liên hệ điều hành; đo lại đạt 0 mg/L ở tab Nhận xe mới bắt đầu được chuyến.`,
    );
  }
}

/** Danh mục kiểm tra khi nhận / trả xe */
export const VEHICLE_CHECK_ITEMS = [
  { key: 'giay_to', label: 'Giấy tờ xe (đăng ký, đăng kiểm, bảo hiểm, phù hiệu)' },
  { key: 'lop', label: 'Lốp xe, lốp dự phòng' },
  { key: 'den', label: 'Đèn, còi, gạt mưa' },
  { key: 'phanh', label: 'Phanh, tay lái' },
  { key: 'dau_nuoc', label: 'Dầu máy, nước làm mát' },
  { key: 'dieu_hoa', label: 'Điều hòa' },
  { key: 'than_vo', label: 'Thân vỏ (trầy xước, móp)' },
  { key: 've_sinh', label: 'Vệ sinh trong xe' },
  { key: 'dung_cu', label: 'Dụng cụ, bình chữa cháy, búa thoát hiểm' },
];

const incidentInclude = {
  driver: { select: { id: true, fullName: true, phone: true } },
  vehicle: { select: { id: true, plateNumber: true } },
  handledBy: { select: { id: true, fullName: true } },
  trip: {
    select: {
      id: true,
      seq: true,
      pickupTime: true,
      pickupAddress: true,
      dropoffAddress: true,
      status: true,
      booking: { select: { id: true, code: true, contactName: true, contactPhone: true } },
    },
  },
} satisfies Prisma.FieldIncidentInclude;

@Injectable()
export class FieldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  private async ownTrip(driverId: number, tripId: number) {
    const trip = await this.prisma.bookingTrip.findFirst({ where: { id: tripId, driverId }, include: { booking: { select: { id: true, code: true } } } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến');
    return trip;
  }

  // ───── Ký nhận điện tử ─────

  async signoff(driverId: number, userId: number, tripId: number, dto: SignoffDto) {
    const trip = await this.ownTrip(driverId, tripId);
    if (trip.status !== TripStatus.DA_DON_KHACH && trip.status !== TripStatus.HOAN_THANH) throw new BadRequestException('Chỉ ký nhận sau khi đã đón khách');
    await this.prisma.$transaction([
      this.prisma.bookingTrip.update({
        where: { id: tripId },
        data: { signoffName: dto.name, signoffSvg: dto.svg, signoffNote: dto.note ?? null, signoffAt: new Date() },
      }),
      this.prisma.tripEvent.create({ data: { tripId, status: trip.status, userId, note: `Khách ký nhận hoàn thành: ${dto.name}` } }),
    ]);
    return this.prisma.bookingTrip.findUnique({ where: { id: tripId }, select: { signoffName: true, signoffAt: true, signoffSvg: true, signoffNote: true } });
  }

  // ───── Lái xe bổ sung danh sách hành khách ─────

  /** Lái xe chỉ bổ sung khách khi đã nhận chuyến, đang đi đón hoặc đã đón khách */
  private static readonly PAX_STATUSES: TripStatus[] = [TripStatus.TAI_XE_NHAN, TripStatus.DANG_DEN_DON, TripStatus.DA_DON_KHACH];

  private async paxContext(driverId: number, tripId: number) {
    const trip = await this.ownTrip(driverId, tripId);
    if (!FieldService.PAX_STATUSES.includes(trip.status)) throw new BadRequestException('Chỉ bổ sung hành khách khi đã nhận chuyến và chưa hoàn thành');
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: trip.bookingId },
      select: {
        id: true,
        code: true,
        createdById: true,
        salesUserId: true,
        trips: { where: { status: { not: TripStatus.HUY } }, select: { passengers: true } },
        _count: { select: { passengers: true } },
      },
    });
    // Số khách tối đa = số khách lớn nhất trong các chuyến của booking
    const max = Math.max(trip.passengers, ...booking.trips.map((t) => t.passengers));
    return { trip, booking, max };
  }

  async addPassengers(driverId: number, userId: number, tripId: number, dto: AddPassengersDto) {
    if (!dto.passengers.length) throw new BadRequestException('Chưa nhập hành khách');
    const { trip, booking, max } = await this.paxContext(driverId, tripId);
    const have = booking._count.passengers;
    const room = max - have;
    if (dto.passengers.length > room) {
      throw new BadRequestException(
        room > 0
          ? `Chuyến ghi ${max} khách, danh sách đã có ${have}: chỉ thêm được ${room} người. Khách đi thêm hãy báo văn phòng.`
          : `Danh sách đã đủ ${max} khách theo chuyến. Khách đi thêm hãy báo văn phòng.`,
      );
    }
    const driver = await this.prisma.driver.findUniqueOrThrow({ where: { id: driverId }, select: { fullName: true } });
    const last = await this.prisma.bookingPassenger.aggregate({ where: { bookingId: booking.id }, _max: { seq: true } });
    const now = new Date();
    const names = dto.passengers.map((p) => p.fullName).join(', ');
    await this.prisma.$transaction([
      this.prisma.bookingPassenger.createMany({
        data: dto.passengers.map((p, i) => ({
          bookingId: booking.id,
          seq: (last._max.seq ?? 0) + i + 1,
          fullName: p.fullName,
          birthYear: p.birthYear ?? null,
          gender: p.gender ?? null,
          nationality: p.nationality ?? null,
          phone: p.phone ?? null,
          note: p.note ?? null,
          addedByDriverId: driverId,
          addedByName: driver.fullName,
          addedAt: now,
        })),
      }),
      this.prisma.tripEvent.create({ data: { tripId, status: trip.status, userId, note: `Lái xe bổ sung ${dto.passengers.length} hành khách: ${names}` } }),
    ]);
    await this.push.notifyRoles(
      [Role.DIEU_HANH],
      {
        type: 'PAX_ADDED',
        title: `Lái xe bổ sung hành khách – ${booking.code}`,
        body: `${driver.fullName} thêm ${dto.passengers.length} người: ${names}`,
        link: `/bookings/${booking.id}`,
        tripId,
      },
      { exclude: userId, extra: [booking.createdById, booking.salesUserId] },
    );
    return this.driverPassengers(booking.id);
  }

  private async ownPassenger(driverId: number, id: number) {
    const p = await this.prisma.bookingPassenger.findUnique({ where: { id } });
    if (!p || p.addedByDriverId !== driverId) throw new NotFoundException('Chỉ sửa được hành khách do bạn thêm');
    // Lái xe phải còn chuyến chưa xong của booking này
    const trip = await this.prisma.bookingTrip.findFirst({ where: { bookingId: p.bookingId, driverId, status: { in: FieldService.PAX_STATUSES } } });
    if (!trip) throw new BadRequestException('Chuyến đã xong, không sửa được danh sách. Liên hệ văn phòng.');
    return p;
  }

  async updatePassenger(driverId: number, id: number, dto: DriverPassengerDto) {
    const p = await this.ownPassenger(driverId, id);
    await this.prisma.bookingPassenger.update({
      where: { id },
      data: { fullName: dto.fullName, birthYear: dto.birthYear ?? null, gender: dto.gender ?? null, nationality: dto.nationality ?? null, phone: dto.phone ?? null, note: dto.note ?? null },
    });
    return this.driverPassengers(p.bookingId);
  }

  async removePassenger(driverId: number, id: number) {
    const p = await this.ownPassenger(driverId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.bookingPassenger.delete({ where: { id } });
      // Đánh lại số thứ tự
      const rest = await tx.bookingPassenger.findMany({ where: { bookingId: p.bookingId }, orderBy: { seq: 'asc' }, select: { id: true, seq: true } });
      for (const [i, r] of rest.entries()) if (r.seq !== i + 1) await tx.bookingPassenger.update({ where: { id: r.id }, data: { seq: i + 1 } });
    });
    return this.driverPassengers(p.bookingId);
  }

  /** Danh sách khách trả về app (không gửi số giấy tờ tùy thân) */
  private driverPassengers(bookingId: number) {
    return this.prisma.bookingPassenger.findMany({
      where: { bookingId },
      orderBy: { seq: 'asc' },
      select: { id: true, seq: true, fullName: true, gender: true, birthYear: true, nationality: true, phone: true, note: true, addedByDriverId: true },
    });
  }

  // ───── Sự cố ─────

  async createIncident(driverId: number, userId: number, dto: CreateIncidentDto) {
    const trip = dto.tripId ? await this.ownTrip(driverId, dto.tripId) : null;
    const driver = await this.prisma.driver.findUniqueOrThrow({ where: { id: driverId }, select: { fullName: true, defaultVehicles: { select: { id: true }, take: 1 } } });
    const inc = await this.prisma.fieldIncident.create({
      data: { driverId, tripId: trip?.id ?? null, vehicleId: trip?.vehicleId ?? driver.defaultVehicles[0]?.id ?? null, type: dto.type, note: dto.note },
      include: incidentInclude,
    });
    await this.push.notifyRoles(
      [Role.ADMIN, Role.DIEU_HANH],
      {
        type: 'INCIDENT_NEW',
        title: `⚠ Sự cố: ${INCIDENT_LABEL[dto.type]}`,
        body: [driver.fullName, inc.vehicle?.plateNumber, trip && `chuyến ${trip.booking.code}`, dto.note].filter(Boolean).join(' · '),
        link: `/field?incident=${inc.id}`,
        tripId: trip?.id,
      },
      { exclude: userId },
    );
    return inc;
  }

  async driverIncidents(driverId: number, tripId?: number) {
    return this.prisma.fieldIncident.findMany({
      where: { driverId, ...(tripId ? { tripId } : { createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } }) },
      include: incidentInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async addIncidentPhoto(driverId: number, id: number, file: Express.Multer.File) {
    const inc = await this.prisma.fieldIncident.findFirst({ where: { id, driverId } });
    if (!inc) {
      removeFieldPhoto(file.filename);
      throw new NotFoundException('Không tìm thấy sự cố');
    }
    if (inc.photos.length >= MAX_PHOTOS) {
      removeFieldPhoto(file.filename);
      throw new BadRequestException(`Tối đa ${MAX_PHOTOS} ảnh`);
    }
    return this.prisma.fieldIncident.update({ where: { id }, data: { photos: { push: file.filename } }, include: incidentInclude });
  }

  listIncidents(q: { status?: string; from?: string; to?: string; driverId?: number; vehicleId?: number; tripId?: number }) {
    return this.prisma.fieldIncident.findMany({
      where: {
        ...(q.status && { status: { in: q.status.split(',') } }),
        ...(q.driverId && { driverId: q.driverId }),
        ...(q.vehicleId && { vehicleId: q.vehicleId }),
        ...(q.tripId && { tripId: q.tripId }),
        ...((q.from || q.to) && { createdAt: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lt: new Date(new Date(q.to).getTime() + 86400_000) }) } }),
      },
      include: incidentInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
    });
  }

  openIncidentCount() {
    return this.prisma.fieldIncident.count({ where: { status: { in: ['MOI', 'DANG_XU_LY'] } } });
  }

  async handleIncident(id: number, dto: HandleIncidentDto, userId: number) {
    const inc = await this.prisma.fieldIncident.findUnique({ where: { id }, include: { driver: { select: { userId: true } } } });
    if (!inc) throw new NotFoundException('Không tìm thấy sự cố');
    const updated = await this.prisma.fieldIncident.update({
      where: { id },
      data: { status: dto.status, handleNote: dto.handleNote ?? null, handledById: userId, handledAt: new Date() },
      include: incidentInclude,
    });
    // Báo lại cho lái xe biết văn phòng đã tiếp nhận / xử lý
    if (inc.status !== dto.status && dto.status !== 'MOI') {
      await this.push.notifyUsers([inc.driver.userId], {
        type: 'INCIDENT_HANDLED',
        title: dto.status === 'DA_XU_LY' ? 'Sự cố đã xử lý xong' : 'Văn phòng đang xử lý sự cố',
        body: [INCIDENT_LABEL[inc.type as keyof typeof INCIDENT_LABEL] ?? inc.type, dto.handleNote].filter(Boolean).join(' · '),
        tripId: inc.tripId ?? undefined,
      });
    }
    return updated;
  }

  // ───── Nhận / trả xe ─────

  /** Màn hình nhận / trả xe của lái xe: xe công ty, xe đang giữ (nhận mà chưa trả), danh mục kiểm tra, lịch sử */
  async driverChecks(driverId: number) {
    const [driver, vehicles, recent, alcohol, required] = await Promise.all([
      this.prisma.driver.findUniqueOrThrow({ where: { id: driverId }, select: { defaultVehicles: { select: { id: true } } } }),
      this.prisma.vehicle.findMany({
        where: { ownership: 'CONG_TY', status: { not: 'NGUNG_HOAT_DONG' } },
        select: { id: true, plateNumber: true, odometerKm: true, vehicleType: { select: { name: true } } },
        orderBy: { plateNumber: 'asc' },
      }),
      this.prisma.vehicleCheck.findMany({
        where: { driverId },
        include: { vehicle: { select: { id: true, plateNumber: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      alcoholToday(this.prisma, driverId),
      alcoholRequired(this.prisma),
    ]);
    // Xe đang giữ: lần nhận gần nhất của mỗi xe chưa có lần trả sau đó
    const holding: typeof recent = [];
    const seen = new Set<number>();
    for (const c of recent) {
      if (seen.has(c.vehicleId)) continue;
      seen.add(c.vehicleId);
      // Đo có cồn: không giao xe
      if (c.kind === 'NHAN' && c.alcoholOk !== false) holding.push(c);
    }
    return { vehicles, defaultVehicleId: driver.defaultVehicles[0]?.id ?? null, holding, recent, items: VEHICLE_CHECK_ITEMS, alcoholRequired: required, alcoholToday: alcohol };
  }

  async createCheck(driverId: number, userId: number, dto: CreateVehicleCheckDto) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId }, select: { id: true, plateNumber: true, ownership: true, odometerKm: true } });
    if (!vehicle || vehicle.ownership !== 'CONG_TY') throw new NotFoundException('Không tìm thấy xe công ty');
    if (dto.odometerKm != null && vehicle.odometerKm != null && dto.odometerKm + 50 < vehicle.odometerKm) {
      throw new BadRequestException(`Số km ${dto.odometerKm.toLocaleString('vi-VN')} nhỏ hơn số km đã ghi của xe (${vehicle.odometerKm.toLocaleString('vi-VN')}). Kiểm tra lại đồng hồ.`);
    }
    const defects = dto.items.filter((i) => !i.ok);
    const alcoholMgL = dto.kind === 'NHAN' ? (dto.alcoholMgL ?? null) : null;
    if (dto.kind === 'NHAN' && alcoholMgL == null && (await alcoholRequired(this.prisma))) throw new BadRequestException('Nhập kết quả đo nồng độ cồn');
    const alcoholOk = alcoholMgL == null ? null : alcoholMgL === 0;
    const driver = await this.prisma.driver.findUniqueOrThrow({ where: { id: driverId }, select: { fullName: true } });
    const check = await this.prisma.$transaction(async (tx) => {
      const c = await tx.vehicleCheck.create({
        data: {
          vehicleId: vehicle.id,
          driverId,
          kind: dto.kind,
          odometerKm: dto.odometerKm ?? null,
          fuelLevel: dto.fuelLevel ?? null,
          items: dto.items.map((i) => ({ key: i.key, label: i.label, ok: i.ok, note: i.note ?? null })),
          defects: defects.length,
          note: dto.note ?? null,
          alcoholMgL,
          alcoholOk,
        },
        include: { vehicle: { select: { id: true, plateNumber: true } } },
      });
      if (dto.odometerKm != null && (vehicle.odometerKm == null || dto.odometerKm > vehicle.odometerKm)) {
        await tx.vehicle.update({ where: { id: vehicle.id }, data: { odometerKm: dto.odometerKm } });
      }
      return c;
    });
    if (alcoholOk === false) {
      await this.push.notifyRoles(
        [Role.ADMIN, Role.DIEU_HANH],
        {
          type: 'ALCOHOL_POSITIVE',
          title: `🚫 ${driver.fullName}: có nồng độ cồn ${alcoholMgL?.toLocaleString('vi-VN')} mg/L khi nhận xe ${vehicle.plateNumber}`,
          body: 'Không giao xe. App lái xe đã khóa bắt đầu chuyến đến khi đo lại đạt 0 mg/L. Bố trí lái xe khác cho các chuyến của lái xe này.',
          link: `/field?tab=checks&check=${check.id}`,
        },
        { exclude: userId },
      );
    }
    if (defects.length) {
      await this.push.notifyRoles(
        [Role.ADMIN, Role.DIEU_HANH],
        {
          type: 'VEHICLE_DEFECT',
          title: `🔧 ${vehicle.plateNumber}: ${defects.length} hạng mục lỗi khi ${dto.kind === 'NHAN' ? 'nhận' : 'trả'} xe`,
          body: [driver.fullName, ...defects.map((d) => (d.note ? `${d.label}: ${d.note}` : d.label))].join(' · '),
          link: `/field?tab=checks&check=${check.id}`,
        },
        { exclude: userId },
      );
    }
    return check;
  }

  async addCheckPhoto(driverId: number, id: number, file: Express.Multer.File) {
    const c = await this.prisma.vehicleCheck.findFirst({ where: { id, driverId } });
    if (!c) {
      removeFieldPhoto(file.filename);
      throw new NotFoundException('Không tìm thấy lần nhận / trả xe');
    }
    if (c.photos.length >= MAX_PHOTOS) {
      removeFieldPhoto(file.filename);
      throw new BadRequestException(`Tối đa ${MAX_PHOTOS} ảnh`);
    }
    return this.prisma.vehicleCheck.update({ where: { id }, data: { photos: { push: file.filename } }, include: { vehicle: { select: { id: true, plateNumber: true } } } });
  }

  /** Ảnh màn hình máy đo nồng độ cồn (một ảnh, gửi lại thì thay) */
  async setAlcoholPhoto(driverId: number, id: number, file: Express.Multer.File) {
    const c = await this.prisma.vehicleCheck.findFirst({ where: { id, driverId, kind: 'NHAN' } });
    if (!c) {
      removeFieldPhoto(file.filename);
      throw new NotFoundException('Không tìm thấy lần nhận xe');
    }
    if (c.alcoholPhoto) removeFieldPhoto(c.alcoholPhoto);
    return this.prisma.vehicleCheck.update({ where: { id }, data: { alcoholPhoto: file.filename }, include: { vehicle: { select: { id: true, plateNumber: true } } } });
  }

  listChecks(q: { from?: string; to?: string; driverId?: number; vehicleId?: number; defects?: boolean; alcohol?: boolean }) {
    return this.prisma.vehicleCheck.findMany({
      where: {
        ...(q.driverId && { driverId: q.driverId }),
        ...(q.vehicleId && { vehicleId: q.vehicleId }),
        ...(q.defects && { defects: { gt: 0 } }),
        ...(q.alcohol && { alcoholOk: false }),
        ...((q.from || q.to) && { createdAt: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lt: new Date(new Date(q.to).getTime() + 86400_000) }) } }),
      },
      include: { vehicle: { select: { id: true, plateNumber: true } }, driver: { select: { id: true, fullName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  // ───── Ảnh ─────

  /** Văn phòng xem mọi ảnh; lái xe chỉ xem ảnh của sự cố / lần nhận xe của mình */
  async sendPhoto(res: Response, name: string, driverId: number | null) {
    if (!/^[\w.-]+$/.test(name)) throw new NotFoundException('Không tìm thấy ảnh');
    if (driverId !== null) {
      const own =
        (await this.prisma.fieldIncident.count({ where: { driverId, photos: { has: name } } })) +
        (await this.prisma.vehicleCheck.count({ where: { driverId, OR: [{ photos: { has: name } }, { alcoholPhoto: name }] } }));
      if (!own) throw new ForbiddenException('Không có quyền xem ảnh này');
    }
    if (!existsSync(join(FIELD_DIR, name))) throw new NotFoundException('Không tìm thấy ảnh');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(name, { root: FIELD_DIR });
  }
}
