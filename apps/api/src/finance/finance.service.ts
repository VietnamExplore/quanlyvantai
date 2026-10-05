import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { BookingStatus, Ownership, Prisma, TripStatus, VoucherType } from '@prisma/client';
import { AuthUser } from '../auth/auth.decorators';
import { bookingTotals } from '../bookings/bookings.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_COST_CATEGORIES, partnerPayable } from './cost.util';
import { CreatePartnerPaymentDto, CreatePaymentDto, CreateTripCostDto, CreateVoucherDto, UpdateVoucherDto } from './finance.dto';

const TZ = 'Asia/Ho_Chi_Minh';
const DAY_MS = 86_400_000;
const BILLABLE: BookingStatus[] = [BookingStatus.XAC_NHAN, BookingStatus.HOAN_THANH];

const vnYmd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const startOfVnDay = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);
/** Ngày dạng "YYYY-MM-DD" -> Date lưu cột @db.Date */
const dateOnly = (ymd?: string) => new Date(`${(ymd ?? vnYmd(new Date())).slice(0, 10)}T00:00:00Z`);

/** "Nguyễn Văn A" -> "NGUYEN_VAN_A" */
export function codeFromName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

const VOUCHER_INCLUDE = {
  category: { select: { name: true } },
  vehicle: { select: { plateNumber: true, ownership: true } },
  partner: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  driver: { select: { fullName: true } },
} satisfies Prisma.CashVoucherInclude;

@Injectable()
export class FinanceService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  /** Lần đầu chạy: tạo sẵn các loại chi phí thông dụng */
  async onModuleInit() {
    if ((await this.prisma.costCategory.count()) === 0) {
      await this.prisma.costCategory.createMany({ data: DEFAULT_COST_CATEGORIES, skipDuplicates: true });
    }
  }

  async createCategory(name: string, code?: string, sortOrder?: number, driverVisible?: boolean) {
    const base = code || codeFromName(name);
    if (!base) throw new BadRequestException('Không tạo được mã từ tên, hãy nhập mã');
    let finalCode = base;
    for (let i = 2; await this.prisma.costCategory.findUnique({ where: { code: finalCode } }); i++) finalCode = `${base.slice(0, 36)}_${i}`;
    const max = await this.prisma.costCategory.aggregate({ _max: { sortOrder: true } });
    return this.prisma.costCategory.create({ data: { code: finalCode, name, sortOrder: sortOrder ?? (max._max.sortOrder ?? 0) + 1, driverVisible } });
  }

  // ───── Chi phí chuyến ─────

  tripCosts(tripId: number) {
    return this.prisma.tripCost.findMany({
      where: { tripId },
      include: { category: { select: { name: true } }, createdBy: { select: { fullName: true } } },
      orderBy: [{ spentAt: 'asc' }, { id: 'asc' }],
    });
  }

  async addTripCost(tripId: number, dto: CreateTripCostDto, user: AuthUser, byDriver = false) {
    const trip = await this.prisma.bookingTrip.findUniqueOrThrow({ where: { id: tripId } });
    if (trip.status === TripStatus.HUY) throw new BadRequestException('Chuyến đã hủy');
    const category = await this.prisma.costCategory.findUnique({ where: { code: dto.categoryCode } });
    if (!category || !category.isActive) throw new BadRequestException('Loại chi phí không tồn tại hoặc đã ngừng dùng');
    if (byDriver && !category.driverVisible) throw new BadRequestException('Loại chi phí này do văn phòng nhập, lái xe không nhập trên app');
    await this.prisma.tripCost.create({
      data: {
        tripId,
        categoryCode: dto.categoryCode,
        amount: dto.amount,
        spentAt: dateOnly(dto.spentAt),
        note: dto.note?.trim() || null,
        byDriver,
        createdById: user.id,
      },
    });
    return this.tripCosts(tripId);
  }

  // ───── Thu tiền khách ─────

  async addPayment(bookingId: number, dto: CreatePaymentDto, user: AuthUser) {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { trips: { select: { amount: true, status: true } }, payments: { select: { amount: true } } },
    });
    const { total, paid, balance } = bookingTotals(booking);
    const vnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;
    // Thu tiền: không vượt số còn phải thu (booking chưa nhập giá thì vẫn cho thu trước)
    if (dto.amount > 0 && total > 0 && dto.amount > balance) {
      throw new BadRequestException(balance > 0 ? `Số tiền thu vượt số còn phải thu (${vnd(balance)})` : 'Booking đã thu đủ tiền');
    }
    // Hoàn tiền: không quá số khách đã trả
    if (dto.amount < 0 && -dto.amount > paid) {
      throw new BadRequestException(`Số tiền hoàn vượt số khách đã trả (${vnd(paid)})`);
    }
    return this.prisma.payment.create({
      data: {
        bookingId,
        amount: dto.amount,
        method: dto.method,
        paidAt: dateOnly(dto.paidAt),
        reference: dto.reference?.trim() || null,
        note: dto.note?.trim() || null,
        createdById: user.id,
      },
    });
  }

  // ───── Thanh toán nhà xe ─────

  async addPartnerPayment(partnerId: number, dto: CreatePartnerPaymentDto, user: AuthUser) {
    await this.prisma.partner.findUniqueOrThrow({ where: { id: partnerId } });
    return this.prisma.partnerPayment.create({
      data: {
        partnerId,
        amount: dto.amount,
        method: dto.method,
        paidAt: dateOnly(dto.paidAt),
        reference: dto.reference?.trim() || null,
        note: dto.note?.trim() || null,
        createdById: user.id,
      },
    });
  }

  // ───── Công nợ khách hàng ─────

  /** salesUserId: chỉ tính booking của nhân viên kinh doanh này */
  async receivables(salesUserId?: number) {
    const bookings = await this.prisma.booking.findMany({
      where: { status: { in: BILLABLE }, ...(salesUserId && { salesUserId }) },
      include: {
        customer: { select: { id: true, name: true, phone: true, type: true, creditLimit: true, paymentTermDays: true } },
        trips: { select: { amount: true, status: true, endTime: true, pickupTime: true } },
        payments: { select: { amount: true } },
        salesUser: { select: { fullName: true } },
      },
    });

    const today = startOfVnDay(vnYmd(new Date())).getTime();
    type Group = {
      key: string;
      customerId: number | null;
      name: string;
      phone: string | null;
      customerType: string;
      creditLimit: number | null;
      totalNet: number;
      totalVat: number;
      totalBilled: number;
      totalPaid: number;
      balance: number;
      overdue: number;
      maxOverdueDays: number;
      /** Số booking chưa nhập giá (tổng 0 đ, chưa thu): vẫn coi là còn nợ */
      unpriced: number;
      bookings: unknown[];
    };
    const groups = new Map<string, Group>();

    for (const b of bookings) {
      // Hiện cả booking đã thanh toán đủ để xem được lịch sử công nợ của mọi khách có booking
      const t = bookingTotals(b);
      const activeTrips = b.trips.filter((x) => x.status !== TripStatus.HUY);
      const lastEnd = activeTrips.reduce((m, x) => Math.max(m, x.endTime.getTime()), 0) || b.createdAt.getTime();
      const term = b.customer?.paymentTermDays ?? 0;
      const due = startOfVnDay(vnYmd(new Date(lastEnd))).getTime() + term * DAY_MS;
      const overdueDays = Math.max(0, Math.floor((today - due) / DAY_MS));

      const key = b.customerId ? `c${b.customerId}` : `w:${b.contactName.trim().toLowerCase()}|${b.contactPhone.trim()}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          customerId: b.customerId,
          name: b.customer?.name ?? `${b.contactName} (khách lẻ)`,
          phone: b.customer?.phone ?? b.contactPhone,
          customerType: b.customer?.type ?? 'KHACH_LE',
          creditLimit: b.customer?.creditLimit === null || b.customer?.creditLimit === undefined ? null : Number(b.customer.creditLimit),
          totalNet: 0,
          totalVat: 0,
          totalBilled: 0,
          totalPaid: 0,
          balance: 0,
          overdue: 0,
          maxOverdueDays: 0,
          unpriced: 0,
          bookings: [],
        });
      }
      const g = groups.get(key)!;
      // Chưa nhập giá: tổng 0 đ và chưa thu đồng nào → chưa thể coi là đã thanh toán
      const unpriced = Math.round(t.total) <= 0 && Math.round(t.paid) <= 0;
      if (unpriced) g.unpriced += 1;
      g.totalNet += t.taxable;
      g.totalVat += t.vatAmount;
      g.totalBilled += t.total;
      g.totalPaid += t.paid;
      g.balance += t.balance;
      if (overdueDays > 0 && t.balance > 0) {
        g.overdue += t.balance;
        g.maxOverdueDays = Math.max(g.maxOverdueDays, overdueDays);
      }
      g.bookings.push({
        id: b.id,
        code: b.code,
        customerRef: b.customerRef,
        status: b.status,
        salesUser: b.salesUser?.fullName ?? null,
        firstPickup: activeTrips.length ? new Date(Math.min(...activeTrips.map((x) => x.pickupTime.getTime()))) : null,
        dueDate: vnYmd(new Date(due)),
        overdueDays,
        invoice: b.invoiceRequired,
        vatPercent: Number(b.vatPercent),
        net: t.taxable,
        vat: t.vatAmount,
        total: t.total,
        paid: t.paid,
        balance: t.balance,
        unpriced,
      });
    }

    const list = [...groups.values()]
      .map((g) => ({ ...g, overLimit: g.creditLimit !== null && g.creditLimit > 0 && g.balance > g.creditLimit }))
      // Khách còn nợ lên trước (nợ nhiều trước; khách có booking chưa nhập giá ngay sau), cuối cùng khách đã thanh toán đủ theo tên
      .sort((a, b) => b.balance - a.balance || b.unpriced - a.unpriced || a.name.localeCompare(b.name, 'vi'));
    return {
      totalBalance: list.reduce((s, g) => s + g.balance, 0),
      totalOverdue: list.reduce((s, g) => s + g.overdue, 0),
      customers: list,
    };
  }

  // ───── Công nợ nhà xe ─────

  async payables() {
    const partners = await this.prisma.partner.findMany({
      include: {
        trips: {
          where: { status: { not: TripStatus.HUY }, booking: { status: { in: BILLABLE } } },
          select: {
            id: true,
            pickupTime: true,
            pickupAddress: true,
            dropoffAddress: true,
            partnerPlate: true,
            partnerCost: true,
            partnerInvoice: true,
            partnerVatPercent: true,
            partnerIssue: true,
            partnerAdjustNote: true,
            partnerExtraUp: true,
            partnerExtraDown: true,
            partnerExtraNote: true,
            status: true,
            booking: { select: { id: true, code: true } },
            vehicleType: { select: { name: true } },
          },
          orderBy: { pickupTime: 'desc' },
        },
        payments: { orderBy: { paidAt: 'desc' }, include: { createdBy: { select: { fullName: true } } } },
      },
      orderBy: { name: 'asc' },
    });

    const list = partners
      .map((p) => {
        const trips = p.trips.map((t) => {
          const x = partnerPayable(t);
          return { ...t, partnerNet: x.net, partnerVat: x.vat, partnerTotal: x.total };
        });
        const totalNet = trips.reduce((s, t) => s + t.partnerNet, 0);
        const totalVat = trips.reduce((s, t) => s + t.partnerVat, 0);
        const totalCost = totalNet + totalVat;
        const totalPaid = p.payments.reduce((s, x) => s + Number(x.amount), 0);
        return {
          id: p.id,
          name: p.name,
          phone: p.phone,
          bankName: p.bankName,
          bankAccount: p.bankAccount,
          tripCount: p.trips.length,
          totalNet,
          totalVat,
          totalCost,
          totalPaid,
          balance: totalCost - totalPaid,
          trips,
          payments: p.payments,
        };
      })
      .filter((p) => p.tripCount > 0 || p.payments.length > 0)
      .sort((a, b) => b.balance - a.balance);
    return { totalBalance: list.reduce((s, p) => s + p.balance, 0), partners: list };
  }

  // ───── Sổ thu chi ─────

  async ledger(from?: string, to?: string) {
    const f = from ?? `${vnYmd(new Date()).slice(0, 8)}01`;
    const t = to ?? vnYmd(new Date());
    const range: Prisma.DateTimeFilter = { gte: dateOnly(f), lte: dateOnly(t) };

    const [payments, partnerPayments, costs, vouchers] = await Promise.all([
      this.prisma.payment.findMany({
        where: { paidAt: range },
        include: { booking: { select: { id: true, code: true, contactName: true, customer: { select: { name: true } } } }, createdBy: { select: { fullName: true } } },
      }),
      this.prisma.partnerPayment.findMany({ where: { paidAt: range }, include: { partner: { select: { name: true } }, createdBy: { select: { fullName: true } } } }),
      this.prisma.tripCost.findMany({
        where: { spentAt: range },
        include: {
          category: { select: { name: true } },
          createdBy: { select: { fullName: true } },
          trip: {
            select: {
              booking: { select: { id: true, code: true } },
              vehicle: { select: { id: true, plateNumber: true, ownership: true } },
              partner: { select: { id: true, name: true } },
              driver: { select: { fullName: true } },
            },
          },
        },
      }),
      this.prisma.cashVoucher.findMany({ where: { date: range }, include: VOUCHER_INCLUDE }),
    ]);
    const none = { vehicleId: null, vehicle: null, ownership: null, partnerId: null, partner: null, code: null };

    const entries = [
      ...payments.map((p) => ({
        key: `p${p.id}`,
        id: p.id,
        source: 'PAYMENT' as const,
        type: Number(p.amount) >= 0 ? ('THU' as const) : ('CHI' as const),
        date: vnYmd(p.paidAt),
        category: Number(p.amount) >= 0 ? 'Thu tiền khách' : 'Hoàn tiền khách',
        amount: Math.abs(Number(p.amount)),
        description: `${p.booking.code} · ${p.booking.customer?.name ?? p.booking.contactName}`,
        bookingId: p.booking.id,
        method: p.method,
        reference: p.reference,
        note: p.note,
        by: p.createdBy.fullName,
        ...none,
      })),
      ...partnerPayments.map((p) => ({
        key: `pp${p.id}`,
        id: p.id,
        source: 'PARTNER_PAYMENT' as const,
        type: 'CHI' as const,
        date: vnYmd(p.paidAt),
        category: 'Trả nhà xe đối tác',
        amount: Number(p.amount),
        description: p.partner.name,
        bookingId: null,
        method: p.method,
        reference: p.reference,
        note: p.note,
        by: p.createdBy.fullName,
        ...none,
        partnerId: p.partnerId as number | null,
        partner: p.partner.name as string | null,
      })),
      ...costs.map((c) => ({
        key: `c${c.id}`,
        id: c.id,
        source: 'TRIP_COST' as const,
        type: 'CHI' as const,
        date: vnYmd(c.spentAt),
        category: c.category.name,
        amount: Number(c.amount),
        description: [c.trip.booking.code, c.trip.vehicle?.plateNumber, c.trip.driver?.fullName].filter(Boolean).join(' · '),
        bookingId: c.trip.booking.id,
        method: null,
        reference: null,
        note: c.note,
        by: c.byDriver ? `${c.createdBy?.fullName ?? ''} (app)` : (c.createdBy?.fullName ?? ''),
        ...none,
        vehicleId: c.trip.vehicle?.id ?? null,
        vehicle: c.trip.vehicle?.plateNumber ?? null,
        ownership: c.trip.vehicle?.ownership ?? (c.trip.partner ? Ownership.DOI_TAC : null),
        partnerId: c.trip.partner?.id ?? null,
        partner: c.trip.partner?.name ?? null,
      })),
      ...vouchers.map((v) => ({
        key: `v${v.id}`,
        id: v.id,
        source: 'VOUCHER' as const,
        type: v.type,
        date: vnYmd(v.date),
        category: v.category?.name ?? v.title ?? (v.type === VoucherType.THU ? 'Thu khác' : 'Chi khác'),
        amount: Number(v.amount),
        description: [
          v.code,
          v.driver ? `Lái xe ${v.driver.fullName}${v.driverPaid ? ' (tự ứng)' : ''}` : v.counterparty,
          v.liters ? `${Number(v.liters).toLocaleString('vi-VN')} lít` : null,
          v.odometerKm ? `${v.odometerKm.toLocaleString('vi-VN')} km` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        hasReceipt: !!v.receiptFile,
        bookingId: null,
        method: v.method,
        reference: v.reference,
        note: v.note,
        by: v.createdBy.fullName,
        code: v.code,
        vehicleId: v.vehicleId,
        vehicle: v.vehicle?.plateNumber ?? null,
        ownership: v.vehicle?.ownership ?? (v.partnerId ? Ownership.DOI_TAC : null),
        partnerId: v.partnerId,
        partner: v.partner?.name ?? null,
      })),
    ].sort((a, b) => (a.date === b.date ? a.key.localeCompare(b.key) : a.date.localeCompare(b.date)));

    const income = entries.filter((e) => e.type === 'THU').reduce((s, e) => s + e.amount, 0);
    const expense = entries.filter((e) => e.type === 'CHI').reduce((s, e) => s + e.amount, 0);
    return { from: f, to: t, income, expense, net: income - expense, entries };
  }

  // ───── Phiếu thu / phiếu chi ─────

  /** Kiểm tra loại chi phí, xe, đối tác; xe đối tác thì tự gắn nhà xe của xe */
  private async voucherRefs(dto: UpdateVoucherDto) {
    const data: { categoryCode?: string | null; vehicleId?: number | null; partnerId?: number | null } = {};
    if (dto.categoryCode !== undefined) {
      const code = dto.categoryCode || null;
      if (code && !(await this.prisma.costCategory.findUnique({ where: { code } }))) throw new BadRequestException('Loại chi phí không tồn tại');
      data.categoryCode = code;
    }
    if (dto.vehicleId !== undefined) {
      data.vehicleId = dto.vehicleId || null;
      if (data.vehicleId) {
        const v = await this.prisma.vehicle.findUnique({ where: { id: data.vehicleId }, select: { partnerId: true, ownership: true } });
        if (!v) throw new BadRequestException('Xe không tồn tại');
        data.partnerId = v.ownership === Ownership.DOI_TAC ? v.partnerId : null;
      }
    }
    if (data.partnerId === undefined && dto.partnerId !== undefined) data.partnerId = dto.partnerId || null;
    if (data.partnerId && !(await this.prisma.partner.findUnique({ where: { id: data.partnerId } }))) throw new BadRequestException('Đối tác không tồn tại');
    return data;
  }

  private async nextVoucherCode(type: VoucherType, date: Date) {
    const ymd = date.toISOString().slice(0, 10);
    const prefix = `${type === VoucherType.THU ? 'PT' : 'PC'}${ymd.slice(2, 4)}${ymd.slice(5, 7)}-`;
    const last = await this.prisma.cashVoucher.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: 'desc' } });
    return `${prefix}${String(last ? Number(last.code.slice(prefix.length)) + 1 : 1).padStart(4, '0')}`;
  }

  /** extra: thông tin xăng dầu khi lái xe nhập trên app (lái xe, số lít, số km, tự ứng tiền) */
  async createVoucher(dto: CreateVoucherDto, user: AuthUser, extra: { driverId?: number; liters?: number | null; odometerKm?: number | null; driverPaid?: boolean } = {}) {
    const refs = await this.voucherRefs(dto);
    const date = dateOnly(dto.date);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.cashVoucher.create({
          data: {
            ...refs,
            code: await this.nextVoucherCode(dto.type, date),
            type: dto.type,
            date,
            amount: dto.amount,
            title: dto.title?.trim() || null,
            counterparty: dto.counterparty?.trim() || null,
            method: dto.method,
            reference: dto.reference || null,
            note: dto.note || null,
            ...extra,
            createdById: user.id,
          },
          include: VOUCHER_INCLUDE,
        });
      } catch (e) {
        if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
  }

  /** Không đổi loại phiếu (thu ↔ chi) vì mã phiếu theo loại */
  async updateVoucher(id: number, { type: _t, ...dto }: UpdateVoucherDto) {
    const refs = await this.voucherRefs(dto);
    return this.prisma.cashVoucher.update({
      where: { id },
      data: {
        ...refs,
        ...(dto.date && { date: dateOnly(dto.date) }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.title !== undefined && { title: dto.title?.trim() || null }),
        ...(dto.counterparty !== undefined && { counterparty: dto.counterparty?.trim() || null }),
        ...(dto.method && { method: dto.method }),
        ...(dto.reference !== undefined && { reference: dto.reference || null }),
        ...(dto.note !== undefined && { note: dto.note || null }),
      },
      include: VOUCHER_INCLUDE,
    });
  }

  voucher(id: number) {
    return this.prisma.cashVoucher.findUniqueOrThrow({ where: { id }, include: VOUCHER_INCLUDE });
  }
}
