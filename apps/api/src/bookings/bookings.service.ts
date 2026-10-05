import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus, Prisma, Role, TripStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { PriceLine, sumLines } from '../pricing/pricing.service';
import { BookingQueryDto, ChangeStatusDto, CreateBookingDto, PassengerDto, TripDto, UpdateBookingDto } from './bookings.dto';

const HOUR_MS = 3_600_000;
const TZ = 'Asia/Ho_Chi_Minh';

const bookingInclude = {
  customer: { select: { id: true, name: true, type: true, phone: true, email: true, taxCode: true, address: true } },
  salesUser: { select: { id: true, fullName: true, phone: true } },
  createdBy: { select: { id: true, fullName: true, phone: true } },
  passengers: { orderBy: { seq: 'asc' } },
  payments: { orderBy: [{ paidAt: 'asc' }, { id: 'asc' }], include: { createdBy: { select: { id: true, fullName: true } } } },
  trips: {
    orderBy: { seq: 'asc' },
    include: {
      vehicleType: { select: { id: true, code: true, name: true, seats: true, maxPassengers: true, names: true } },
      routePrice: { select: { id: true, name: true } },
      service: { select: { code: true, name: true, color: true, pricingMode: true, hasFlight: true, names: true } },
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
  // Mở lại booking đã hoàn thành (cần thêm chuyến / điều xe lại)
  HOAN_THANH: ['XAC_NHAN'],
  HUY: [],
};

/** Tính tổng tiền booking */
export function bookingTotals(b: {
  discountAmount: unknown;
  vatPercent: unknown;
  depositAmount: unknown;
  trips: { amount: unknown; status?: TripStatus }[];
  payments?: { amount: unknown }[];
}) {
  const subtotal = b.trips.filter((t) => t.status !== TripStatus.HUY).reduce((s, t) => s + Number(t.amount), 0);
  const taxable = Math.max(0, subtotal - Number(b.discountAmount));
  const vatAmount = Math.round((taxable * Number(b.vatPercent)) / 100);
  const total = taxable + vatAmount;
  const paid = (b.payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  // remaining: còn lại sau đặt cọc (in trên báo giá); balance: còn phải thu thực tế
  return { subtotal, vatAmount, total, remaining: total - Number(b.depositAmount), paid, balance: total - paid };
}

const withTotals = (b: BookingWithTrips) => ({ ...b, ...bookingTotals(b) });

/** Chuẩn hóa danh sách hành khách trước khi lưu */
const passengerRows = (list: PassengerDto[]) =>
  list.map((p, i) => ({
    seq: i + 1,
    fullName: p.fullName.trim(),
    gender: p.gender ?? null,
    birthYear: p.birthYear ?? null,
    idNumber: p.idNumber?.trim() || null,
    nationality: p.nationality?.trim() || null,
    phone: p.phone?.trim() || null,
    note: p.note?.trim() || null,
  }));

/**
 * Mã booking: VNECAR + năm tháng ngày đi (YYMMDD, giờ VN) + "-" + số thứ tự.
 * Số thứ tự chạy liên tục trong cả năm (của ngày đi), sang năm mới đánh lại từ 1.
 * Ví dụ: VNECAR261004-0015. Ngày đi = giờ đón sớm nhất; chưa có chuyến thì lấy ngày tạo.
 */
export const BOOKING_CODE_PREFIX = 'VNECAR';

export function bookingDatePart(pickupTimes: Date[]) {
  const first = pickupTimes.length ? new Date(Math.min(...pickupTimes.map((d) => d.getTime()))) : new Date();
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: '2-digit', month: '2-digit', day: '2-digit' }).format(first).split('-');
  return `${y}${m}${d}`;
}

export const formatBookingCode = (datePart: string, seq: number) => `${BOOKING_CODE_PREFIX}${datePart}-${String(seq).padStart(4, '0')}`;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /** "08:30 05/10" giờ Việt Nam */
  private when(d: Date) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.hour}:${p.minute} ${p.day}/${p.month}`;
  }

  async findAll({ q, status, salesUserId, from, to, customerId, source, serviceType, vehicleTypeId, createdFrom, createdTo, payment }: BookingQueryDto) {
    const pickupFilter: Prisma.DateTimeFilter = {};
    if (from) pickupFilter.gte = new Date(`${from}T00:00:00+07:00`);
    if (to) pickupFilter.lte = new Date(`${to}T23:59:59.999+07:00`);
    const createdFilter: Prisma.DateTimeFilter = {};
    if (createdFrom) createdFilter.gte = new Date(`${createdFrom}T00:00:00+07:00`);
    if (createdTo) createdFilter.lte = new Date(`${createdTo}T23:59:59.999+07:00`);
    // Điều kiện trên chuyến (ngày đi, dịch vụ, loại xe) phải cùng thỏa trên một chuyến
    const tripWhere: Prisma.BookingTripWhereInput = {
      ...((from || to) && { pickupTime: pickupFilter }),
      ...(serviceType && { serviceType }),
      ...(vehicleTypeId && { vehicleTypeId }),
    };

    const rows = await this.prisma.booking.findMany({
      where: {
        ...(status?.length && { status: { in: status } }),
        salesUserId,
        customerId,
        source,
        ...((createdFrom || createdTo) && { createdAt: createdFilter }),
        ...(Object.keys(tripWhere).length && { trips: { some: tripWhere } }),
        ...(q && {
          OR: [
            { code: { contains: q, mode: 'insensitive' } },
            { customerRef: { contains: q, mode: 'insensitive' } },
            { contactName: { contains: q, mode: 'insensitive' } },
            { contactPhone: { contains: q } },
            { customer: { name: { contains: q, mode: 'insensitive' } } },
            // Tìm theo hành trình: điểm đón / điểm trả của chuyến
            { trips: { some: { pickupAddress: { contains: q, mode: 'insensitive' } } } },
            { trips: { some: { dropoffAddress: { contains: q, mode: 'insensitive' } } } },
            { trips: { some: { itinerary: { contains: q, mode: 'insensitive' } } } },
            // Tìm theo số hiệu chuyến bay đón / tiễn
            { trips: { some: { flightNumber: { contains: q, mode: 'insensitive' } } } },
            { trips: { some: { departureFlight: { contains: q, mode: 'insensitive' } } } },
          ],
        }),
      },
      include: bookingInclude,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const list = rows.map(withTotals);
    if (!payment) return list;
    // Tình trạng thu tiền tính từ tổng tiền & đã thu (giống trang Công nợ); booking hủy không tính nợ
    return list.filter((b) => {
      const unpriced = b.total <= 0 && b.paid <= 0;
      switch (payment) {
        case 'CHUA_GIA':
          return unpriced && b.status !== BookingStatus.HUY;
        case 'CHUA_THU':
          return b.status !== BookingStatus.HUY && b.total > 0 && b.paid <= 0;
        case 'MOT_PHAN':
          return b.paid > 0 && b.paid < b.total;
        case 'DU':
          return b.total > 0 && b.paid >= b.total;
        case 'CON_NO':
          return b.status !== BookingStatus.HUY && (b.balance > 0 || unpriced);
      }
    });
  }

  async findOne(id: number) {
    return withTotals(await this.prisma.booking.findUniqueOrThrow({ where: { id }, include: bookingInclude }));
  }

  /** Nguồn khách phải có trong danh mục Nguồn khách */
  private async checkSource(code?: string) {
    if (code && !(await this.prisma.customerSource.findUnique({ where: { code } }))) {
      throw new BadRequestException('Nguồn khách không có trong danh mục, hãy chọn lại');
    }
  }

  /** Lệnh điều xe tạo nhanh ở mục Điều xe: booking đã xác nhận, đúng 1 chuyến, sẵn sàng điều xe */
  createQuickDispatch(dto: CreateBookingDto, user: AuthUser) {
    if (dto.trips?.length !== 1) throw new BadRequestException('Lệnh điều xe phải có đúng 1 chuyến');
    return this.create({ ...dto, internalNotes: dto.internalNotes ?? 'Lệnh điều xe tạo nhanh tại mục Điều xe' }, user, BookingStatus.XAC_NHAN);
  }

  /** Booking khác (chưa hủy) đang dùng mã booking của khách này; không phân biệt hoa thường / khoảng trắng */
  async findCustomerRef(ref: string | null | undefined, excludeId?: number) {
    const value = ref?.trim();
    if (!value) return null;
    return this.prisma.booking.findFirst({
      where: { customerRef: { equals: value, mode: 'insensitive' }, status: { not: BookingStatus.HUY }, ...(excludeId && { id: { not: excludeId } }) },
      select: { id: true, code: true, status: true, contactName: true, customer: { select: { name: true } } },
    });
  }

  private async checkCustomerRef(ref: string | null | undefined, excludeId?: number) {
    const dup = await this.findCustomerRef(ref, excludeId);
    if (dup) {
      throw new BadRequestException(
        `Mã booking của khách "${ref!.trim()}" đã có ở booking ${dup.code} (${dup.customer?.name ?? dup.contactName}). Không lưu booking trùng mã.`,
      );
    }
  }

  async create(dto: CreateBookingDto, user: AuthUser, status: BookingStatus = BookingStatus.NHAP) {
    await this.checkSource(dto.source);
    await this.checkCustomerRef(dto.customerRef);
    const { trips, passengers, quoteValidUntil, ...data } = dto;
    const tripData = await this.buildTrips(trips);

    const datePart = bookingDatePart(tripData.map((t) => t.pickupTime));
    for (let attempt = 0; ; attempt++) {
      // Số lớn nhất đã dùng trong năm của ngày đi (2 số đầu của phần ngày)
      const [{ max }] = await this.prisma.$queryRaw<{ max: number | null }[]>`
        SELECT MAX(CAST(split_part(code, '-', 2) AS INTEGER)) AS max FROM "Booking"
        WHERE code ~ ${`^${BOOKING_CODE_PREFIX}${datePart.slice(0, 2)}[0-9]{4}-[0-9]+$`}`;
      const next = (max ?? 0) + 1;
      try {
        const booking = await this.prisma.booking.create({
          data: {
            ...data,
            code: formatBookingCode(datePart, next),
            status,
            quoteValidUntil: quoteValidUntil ? new Date(quoteValidUntil) : null,
            salesUserId: data.salesUserId ?? (user.roles.includes(Role.KINH_DOANH) ? user.id : null),
            createdById: user.id,
            trips: { create: tripData.map(({ id: _id, ...t }) => t) },
            ...(passengers?.length && { passengers: { create: passengerRows(passengers) } }),
          },
          include: bookingInclude,
        });
        // Booking mới (không tính lệnh điều xe tạo nhanh): báo Admin, Điều hành
        if (status === BookingStatus.NHAP) {
          const first = booking.trips[0];
          await this.push.notifyRoles(
            [Role.ADMIN, Role.DIEU_HANH],
            {
              type: 'BOOKING_NEW',
              title: `Booking mới ${booking.code}`,
              body: [booking.customer?.name ?? booking.contactName, first && `đi ${this.when(first.pickupTime)}`, `${booking.trips.length} chuyến`, `${user.fullName} tạo`].filter(Boolean).join(' · '),
              link: `/bookings/${booking.id}`,
            },
            { exclude: user.id },
          );
        }
        return withTotals(booking);
      } catch (e) {
        // Hai người tạo booking cùng lúc bị trùng mã: thử lại với số kế tiếp
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 3) continue;
        throw e;
      }
    }
  }

  async update(id: number, dto: UpdateBookingDto) {
    await this.checkSource(dto.source);
    if (dto.customerRef) await this.checkCustomerRef(dto.customerRef, id);
    const current = await this.prisma.booking.findUniqueOrThrow({ where: { id }, include: { trips: true } });
    // Booking đã hoàn thành vẫn sửa được (điều chỉnh giá, thông tin sau chuyến); chỉ khóa booking đã hủy
    if (current.status === BookingStatus.HUY) {
      throw new BadRequestException('Booking đã hủy, không sửa được');
    }

    const { trips, passengers, quoteValidUntil, ...data } = dto;
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

    if (passengers) {
      // Thay toàn bộ danh sách hành khách
      ops.push(this.prisma.bookingPassenger.deleteMany({ where: { bookingId: id } }));
      if (passengers.length) ops.push(this.prisma.bookingPassenger.createMany({ data: passengerRows(passengers).map((p) => ({ ...p, bookingId: id })) }));
    }

    await this.prisma.$transaction(ops);

    // Báo lái xe khi chuyến đã giao bị đổi giờ / điểm đón / điểm trả, hoặc văn phòng nhờ thu tiền
    if (trips) {
      const after = await this.prisma.bookingTrip.findMany({ where: { bookingId: id, OR: [{ driverId: { not: null } }, { partnerId: { not: null } }], status: { not: TripStatus.HUY } } });
      for (const t of after) {
        const before = current.trips.find((c) => c.id === t.id);
        if (!before || before.driverId !== t.driverId || before.partnerId !== t.partnerId) continue;
        const changes = [
          before.pickupTime.getTime() !== t.pickupTime.getTime() && `giờ đón ${this.when(before.pickupTime)} → ${this.when(t.pickupTime)}`,
          before.pickupAddress !== t.pickupAddress && `điểm đón: ${t.pickupAddress}`,
          (before.dropoffAddress ?? '') !== (t.dropoffAddress ?? '') && `điểm trả: ${t.dropoffAddress ?? '—'}`,
        ].filter(Boolean);
        if (changes.length) {
          await this.push.notifyDriver(t.driverId, `Chuyến ${current.code} thay đổi`, changes.join(' · '), { tripId: t.id }, 'TRIP_CHANGED');
          await this.push.notifyPartner(t.partnerId, { type: 'PARTNER_TRIP_CHANGED', title: `Chuyến ${current.code} thay đổi`, body: changes.join(' · '), tripId: t.id });
        }
        if (t.collectAmount && !t.collectedAt && Number(t.collectAmount) !== Number(before.collectAmount ?? 0)) {
          await this.push.notifyDriver(
            t.driverId,
            'Văn phòng nhờ thu tiền khách',
            `${Number(t.collectAmount).toLocaleString('vi-VN')}đ · chuyến ${this.when(t.pickupTime)}${t.collectNote ? ` · ${t.collectNote}` : ''}`,
            { tripId: t.id },
            'COLLECT_REQUEST',
          );
        }
      }
    }
    return this.findOne(id);
  }

  async changeStatus(id: number, { status, cancelReason }: ChangeStatusDto, user?: AuthUser) {
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

    // Khách xác nhận (không tính mở lại booking đã hoàn thành): báo Điều hành để xếp xe
    if (status === BookingStatus.XAC_NHAN && booking.status !== BookingStatus.HOAN_THANH) {
      const first = [...booking.trips].sort((a, b) => a.pickupTime.getTime() - b.pickupTime.getTime())[0];
      await this.push.notifyRoles(
        [Role.ADMIN, Role.DIEU_HANH],
        {
          type: 'BOOKING_CONFIRMED',
          title: `Khách xác nhận ${booking.code} – cần điều xe`,
          body: [booking.contactName, first && `đi ${this.when(first.pickupTime)}`, `${booking.trips.length} chuyến`].filter(Boolean).join(' · '),
          link: `/bookings/${id}`,
        },
        { exclude: user?.id },
      );
    }
    // Hủy booking: báo các lái xe đã được giao chuyến
    if (status === BookingStatus.HUY) {
      for (const t of booking.trips.filter((x) => (x.driverId || x.partnerId) && x.status !== TripStatus.HUY && x.status !== TripStatus.HOAN_THANH)) {
        await this.push.notifyDriver(t.driverId, `Chuyến ${booking.code} đã hủy`, `${this.when(t.pickupTime)} · ${t.pickupAddress}`, { tripId: t.id }, 'TRIP_CANCELLED');
        await this.push.notifyPartner(t.partnerId, { type: 'PARTNER_TRIP_CANCELLED', title: `Chuyến ${booking.code} đã hủy`, body: `${this.when(t.pickupTime)} · ${t.pickupAddress}`, tripId: t.id });
      }
    }
    return this.findOne(id);
  }

  /** Kiểm tra sức chứa, tính thành tiền và giờ kết thúc cho từng chuyến */
  private async buildTrips(trips: TripDto[]) {
    const typeIds = [...new Set(trips.map((t) => t.vehicleTypeId))];
    const types = await this.prisma.vehicleType.findMany({ where: { id: { in: typeIds } }, include: { rentalRate: true } });
    const routeIds = [...new Set(trips.map((t) => t.routePriceId).filter((x): x is number => !!x))];
    const routes = await this.prisma.routePrice.findMany({ where: { id: { in: routeIds } } });
    const services = await this.prisma.service.findMany({ where: { code: { in: [...new Set(trips.map((t) => t.serviceType))] } } });

    return trips.map((t, i) => {
      const service = services.find((s) => s.code === t.serviceType);
      if (!service) throw new BadRequestException(`Chuyến ${i + 1}: dịch vụ không tồn tại`);
      if (!service.isActive && !t.id) throw new BadRequestException(`Chuyến ${i + 1}: dịch vụ "${service.name}" đã ngừng sử dụng`);
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
        // Có tuyến: theo giờ chạy của tuyến. Dịch vụ thuê theo ngày: theo số ngày thuê. Còn lại: mặc định 2 giờ
        const hours = route
          ? (route.durationHours === null ? 2 : Number(route.durationHours))
          : service.pricingMode === 'THEO_NGAY'
            ? (days - 1) * 24 + (type.rentalRate?.fullDayHours ?? 10)
            : 2;
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
        departureFlight: t.departureFlight?.trim().toUpperCase() || null,
        collectAmount: t.collectAmount ? t.collectAmount : null,
        collectNote: t.collectNote?.trim() || null,
        partnerInvoice: !!t.partnerInvoice,
        partnerInvoiceNote: t.partnerInvoice ? t.partnerInvoiceNote?.trim() || null : null,
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
