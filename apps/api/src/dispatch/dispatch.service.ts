import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { BookingStatus, DriverStatus, Ownership, Prisma, TripStatus, VehicleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { AssignDto, DispatchQueryDto, TripStatusDto } from './dispatch.dto';

const TZ = 'Asia/Ho_Chi_Minh';
const DISPATCHABLE: BookingStatus[] = [BookingStatus.XAC_NHAN, BookingStatus.HOAN_THANH];
const CLOSED: TripStatus[] = [TripStatus.HOAN_THANH, TripStatus.HUY];

export const dispatchTripInclude = {
  booking: {
    select: {
      id: true,
      code: true,
      customerRef: true,
      status: true,
      contactName: true,
      contactPhone: true,
      leaderRole: true,
      leaderName: true,
      leaderPhone: true,
      customer: { select: { id: true, name: true } },
      // Hành khách đầu tiên: dùng làm tên / SĐT khách trong lệnh điều xe
      passengers: { orderBy: { seq: 'asc' }, take: 1, select: { fullName: true, phone: true } },
    },
  },
  vehicleType: { select: { id: true, code: true, name: true, seats: true, maxPassengers: true } },
  service: { select: { code: true, name: true, color: true, pricingMode: true, hasFlight: true } },
  vehicle: { select: { id: true, plateNumber: true, vehicleType: { select: { name: true } } } },
  driver: { select: { id: true, fullName: true, phone: true } },
  partner: { select: { id: true, name: true, phone: true } },
  assignedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.BookingTripInclude;

type Trip = Prisma.BookingTripGetPayload<{ include: typeof dispatchTripInclude }>;

const vnYmd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
/** "08:00 20/11" theo giờ VN */
const fmt = (d: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.hour}:${p.minute} ${p.day}/${p.month}`;
};

/** Khoảng thời gian [from 00:00, to 23:59] giờ VN; mặc định hôm nay */
function dayRange(from?: string, to?: string) {
  const f = from ?? vnYmd(new Date());
  const t = to ?? f;
  return { start: new Date(`${f}T00:00:00+07:00`), end: new Date(`${t}T23:59:59.999+07:00`) };
}

/** Điều kiện chuyến "chồng giờ" với khoảng [start, end) */
const overlapping = (start: Date, end: Date): Prisma.BookingTripWhereInput => ({ pickupTime: { lt: end }, endTime: { gt: start } });

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /** Báo lái xe mới có chuyến; báo lái xe cũ nếu chuyến bị chuyển đi */
  private async notifyAssignment(tripId: number, previousDriverId: number | null, newDriverId: number | null) {
    const trip = await this.prisma.bookingTrip.findUnique({ where: { id: tripId }, select: { pickupTime: true, pickupAddress: true, booking: { select: { code: true } } } });
    if (!trip) return;
    const when = fmt(trip.pickupTime);
    if (previousDriverId && previousDriverId !== newDriverId) {
      await this.push.notifyDriver(previousDriverId, 'Chuyến đã được chuyển', `${trip.booking.code} lúc ${when} không còn giao cho bạn`, { tripId });
    }
    if (newDriverId && newDriverId !== previousDriverId) {
      await this.push.notifyDriver(newDriverId, 'Bạn có chuyến mới', `${when} · ${trip.pickupAddress}`, { tripId });
    }
  }

  async listTrips({ from, to, status, q }: DispatchQueryDto) {
    const { start, end } = dayRange(from, to);
    return this.prisma.bookingTrip.findMany({
      where: {
        ...overlapping(start, end),
        status,
        booking: {
          status: { in: DISPATCHABLE },
          ...(q && {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { customerRef: { contains: q, mode: 'insensitive' } },
              { contactName: { contains: q, mode: 'insensitive' } },
              { customer: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }),
        },
      },
      include: dispatchTripInclude,
      orderBy: { pickupTime: 'asc' },
    });
  }

  /** Lịch xe công ty + chuyến giao đối tác + chuyến chờ điều trong khoảng ngày */
  async schedule(from?: string, to?: string) {
    const { start, end } = dayRange(from, to);
    if (end.getTime() - start.getTime() > 400 * 86_400_000) throw new BadRequestException('Chỉ xem lịch xe tối đa 1 năm mỗi lần');
    // Cột chờ điều xe: chuyến quá giờ trong 7 ngày qua + chuyến 7 ngày tới (tính từ đầu hôm nay)
    const today = dayRange().start;
    const waitFrom = new Date(today.getTime() - 7 * 86_400_000);
    const waitTo = new Date(today.getTime() + 7 * 86_400_000);
    const waitBase: Prisma.BookingTripWhereInput = { status: TripStatus.CHO_DIEU, booking: { status: BookingStatus.XAC_NHAN } };
    const activeInRange: Prisma.BookingTripWhereInput = {
      ...overlapping(start, end),
      status: { not: TripStatus.HUY },
      booking: { status: { in: DISPATCHABLE } },
    };

    const [vehicles, partnerTrips, waiting, overdue, waitingLater] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { ownership: Ownership.CONG_TY },
        include: {
          vehicleType: { select: { id: true, code: true, name: true, seats: true, maxPassengers: true } },
          defaultDriver: { select: { id: true, fullName: true } },
          trips: { where: activeInRange, include: dispatchTripInclude, orderBy: { pickupTime: 'asc' } },
        },
        orderBy: [{ vehicleType: { seats: 'asc' } }, { plateNumber: 'asc' }],
      }),
      this.prisma.bookingTrip.findMany({
        where: { ...activeInRange, partnerId: { not: null } },
        include: dispatchTripInclude,
        orderBy: { pickupTime: 'asc' },
      }),
      // Chuyến chờ điều xe trong 7 ngày gần nhất (không phụ thuộc ngày đang xem), sắp theo giờ đón
      this.prisma.bookingTrip.findMany({
        where: { ...waitBase, pickupTime: { gte: waitFrom, lt: waitTo } },
        include: dispatchTripInclude,
        orderBy: { pickupTime: 'asc' },
      }),
      // Chuyến đã qua giờ đón mà vẫn chưa điều xe: luôn hiện để không bị sót
      this.prisma.bookingTrip.count({
        where: { status: TripStatus.CHO_DIEU, pickupTime: { lt: new Date() }, booking: { status: BookingStatus.XAC_NHAN } },
      }),
      // Chuyến chờ điều xa hơn 7 ngày: chỉ đếm, xem ở Danh sách chuyến
      this.prisma.bookingTrip.count({ where: { ...waitBase, pickupTime: { gte: waitTo } } }),
    ]);
    return { from: vnYmd(start), to: vnYmd(end), vehicles, partnerTrips, waiting, overdueCount: overdue, waitingLater, waitingUntil: vnYmd(new Date(waitTo.getTime() - 1)) };
  }

  async getTrip(id: number) {
    return this.prisma.bookingTrip.findUniqueOrThrow({
      where: { id },
      include: {
        ...dispatchTripInclude,
        events: { orderBy: { createdAt: 'desc' }, include: { user: { select: { fullName: true } } } },
      },
    });
  }

  /** Gợi ý xe công ty và lái xe cho chuyến, kèm tình trạng trùng lịch */
  async options(id: number) {
    const trip = await this.prisma.bookingTrip.findUniqueOrThrow({ where: { id }, include: { vehicleType: true } });
    const busy: Prisma.BookingTripWhereInput = {
      id: { not: trip.id },
      status: { not: TripStatus.HUY },
      ...overlapping(trip.pickupTime, trip.endTime),
    };
    const conflictSelect = { select: { id: true, pickupTime: true, endTime: true, booking: { select: { code: true } } } };

    const [vehicles, drivers] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { ownership: Ownership.CONG_TY, status: { not: VehicleStatus.NGUNG_HOAT_DONG } },
        include: {
          vehicleType: { select: { id: true, code: true, name: true, seats: true, maxPassengers: true, licenseClasses: true } },
          defaultDriver: { select: { id: true, fullName: true } },
          trips: { where: busy, ...conflictSelect },
        },
      }),
      this.prisma.driver.findMany({
        where: { partnerId: null, status: { not: DriverStatus.NGHI_VIEC } },
        include: { trips: { where: busy, ...conflictSelect } },
        orderBy: { fullName: 'asc' },
      }),
    ]);

    const vehicleOptions = vehicles
      .map((v) => ({
        id: v.id,
        plateNumber: v.plateNumber,
        status: v.status,
        vehicleType: v.vehicleType,
        defaultDriver: v.defaultDriver,
        exactType: v.vehicleTypeId === trip.vehicleTypeId,
        enoughSeats: v.vehicleType.maxPassengers >= trip.passengers,
        conflicts: v.trips.map((t) => ({ code: t.booking.code, pickupTime: t.pickupTime, endTime: t.endTime })),
      }))
      .filter((v) => v.enoughSeats)
      // Xe đúng loại & rảnh lên đầu, sau đó xe nhỏ trước
      .sort(
        (a, b) =>
          Number(b.exactType) - Number(a.exactType) ||
          a.conflicts.length - b.conflicts.length ||
          Number(a.status !== 'SAN_SANG') - Number(b.status !== 'SAN_SANG') ||
          a.vehicleType.seats - b.vehicleType.seats,
      );

    const driverOptions = drivers.map((d) => ({
      id: d.id,
      fullName: d.fullName,
      phone: d.phone,
      status: d.status,
      licenseClass: d.licenseClass,
      conflicts: d.trips.map((t) => ({ code: t.booking.code, pickupTime: t.pickupTime, endTime: t.endTime })),
    }));

    return { vehicles: vehicleOptions, drivers: driverOptions };
  }

  /** Kiểm tra gán xe công ty + lái xe: lỗi chặn và cảnh báo cần xác nhận */
  async check(tripId: number, vehicleId: number, driverId?: number | null): Promise<CheckResult> {
    const trip = await this.prisma.bookingTrip.findUniqueOrThrow({ where: { id: tripId }, include: { vehicleType: true } });
    const errors: string[] = [];
    const warnings: string[] = [];
    const tripDay = trip.endTime;
    const busy: Prisma.BookingTripWhereInput = {
      id: { not: trip.id },
      status: { not: TripStatus.HUY },
      ...overlapping(trip.pickupTime, trip.endTime),
    };
    const conflictText = (rows: { pickupTime: Date; endTime: Date; booking: { code: string } }[]) =>
      rows.map((r) => `${r.booking.code} (${fmt(r.pickupTime)} – ${fmt(r.endTime)})`).join(', ');

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, include: { vehicleType: true } });
    if (!vehicle) return { errors: ['Xe không tồn tại'], warnings };
    if (vehicle.ownership !== Ownership.CONG_TY) errors.push('Chỉ chọn xe công ty. Xe đối tác hãy dùng tab "Xe đối tác".');
    if (vehicle.vehicleType.maxPassengers < trip.passengers) {
      errors.push(`${vehicle.plateNumber} (${vehicle.vehicleType.name}) chỉ chở tối đa ${vehicle.vehicleType.maxPassengers} khách, chuyến có ${trip.passengers} khách`);
    }
    if (vehicle.vehicleTypeId !== trip.vehicleTypeId) warnings.push(`Khách đặt ${trip.vehicleType.name}, đang xếp ${vehicle.vehicleType.name}`);
    if (vehicle.status !== VehicleStatus.SAN_SANG) {
      warnings.push(`Xe ${vehicle.plateNumber} đang ở trạng thái ${vehicle.status === 'BAO_DUONG' ? 'bảo dưỡng' : 'ngừng hoạt động'}`);
    }
    for (const [field, label] of [
      ['registrationExpiry', 'Đăng kiểm'],
      ['insuranceExpiry', 'Bảo hiểm'],
      ['badgeExpiry', 'Phù hiệu'],
    ] as const) {
      const d = vehicle[field];
      if (d && d < tripDay) warnings.push(`${label} xe ${vehicle.plateNumber} hết hạn ${vnYmd(d).split('-').reverse().join('/')}, trước khi chuyến kết thúc`);
    }
    const vehicleBusy = await this.prisma.bookingTrip.findMany({
      where: { ...busy, vehicleId },
      select: { pickupTime: true, endTime: true, booking: { select: { code: true } } },
    });
    if (vehicleBusy.length) warnings.push(`Xe ${vehicle.plateNumber} đã có chuyến trùng giờ: ${conflictText(vehicleBusy)}`);

    if (!driverId) {
      warnings.push('Chưa chọn lái xe');
    } else {
      const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
      if (!driver) {
        errors.push('Lái xe không tồn tại');
      } else {
        if (driver.partnerId) errors.push(`${driver.fullName} là lái xe của nhà xe đối tác`);
        if (driver.status !== DriverStatus.DANG_LAM) warnings.push(`${driver.fullName} đang ${driver.status === 'NGHI_PHEP' ? 'nghỉ phép' : 'nghỉ việc'}`);
        const allowed = vehicle.vehicleType.licenseClasses;
        if (allowed.length && (!driver.licenseClass || !allowed.includes(driver.licenseClass))) {
          warnings.push(`Bằng lái ${driver.licenseClass ?? '(chưa khai báo)'} của ${driver.fullName} không thuộc hạng phù hợp ${vehicle.vehicleType.name}: ${allowed.join(', ')}`);
        }
        if (driver.licenseExpiry && driver.licenseExpiry < tripDay) warnings.push(`Bằng lái của ${driver.fullName} hết hạn trước khi chuyến kết thúc`);
        if (driver.healthCheckExpiry && driver.healthCheckExpiry < tripDay) warnings.push(`Giấy khám sức khỏe của ${driver.fullName} hết hạn trước khi chuyến kết thúc`);
        const driverBusy = await this.prisma.bookingTrip.findMany({
          where: { ...busy, driverId },
          select: { pickupTime: true, endTime: true, booking: { select: { code: true } } },
        });
        if (driverBusy.length) warnings.push(`${driver.fullName} đã có chuyến trùng giờ: ${conflictText(driverBusy)}`);
      }
    }
    return { errors, warnings };
  }

  async assign(id: number, dto: AssignDto, user: AuthUser) {
    const trip = await this.prisma.bookingTrip.findUniqueOrThrow({ where: { id }, include: { booking: true, vehicleType: true } });
    if (trip.booking.status !== BookingStatus.XAC_NHAN) throw new BadRequestException('Booking chưa được khách xác nhận nên chưa điều xe được');
    if (CLOSED.includes(trip.status)) throw new BadRequestException('Chuyến đã hoàn thành hoặc đã hủy');

    let data: Prisma.BookingTripUncheckedUpdateInput;
    let note: string;

    if (dto.mode === 'COMPANY') {
      if (!dto.vehicleId) throw new BadRequestException('Chưa chọn xe');
      const { errors, warnings } = await this.check(id, dto.vehicleId, dto.driverId);
      if (errors.length) throw new BadRequestException(errors.join('\n'));
      if (warnings.length && !dto.force) {
        throw new ConflictException({ statusCode: 409, message: 'Cần xác nhận cảnh báo trước khi gán xe', warnings, needConfirm: true });
      }
      const [vehicle, driver] = await Promise.all([
        this.prisma.vehicle.findUniqueOrThrow({ where: { id: dto.vehicleId } }),
        dto.driverId ? this.prisma.driver.findUnique({ where: { id: dto.driverId } }) : null,
      ]);
      data = {
        vehicleId: dto.vehicleId,
        driverId: dto.driverId ?? null,
        partnerId: null,
        partnerPlate: null,
        partnerDriverName: null,
        partnerDriverPhone: null,
        partnerCost: null,
      };
      note = `Gán xe ${vehicle.plateNumber}${driver ? `, lái xe ${driver.fullName}` : ' (chưa có lái xe)'}`;
      if (warnings.length) note += ` · Đã bỏ qua cảnh báo: ${warnings.join('; ')}`;
    } else {
      if (!dto.partnerId) throw new BadRequestException('Chưa chọn nhà xe đối tác');
      if (dto.partnerCost === undefined || dto.partnerCost === null) throw new BadRequestException('Chưa nhập giá thuê đối tác');
      const partner = await this.prisma.partner.findUniqueOrThrow({ where: { id: dto.partnerId } });
      if (!partner.isActive) throw new BadRequestException(`${partner.name} đã ngừng hợp tác`);
      const warnings: string[] = [];
      if (partner.vehicleTypeCodes.length && !partner.vehicleTypeCodes.includes(trip.vehicleType.code)) {
        warnings.push(`${partner.name} chưa khai báo cung cấp ${trip.vehicleType.name}`);
      }
      if (warnings.length && !dto.force) {
        throw new ConflictException({ statusCode: 409, message: 'Cần xác nhận cảnh báo trước khi gán xe', warnings, needConfirm: true });
      }
      data = {
        vehicleId: null,
        driverId: null,
        partnerId: partner.id,
        partnerPlate: dto.partnerPlate || null,
        partnerDriverName: dto.partnerDriverName || null,
        partnerDriverPhone: dto.partnerDriverPhone || null,
        partnerCost: dto.partnerCost,
        // Giá thuê đối tác là chi phí thực của chuyến
        estimatedCost: dto.partnerCost,
      };
      note = `Giao nhà xe ${partner.name}${dto.partnerPlate ? ` (${dto.partnerPlate})` : ''}, giá thuê ${dto.partnerCost.toLocaleString('vi-VN')}đ`;
    }

    await this.prisma.$transaction([
      this.prisma.bookingTrip.update({
        where: { id },
        data: {
          ...data,
          status: TripStatus.DA_GAN,
          dispatchNote: dto.dispatchNote || null,
          assignedAt: new Date(),
          assignedById: user.id,
        },
      }),
      this.prisma.tripEvent.create({ data: { tripId: id, status: TripStatus.DA_GAN, note, userId: user.id } }),
    ]);
    await this.notifyAssignment(id, trip.driverId, dto.mode === 'COMPANY' ? (dto.driverId ?? null) : null);
    return this.getTrip(id);
  }

  async unassign(id: number, user: AuthUser) {
    const trip = await this.prisma.bookingTrip.findUniqueOrThrow({ where: { id } });
    if (CLOSED.includes(trip.status)) throw new BadRequestException('Chuyến đã hoàn thành hoặc đã hủy');
    if (trip.status === TripStatus.CHO_DIEU) throw new BadRequestException('Chuyến chưa được điều xe');
    await this.prisma.$transaction([
      this.prisma.bookingTrip.update({
        where: { id },
        data: {
          status: TripStatus.CHO_DIEU,
          vehicleId: null,
          driverId: null,
          partnerId: null,
          partnerPlate: null,
          partnerDriverName: null,
          partnerDriverPhone: null,
          partnerCost: null,
          assignedAt: null,
          assignedById: null,
        },
      }),
      this.prisma.tripEvent.create({ data: { tripId: id, status: TripStatus.CHO_DIEU, note: 'Hủy điều xe', userId: user.id } }),
    ]);
    await this.notifyAssignment(id, trip.driverId, null);
    return this.getTrip(id);
  }

  async updateStatus(id: number, dto: TripStatusDto, user: AuthUser) {
    const trip = await this.prisma.bookingTrip.findUniqueOrThrow({ where: { id } });
    if (trip.status === TripStatus.CHO_DIEU) throw new BadRequestException('Chuyến chưa được điều xe');
    if (CLOSED.includes(trip.status)) throw new BadRequestException('Chuyến đã hoàn thành hoặc đã hủy');

    await this.prisma.$transaction(async (tx) => {
      await tx.bookingTrip.update({ where: { id }, data: { status: dto.status } });
      await tx.tripEvent.create({ data: { tripId: id, status: dto.status, note: dto.note || null, userId: user.id } });
      if (dto.status === TripStatus.HOAN_THANH) {
        // Mọi chuyến của booking đã xong thì booking tự hoàn thành
        const open = await tx.bookingTrip.count({ where: { bookingId: trip.bookingId, status: { notIn: CLOSED } } });
        if (open === 0) {
          await tx.booking.updateMany({ where: { id: trip.bookingId, status: BookingStatus.XAC_NHAN }, data: { status: BookingStatus.HOAN_THANH } });
        }
      }
    });
    return this.getTrip(id);
  }
}

export type DispatchTrip = Trip;
