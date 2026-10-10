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
import { CreateIncidentDto, CreateVehicleCheckDto, HandleIncidentDto, INCIDENT_LABEL, SignoffDto } from './field.dto';

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
    const [driver, vehicles, recent] = await Promise.all([
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
    ]);
    // Xe đang giữ: lần nhận gần nhất của mỗi xe chưa có lần trả sau đó
    const holding: typeof recent = [];
    const seen = new Set<number>();
    for (const c of recent) {
      if (seen.has(c.vehicleId)) continue;
      seen.add(c.vehicleId);
      if (c.kind === 'NHAN') holding.push(c);
    }
    return { vehicles, defaultVehicleId: driver.defaultVehicles[0]?.id ?? null, holding, recent, items: VEHICLE_CHECK_ITEMS };
  }

  async createCheck(driverId: number, userId: number, dto: CreateVehicleCheckDto) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId }, select: { id: true, plateNumber: true, ownership: true, odometerKm: true } });
    if (!vehicle || vehicle.ownership !== 'CONG_TY') throw new NotFoundException('Không tìm thấy xe công ty');
    if (dto.odometerKm != null && vehicle.odometerKm != null && dto.odometerKm + 50 < vehicle.odometerKm) {
      throw new BadRequestException(`Số km ${dto.odometerKm.toLocaleString('vi-VN')} nhỏ hơn số km đã ghi của xe (${vehicle.odometerKm.toLocaleString('vi-VN')}). Kiểm tra lại đồng hồ.`);
    }
    const defects = dto.items.filter((i) => !i.ok);
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
        },
        include: { vehicle: { select: { id: true, plateNumber: true } } },
      });
      if (dto.odometerKm != null && (vehicle.odometerKm == null || dto.odometerKm > vehicle.odometerKm)) {
        await tx.vehicle.update({ where: { id: vehicle.id }, data: { odometerKm: dto.odometerKm } });
      }
      return c;
    });
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

  listChecks(q: { from?: string; to?: string; driverId?: number; vehicleId?: number; defects?: boolean }) {
    return this.prisma.vehicleCheck.findMany({
      where: {
        ...(q.driverId && { driverId: q.driverId }),
        ...(q.vehicleId && { vehicleId: q.vehicleId }),
        ...(q.defects && { defects: { gt: 0 } }),
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
        (await this.prisma.vehicleCheck.count({ where: { driverId, photos: { has: name } } }));
      if (!own) throw new ForbiddenException('Không có quyền xem ảnh này');
    }
    if (!existsSync(join(FIELD_DIR, name))) throw new NotFoundException('Không tìm thấy ảnh');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(name, { root: FIELD_DIR });
  }
}
