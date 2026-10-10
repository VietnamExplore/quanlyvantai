import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus, Prisma, Role, TripStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { PriceLine, sumLines } from '../pricing/pricing.service';
import { ACTIVE_SEAT, ShuttleService } from '../shuttle/shuttle.service';
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
      shuttleRun: { select: { id: true, departAt: true, routeId: true, status: true, route: { select: { name: true } } } },
      shuttlePickupStop: { select: { id: true, name: true, kind: true } },
      shuttleDropoffStop: { select: { id: true, name: true, kind: true } },
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
  // taxable: thành tiền chưa thuế (sau giảm giá) – dùng tính doanh thu, doanh số; total: khách phải trả (gồm thuế)
  return { subtotal, taxable, vatAmount, total, remaining: total - Number(b.depositAmount), paid, balance: total - paid };
}

const withTotals = (b: BookingWithTrips) => ({ ...b, ...bookingTotals(b) });

/** Không lấy hóa đơn: thuế suất 0 và bỏ thông tin xuất hóa đơn */
function normalizeInvoice<T extends { invoiceRequired?: boolean; vatPercent?: number; invoiceCompany?: string | null; invoiceTaxCode?: string | null; invoiceAddress?: string | null; invoiceEmail?: string | null }>(dto: T): T {
  if (dto.invoiceRequired !== false) return dto;
  return { ...dto, vatPercent: 0, invoiceCompany: null, invoiceTaxCode: null, invoiceAddress: null, invoiceEmail: null };
}

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
    private readonly shuttle: ShuttleService,
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
    const { trips, passengers, knownPassengerIds: _known, quoteValidUntil, ...data } = normalizeInvoice(dto);
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
        // Xe ghép: lượt đặt mới nhận xe đã điều của chuyến ghép, chia lại chi phí
        await this.shuttle.syncRuns(booking.trips.map((t) => t.shuttleRunId));
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

    const { trips, passengers, knownPassengerIds, quoteValidUntil, ...data } = normalizeInvoice(dto);
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.booking.update({
        where: { id },
        data: { ...data, ...(quoteValidUntil !== undefined && { quoteValidUntil: quoteValidUntil ? new Date(quoteValidUntil) : null }) },
      }),
    ];

    if (trips) {
      const tripData = await this.buildTrips(trips, current);
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
      // Thay toàn bộ danh sách hành khách; giữ dấu "lái xe thêm" của các dòng cũ và
      // giữ các hành khách lái xe vừa thêm trên app trong lúc văn phòng đang sửa booking
      const existing = await this.prisma.bookingPassenger.findMany({ where: { bookingId: id }, orderBy: { seq: 'asc' } });
      const byId = new Map(existing.map((p) => [p.id, p]));
      const known = knownPassengerIds ? new Set(knownPassengerIds) : null;
      const added = known ? existing.filter((p) => !known.has(p.id)) : [];
      const rows = [
        ...passengerRows(passengers).map((p, i) => {
          const old = passengers[i].id ? byId.get(passengers[i].id!) : undefined;
          return { ...p, addedByDriverId: old?.addedByDriverId ?? null, addedByName: old?.addedByName ?? null, addedAt: old?.addedAt ?? null };
        }),
        ...added.map(({ id: _id, bookingId: _b, ...p }) => p),
      ].map((p, i) => ({ ...p, seq: i + 1, bookingId: id }));
      ops.push(this.prisma.bookingPassenger.deleteMany({ where: { bookingId: id } }));
      if (rows.length) ops.push(this.prisma.bookingPassenger.createMany({ data: rows }));
    }

    await this.prisma.$transaction(ops);
    // Đổi ngày đi: mã booking đổi phần ngày theo chuyến sớm nhất, giữ nguyên số thứ tự
    if (trips) await this.syncCodeDate(id, current.code);
    // Xe ghép: đồng bộ chuyến ghép cũ và mới (ghế, xe đã điều, chia chi phí)
    if (trips) {
      const after = await this.prisma.bookingTrip.findMany({ where: { bookingId: id }, select: { shuttleRunId: true } });
      await this.shuttle.syncRuns([...current.trips.map((t) => t.shuttleRunId), ...after.map((t) => t.shuttleRunId)]);
    }

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

  /**
   * Mã booking theo ngày đi: VNECAR + YYMMDD (chuyến sớm nhất chưa hủy) + số thứ tự.
   * Sửa ngày đi thì đổi phần ngày, giữ nguyên số thứ tự. Riêng khi đổi sang năm khác mà số thứ tự đó
   * đã có booking cùng ngày dùng (số thứ tự đánh lại theo năm), lấy số kế tiếp của năm mới để không trùng mã.
   */
  private async syncCodeDate(id: number, code: string) {
    const m = new RegExp(`^${BOOKING_CODE_PREFIX}(\\d{6})-(\\d+)$`).exec(code);
    if (!m) return; // mã kiểu cũ / nhập tay: giữ nguyên
    const trips = await this.prisma.bookingTrip.findMany({ where: { bookingId: id }, select: { pickupTime: true, status: true } });
    const active = trips.filter((t) => t.status !== TripStatus.HUY);
    const datePart = bookingDatePart((active.length ? active : trips).map((t) => t.pickupTime));
    if (!trips.length || datePart === m[1]) return;
    let next = formatBookingCode(datePart, Number(m[2]));
    if (datePart.slice(0, 2) !== m[1].slice(0, 2)) {
      const clash = await this.prisma.booking.findUnique({ where: { code: next }, select: { id: true } });
      if (clash) {
        const [{ max }] = await this.prisma.$queryRaw<{ max: number | null }[]>`
          SELECT MAX(CAST(split_part(code, '-', 2) AS INTEGER)) AS max FROM "Booking"
          WHERE code ~ ${`^${BOOKING_CODE_PREFIX}${datePart.slice(0, 2)}[0-9]{4}-[0-9]+$`}`;
        next = formatBookingCode(datePart, (max ?? 0) + 1);
      }
    }
    try {
      await this.prisma.booking.update({ where: { id }, data: { code: next } });
    } catch (e) {
      // Trùng mã (hai người cùng sửa): giữ mã cũ, không làm hỏng việc lưu booking
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
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

    await this.shuttle.syncRuns(booking.trips.map((t) => t.shuttleRunId));

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

  /**
   * Lượt đặt xe ghép: kiểm tra chuyến còn bán, đủ ghế, điểm đón / trả thuộc tuyến;
   * giờ đón = giờ xuất bến + giờ lệch của điểm đón, loại xe theo chuyến.
   */
  private async shuttleTrips(trips: TripDto[], current?: { id: number; trips: { id: number; shuttleRunId: number | null; passengers: number; status: TripStatus }[] }) {
    const out = new Map<number, { pickupTime: Date; endTime: Date; vehicleTypeId: number; reset: boolean }>();
    const runIds = [...new Set(trips.map((t) => t.shuttleRunId).filter((x): x is number => !!x))];
    for (const runId of runIds) {
      const { run } = await this.shuttle.seatCheck(runId);
      // Ghế đã dùng bởi booking khác (các lượt của booking này tính lại theo dữ liệu đang lưu)
      const used = await this.prisma.bookingTrip.aggregate({
        where: { shuttleRunId: runId, ...ACTIVE_SEAT, ...(current && { bookingId: { not: current.id } }) },
        _sum: { passengers: true },
      });
      const mine = trips.filter((t) => t.shuttleRunId === runId);
      const need = mine.reduce((s, t) => s + t.passengers, 0);
      const before = current?.trips.filter((t) => t.shuttleRunId === runId && t.status !== TripStatus.HUY).reduce((s, t) => s + t.passengers, 0) ?? 0;
      const label = `Chuyến xe ghép ${run.route.name} ${this.when(run.departAt)}`;
      if (run.status === 'HUY') throw new BadRequestException(`${label} đã hủy`);
      // Chuyến đóng bán: chỉ giữ / giảm số khách đã đặt, không nhận thêm
      if (run.status === 'DONG_BAN' && need > before) throw new BadRequestException(`${label} đã đóng bán`);
      const left = run.capacity - (used._sum.passengers ?? 0);
      if (need > left) throw new BadRequestException(`${label} chỉ còn ${Math.max(0, left)} ghế`);
      for (const t of mine) {
        const pick = run.route.stops.find((s) => s.id === t.shuttlePickupStopId);
        const drop = run.route.stops.find((s) => s.id === t.shuttleDropoffStopId);
        if (!pick || !pick.canPickup) throw new BadRequestException(`${label}: chọn điểm đón của tuyến`);
        if (!drop || !drop.canDropoff) throw new BadRequestException(`${label}: chọn điểm trả của tuyến`);
        if (drop.seq <= pick.seq) throw new BadRequestException(`${label}: điểm trả phải sau điểm đón trên tuyến`);
        if ((t.childCount ?? 0) > t.passengers) throw new BadRequestException(`${label}: số trẻ em lớn hơn số khách`);
        const old = t.id ? current?.trips.find((c) => c.id === t.id) : undefined;
        // Chuyển lượt đặt sang chuyến ghép khác: bỏ xe đã điều của chuyến cũ (chuyến đã chạy thì không chuyển được)
        const moved = !!old && old.shuttleRunId !== runId;
        if (moved && !([TripStatus.CHO_DIEU, TripStatus.DA_GAN, TripStatus.TAI_XE_NHAN] as TripStatus[]).includes(old.status)) {
          throw new BadRequestException(`${label}: lượt đặt đã chạy, không chuyển chuyến được`);
        }
        const endOffset = drop.offsetMinutes > pick.offsetMinutes ? drop.offsetMinutes : run.route.durationMinutes;
        out.set(trips.indexOf(t), {
          pickupTime: new Date(run.departAt.getTime() + pick.offsetMinutes * 60_000),
          endTime: new Date(run.departAt.getTime() + Math.max(endOffset, pick.offsetMinutes + 15) * 60_000),
          vehicleTypeId: run.vehicleTypeId,
          reset: moved && old.status !== TripStatus.CHO_DIEU,
        });
      }
    }
    return out;
  }

  /** Kiểm tra sức chứa, tính thành tiền và giờ kết thúc cho từng chuyến */
  private async buildTrips(trips: TripDto[], current?: { id: number; trips: { id: number; shuttleRunId: number | null; passengers: number; status: TripStatus }[] }) {
    const typeIds = [...new Set(trips.map((t) => t.vehicleTypeId))];
    const types = await this.prisma.vehicleType.findMany({ where: { id: { in: typeIds } }, include: { rentalRate: true } });
    const routeIds = [...new Set(trips.map((t) => t.routePriceId).filter((x): x is number => !!x))];
    const routes = await this.prisma.routePrice.findMany({ where: { id: { in: routeIds } } });
    const services = await this.prisma.service.findMany({ where: { code: { in: [...new Set(trips.map((t) => t.serviceType))] } } });
    for (const [i, t] of trips.entries()) {
      const service = services.find((s) => s.code === t.serviceType);
      if (service?.pricingMode === 'XE_GHEP' && !t.shuttleRunId) throw new BadRequestException(`Chuyến ${i + 1}: chọn chuyến xe ghép (tuyến, ngày, giờ chạy)`);
      if (service && service.pricingMode !== 'XE_GHEP') t.shuttleRunId = null;
    }
    const shuttle = await this.shuttleTrips(trips, current);

    return trips.map((t, i) => {
      const service = services.find((s) => s.code === t.serviceType);
      if (!service) throw new BadRequestException(`Chuyến ${i + 1}: dịch vụ không tồn tại`);
      if (!service.isActive && !t.id) throw new BadRequestException(`Chuyến ${i + 1}: dịch vụ "${service.name}" đã ngừng sử dụng`);
      const sh = shuttle.get(i);
      if (sh) t.vehicleTypeId = sh.vehicleTypeId;
      const type = types.find((x) => x.id === t.vehicleTypeId) ?? null;
      if (!type && !sh) throw new BadRequestException(`Chuyến ${i + 1}: loại xe không tồn tại`);
      // Xe ghép: sức chứa theo số ghế của chuyến ghép (đã kiểm tra ở trên)
      if (type && !sh && t.passengers > type.maxPassengers) {
        throw new BadRequestException(`Chuyến ${i + 1}: ${t.passengers} khách vượt sức chứa ${type.name} (tối đa ${type.maxPassengers} khách)`);
      }

      const surcharges: PriceLine[] = (t.surcharges ?? []).map((s) => ({ name: s.name, amount: Number(s.amount), ...(s.auto && { auto: true }) }));
      const pickupTime = sh ? sh.pickupTime : new Date(t.pickupTime);
      const days = t.days ?? 1;
      let endTime = sh ? sh.endTime : t.endTime ? new Date(t.endTime) : null;
      if (!endTime) {
        const route = routes.find((r) => r.id === t.routePriceId);
        // Có tuyến: theo giờ chạy của tuyến. Dịch vụ thuê theo ngày: theo số ngày thuê. Còn lại: mặc định 2 giờ
        const hours = route
          ? (route.durationHours === null ? 2 : Number(route.durationHours))
          : service.pricingMode === 'THEO_NGAY'
            ? (days - 1) * 24 + (type?.rentalRate?.fullDayHours ?? 10)
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
        partnerVatPercent: t.partnerInvoice ? (t.partnerVatPercent ?? 0) : 0,
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
        shuttleRunId: sh ? t.shuttleRunId! : null,
        shuttlePickupStopId: sh ? t.shuttlePickupStopId! : null,
        shuttleDropoffStopId: sh ? t.shuttleDropoffStopId! : null,
        childCount: sh ? (t.childCount ?? 0) : 0,
        // Chuyển sang chuyến ghép khác: bỏ xe đã điều của chuyến cũ, chuyến mới sẽ tự gán khi đồng bộ
        ...(sh?.reset && {
          status: TripStatus.CHO_DIEU,
          vehicleId: null,
          driverId: null,
          partnerId: null,
          partnerCost: null,
          partnerPlate: null,
          partnerDriverName: null,
          partnerDriverPhone: null,
          assignedAt: null,
        }),
      };
    });
  }
}
