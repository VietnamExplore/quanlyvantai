import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus, Prisma, Role, TripStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { PriceLine, sumLines } from '../pricing/pricing.service';
import { BookingQueryDto, ChangeStatusDto, CreateBookingDto, TripDto, UpdateBookingDto } from './bookings.dto';

const HOUR_MS = 3_600_000;
const TZ = 'Asia/Ho_Chi_Minh';

const bookingInclude = {
  customer: { select: { id: true, name: true, type: true, phone: true, email: true, taxCode: true, address: true } },
  salesUser: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  trips: {
    orderBy: { seq: 'asc' },
    include: {
      vehicleType: { select: { id: true, code: true, name: true, seats: true, maxPassengers: true } },
      routePrice: { select: { id: true, name: true } },
      vehicle: { select: { plateNumber: true } },
      driver: { select: { fullName: true } },
      partner: { select: { name: true } },
    },
  },
} satisfies Prisma.BookingInclude;

type BookingWithTrips = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

/** Chuyển trạng thái hợp lệ */
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  NHAP: ['BAO_GIA', 'XAC_NHAN', 'HUY'],
  BAO_GIA: ['NHAP', 'XAC_NHAN', 'HUY'],
  XAC_NHAN: ['HOAN_THANH', 'HUY'],
  HOAN_THANH: [],
  HUY: [],
};

/** Tính tổng tiền booking */
export function bookingTotals(b: { discountAmount: unknown; vatPercent: unknown; depositAmount: unknown; trips: { amount: unknown; status?: TripStatus }[] }) {
  const subtotal = b.trips.filter((t) => t.status !== TripStatus.HUY).reduce((s, t) => s + Number(t.amount), 0);
  const taxable = Math.max(0, subtotal - Number(b.discountAmount));
  const vatAmount = Math.round((taxable * Number(b.vatPercent)) / 100);
  const total = taxable + vatAmount;
  return { subtotal, vatAmount, total, remaining: total - Number(b.depositAmount) };
}

const withTotals = (b: BookingWithTrips) => ({ ...b, ...bookingTotals(b) });

/** Mã booking theo tháng giờ VN: BK2610-0001 */
function codePrefix() {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: '2-digit', month: '2-digit' }).format(new Date()).split('-');
  return `BK${y}${m}-`;
}

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ q, status, salesUserId, from, to }: BookingQueryDto) {
    const pickupFilter: Prisma.DateTimeFilter = {};
    if (from) pickupFilter.gte = new Date(`${from}T00:00:00+07:00`);
    if (to) pickupFilter.lte = new Date(`${to}T23:59:59.999+07:00`);

    const rows = await this.prisma.booking.findMany({
      where: {
        status,
        salesUserId,
        ...((from || to) && { trips: { some: { pickupTime: pickupFilter } } }),
        ...(q && {
          OR: [
            { code: { contains: q, mode: 'insensitive' } },
            { contactName: { contains: q, mode: 'insensitive' } },
            { contactPhone: { contains: q } },
            { customer: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }),
      },
      include: bookingInclude,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map(withTotals);
  }

  async findOne(id: number) {
    return withTotals(await this.prisma.booking.findUniqueOrThrow({ where: { id }, include: bookingInclude }));
  }

  async create(dto: CreateBookingDto, user: AuthUser) {
    const { trips, quoteValidUntil, ...data } = dto;
    const tripData = await this.buildTrips(trips);

    for (let attempt = 0; ; attempt++) {
      const prefix = codePrefix();
      const last = await this.prisma.booking.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: 'desc' } });
      const next = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
      try {
        const booking = await this.prisma.booking.create({
          data: {
            ...data,
            code: prefix + String(next).padStart(4, '0'),
            quoteValidUntil: quoteValidUntil ? new Date(quoteValidUntil) : null,
            salesUserId: data.salesUserId ?? (user.roles.includes(Role.KINH_DOANH) ? user.id : null),
            createdById: user.id,
            trips: { create: tripData.map(({ id: _id, ...t }) => t) },
          },
          include: bookingInclude,
        });
        return withTotals(booking);
      } catch (e) {
        // Hai người tạo booking cùng lúc bị trùng mã: thử lại với số kế tiếp
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 3) continue;
        throw e;
      }
    }
  }

  async update(id: number, dto: UpdateBookingDto) {
    const current = await this.prisma.booking.findUniqueOrThrow({ where: { id }, include: { trips: true } });
    if (current.status === BookingStatus.HOAN_THANH || current.status === BookingStatus.HUY) {
      throw new BadRequestException('Booking đã hoàn thành hoặc đã hủy, không sửa được');
    }

    const { trips, quoteValidUntil, ...data } = dto;
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.booking.update({
        where: { id },
        data: { ...data, ...(quoteValidUntil !== undefined && { quoteValidUntil: quoteValidUntil ? new Date(quoteValidUntil) : null }) },
      }),
    ];

    if (trips) {
      const tripData = await this.buildTrips(trips);
      const keepIds = new Set(tripData.filter((t) => t.id).map((t) => t.id));
      for (const t of tripData) {
        if (t.id && !current.trips.some((c) => c.id === t.id)) throw new BadRequestException('Chuyến không thuộc booking này');
      }
      const removed = current.trips.filter((t) => !keepIds.has(t.id));
      const locked = removed.find((t) => t.status !== TripStatus.CHO_DIEU && t.status !== TripStatus.HUY);
      if (locked) throw new BadRequestException(`Chuyến số ${locked.seq} đã được điều xe, không xóa được. Hãy hủy điều xe trước.`);

      if (removed.length) ops.push(this.prisma.bookingTrip.deleteMany({ where: { id: { in: removed.map((t) => t.id) } } }));
      for (const { id: tripId, ...t } of tripData) {
        ops.push(
          tripId
            ? this.prisma.bookingTrip.update({ where: { id: tripId }, data: t })
            : this.prisma.bookingTrip.create({ data: { ...t, bookingId: id } }),
        );
      }
    }

    await this.prisma.$transaction(ops);
    return this.findOne(id);
  }

  async changeStatus(id: number, { status, cancelReason }: ChangeStatusDto) {
    const booking = await this.prisma.booking.findUniqueOrThrow({ where: { id }, include: { trips: true } });
    if (!TRANSITIONS[booking.status].includes(status)) {
      throw new BadRequestException('Không thể chuyển sang trạng thái này từ trạng thái hiện tại');
    }
    if ((status === BookingStatus.BAO_GIA || status === BookingStatus.XAC_NHAN) && booking.trips.length === 0) {
      throw new BadRequestException('Booking chưa có chuyến nào');
    }
    if (status === BookingStatus.HUY && !cancelReason?.trim()) {
      throw new BadRequestException('Vui lòng nhập lý do hủy');
    }

    await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id },
        data: { status, ...(status === BookingStatus.HUY && { cancelReason: cancelReason!.trim() }) },
      }),
      ...(status === BookingStatus.HUY
        ? [this.prisma.bookingTrip.updateMany({ where: { bookingId: id }, data: { status: TripStatus.HUY } })]
        : []),
    ]);
    return this.findOne(id);
  }

  /** Kiểm tra sức chứa, tính thành tiền và giờ kết thúc cho từng chuyến */
  private async buildTrips(trips: TripDto[]) {
    const typeIds = [...new Set(trips.map((t) => t.vehicleTypeId))];
    const types = await this.prisma.vehicleType.findMany({ where: { id: { in: typeIds } }, include: { rentalRate: true } });
    const routeIds = [...new Set(trips.map((t) => t.routePriceId).filter((x): x is number => !!x))];
    const routes = await this.prisma.routePrice.findMany({ where: { id: { in: routeIds } } });

    return trips.map((t, i) => {
      const type = types.find((x) => x.id === t.vehicleTypeId);
      if (!type) throw new BadRequestException(`Chuyến ${i + 1}: loại xe không tồn tại`);
      if (t.passengers > type.maxPassengers) {
        throw new BadRequestException(`Chuyến ${i + 1}: ${t.passengers} khách vượt sức chứa ${type.name} (tối đa ${type.maxPassengers} khách)`);
      }

      const surcharges: PriceLine[] = (t.surcharges ?? []).map((s) => ({ name: s.name, amount: Number(s.amount), ...(s.auto && { auto: true }) }));
      const pickupTime = new Date(t.pickupTime);
      const days = t.days ?? 1;
      let endTime = t.endTime ? new Date(t.endTime) : null;
      if (!endTime) {
        const route = routes.find((r) => r.id === t.routePriceId);
        const hours = route
          ? (route.durationHours === null ? 2 : Number(route.durationHours))
          : (days - 1) * 24 + (type.rentalRate?.fullDayHours ?? 10);
        endTime = new Date(pickupTime.getTime() + (hours + (t.extraHours ?? 0)) * HOUR_MS);
      }
      if (endTime <= pickupTime) throw new BadRequestException(`Chuyến ${i + 1}: giờ kết thúc phải sau giờ đón`);

      return {
        id: t.id,
        seq: i + 1,
        serviceType: t.serviceType,
        pickupTime,
        endTime,
        pickupLocationId: t.pickupLocationId ?? null,
        pickupAddress: t.pickupAddress.trim(),
        dropoffLocationId: t.dropoffLocationId ?? null,
        dropoffAddress: t.dropoffAddress?.trim() || null,
        flightNumber: t.flightNumber?.trim().toUpperCase() || null,
        passengers: t.passengers,
        vehicleTypeId: t.vehicleTypeId,
        routePriceId: t.routePriceId ?? null,
        days,
        extraKm: t.extraKm ?? 0,
        extraHours: t.extraHours ?? 0,
        unitPrice: t.unitPrice,
        surcharges: surcharges as unknown as Prisma.InputJsonValue,
        amount: t.unitPrice + sumLines(surcharges),
        estimatedCost: t.estimatedCost ?? null,
        itinerary: t.itinerary || null,
        notes: t.notes || null,
      };
    });
  }
}
