import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { BookingStatus, Prisma, TripStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.decorators';
import { bookingTotals } from '../bookings/bookings.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_COST_CATEGORIES } from './cost.util';
import { CreatePartnerPaymentDto, CreatePaymentDto, CreateTripCostDto } from './finance.dto';

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

@Injectable()
export class FinanceService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  /** Lần đầu chạy: tạo sẵn các loại chi phí thông dụng */
  async onModuleInit() {
    if ((await this.prisma.costCategory.count()) === 0) {
      await this.prisma.costCategory.createMany({ data: DEFAULT_COST_CATEGORIES, skipDuplicates: true });
    }
  }

  async createCategory(name: string, code?: string, sortOrder?: number) {
    const base = code || codeFromName(name);
    if (!base) throw new BadRequestException('Không tạo được mã từ tên, hãy nhập mã');
    let finalCode = base;
    for (let i = 2; await this.prisma.costCategory.findUnique({ where: { code: finalCode } }); i++) finalCode = `${base.slice(0, 36)}_${i}`;
    const max = await this.prisma.costCategory.aggregate({ _max: { sortOrder: true } });
    return this.prisma.costCategory.create({ data: { code: finalCode, name, sortOrder: sortOrder ?? (max._max.sortOrder ?? 0) + 1 } });
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
    await this.prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
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
      totalBilled: number;
      totalPaid: number;
      balance: number;
      overdue: number;
      maxOverdueDays: number;
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
          totalBilled: 0,
          totalPaid: 0,
          balance: 0,
          overdue: 0,
          maxOverdueDays: 0,
          bookings: [],
        });
      }
      const g = groups.get(key)!;
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
        total: t.total,
        paid: t.paid,
        balance: t.balance,
      });
    }

    const list = [...groups.values()]
      .map((g) => ({ ...g, overLimit: g.creditLimit !== null && g.creditLimit > 0 && g.balance > g.creditLimit }))
      // Khách còn nợ lên trước (nợ nhiều trước), sau đó khách đã thanh toán đủ theo tên
      .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, 'vi'));
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
        const totalCost = p.trips.reduce((s, t) => s + Number(t.partnerCost ?? 0), 0);
        const totalPaid = p.payments.reduce((s, x) => s + Number(x.amount), 0);
        return {
          id: p.id,
          name: p.name,
          phone: p.phone,
          bankName: p.bankName,
          bankAccount: p.bankAccount,
          tripCount: p.trips.length,
          totalCost,
          totalPaid,
          balance: totalCost - totalPaid,
          trips: p.trips,
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

    const [payments, partnerPayments, costs] = await Promise.all([
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
          trip: { select: { booking: { select: { id: true, code: true } }, vehicle: { select: { plateNumber: true } }, driver: { select: { fullName: true } } } },
        },
      }),
    ]);

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
      })),
    ].sort((a, b) => (a.date === b.date ? a.key.localeCompare(b.key) : a.date.localeCompare(b.date)));

    const income = entries.filter((e) => e.type === 'THU').reduce((s, e) => s + e.amount, 0);
    const expense = entries.filter((e) => e.type === 'CHI').reduce((s, e) => s + e.amount, 0);
    return { from: f, to: t, income, expense, net: income - expense, entries };
  }
}
