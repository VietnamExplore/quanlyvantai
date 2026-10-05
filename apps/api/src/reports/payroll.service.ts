import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus, Prisma, TripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const TZ = 'Asia/Ho_Chi_Minh';
const DAY_MS = 86_400_000;
/** Doanh thu chỉ tính booking khách đã xác nhận hoặc đã hoàn thành */
const REVENUE_STATUSES: BookingStatus[] = [BookingStatus.XAC_NHAN, BookingStatus.HOAN_THANH];

export const vnDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // YYYY-MM-DD
export const startOfVnDay = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);
export const endOfVnDay = (ymd: string) => new Date(`${ymd}T23:59:59.999+07:00`);
export const isYmd = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

const subtotal = (trips: { amount: Prisma.Decimal; status: TripStatus }[]) =>
  trips.filter((t) => t.status !== TripStatus.HUY).reduce((s, t) => s + Number(t.amount), 0);

/**
 * Lương lái xe công ty trong khoảng ngày = lương cứng + % doanh số; thực nhận = lương + hoàn ứng.
 * - Lương cứng tính theo tháng; kỳ không trọn tháng thì tính theo số ngày (lương × số ngày / số ngày của tháng).
 * - Doanh số = doanh thu (đã phân bổ giảm giá, chưa VAT) các chuyến lái xe đã HOÀN THÀNH
 *   (xe công ty, booking đã xác nhận / hoàn thành), theo ngày đón.
 * - Chuyến đã qua giờ đón nhưng chưa bấm hoàn thành: chưa tính, trả về để cảnh báo.
 * - Hoàn ứng = chi phí lái xe tự nhập trên app (byDriver) của các chuyến lái xe chạy trong kỳ
 *   + phiếu chi xăng dầu lái xe tự ứng tiền (theo ngày đổ xăng).
 * - Mỗi tháng dùng mức lương có hiệu lực của tháng đó (bảng DriverSalary).
 * Dùng chung cho báo cáo lương (web) và mục Thu nhập trên app lái xe.
 */
@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  async compute(from: string, to: string, driverId?: number) {
    if (startOfVnDay(from) > startOfVnDay(to)) throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    if ((startOfVnDay(to).getTime() - startOfVnDay(from).getTime()) / DAY_MS > 731) throw new BadRequestException('Chỉ xem tối đa 2 năm mỗi lần');

    const now = new Date();
    const inRange = { gte: startOfVnDay(from), lte: endOfVnDay(to) };
    const dateRange = { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) };
    const companyTrip: Prisma.BookingTripWhereInput = {
      driverId: driverId ?? { not: null },
      partnerId: null,
      booking: { status: { in: REVENUE_STATUSES } },
    };
    const [drivers, salaries, trips, pending, advances, fuel] = await Promise.all([
      this.prisma.driver.findMany({ where: { partnerId: null, ...(driverId && { id: driverId }) }, select: { id: true, fullName: true, phone: true, status: true }, orderBy: { fullName: 'asc' } }),
      this.prisma.driverSalary.findMany({ where: { driver: { partnerId: null }, ...(driverId && { driverId }) }, orderBy: { effectiveFrom: 'desc' } }),
      this.prisma.bookingTrip.findMany({
        where: { ...companyTrip, status: TripStatus.HOAN_THANH, pickupTime: inRange },
        select: {
          id: true,
          driverId: true,
          amount: true,
          pickupTime: true,
          pickupAddress: true,
          dropoffAddress: true,
          service: { select: { name: true } },
          booking: { select: { code: true, discountAmount: true, trips: { select: { amount: true, status: true } } } },
        },
        orderBy: { pickupTime: 'asc' },
      }),
      // Đã qua giờ đón nhưng chưa hoàn thành → chưa tính % doanh số
      this.prisma.bookingTrip.findMany({
        where: {
          ...companyTrip,
          status: { notIn: [TripStatus.HUY, TripStatus.HOAN_THANH] },
          pickupTime: { gte: inRange.gte, lte: endOfVnDay(to) < now ? endOfVnDay(to) : now },
        },
        select: { id: true, driverId: true, pickupTime: true, status: true, booking: { select: { id: true, code: true } } },
        orderBy: { pickupTime: 'asc' },
      }),
      // Khoản lái xe tự ứng (nhập trên app) của các chuyến lái xe chạy trong kỳ, kể cả chuyến bị hủy sau khi đã chi
      this.prisma.tripCost.findMany({
        where: { byDriver: true, trip: { driverId: driverId ?? { not: null }, partnerId: null, pickupTime: inRange } },
        select: {
          id: true,
          amount: true,
          spentAt: true,
          note: true,
          category: { select: { name: true } },
          trip: { select: { id: true, driverId: true, pickupTime: true, status: true, booking: { select: { id: true, code: true } } } },
        },
        orderBy: { spentAt: 'asc' },
      }),
      // Xăng dầu lái xe tự ứng tiền
      this.prisma.cashVoucher.findMany({
        where: { driverId: driverId ?? { not: null }, driverPaid: true, type: 'CHI', date: dateRange },
        select: { id: true, code: true, amount: true, date: true, note: true, liters: true, driverId: true, vehicle: { select: { plateNumber: true } } },
        orderBy: { date: 'asc' },
      }),
    ]);

    // Các tháng (có thể chỉ một phần tháng) nằm trong kỳ
    const months: { month: string; from: string; to: string; days: number; daysInMonth: number }[] = [];
    for (let m = from.slice(0, 7); m <= to.slice(0, 7); ) {
      const [y, mo] = m.split('-').map(Number);
      const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const mFrom = from > `${m}-01` ? from : `${m}-01`;
      const mTo = to < `${m}-${String(daysInMonth).padStart(2, '0')}` ? to : `${m}-${String(daysInMonth).padStart(2, '0')}`;
      months.push({ month: m, from: mFrom, to: mTo, days: Number(mTo.slice(8)) - Number(mFrom.slice(8)) + 1, daysInMonth });
      m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
    }

    const rateFor = (dId: number, month: string) => salaries.find((s) => s.driverId === dId && s.effectiveFrom.toISOString().slice(0, 7) <= month) ?? null;
    const monthOf = (d: Date) => vnDate(d).slice(0, 7);

    // Doanh thu từng chuyến hoàn thành (đã phân bổ giảm giá của booking)
    const tripRevenue = trips.map((t) => {
      const sub = subtotal(t.booking.trips);
      const factor = sub > 0 ? Math.max(0, sub - Number(t.booking.discountAmount)) / sub : 0;
      return { t, revenue: Number(t.amount) * factor };
    });
    const revenue = new Map<string, { revenue: number; trips: number }>();
    for (const { t, revenue: rv } of tripRevenue) {
      const key = `${t.driverId}|${monthOf(t.pickupTime)}`;
      const r = revenue.get(key) ?? { revenue: 0, trips: 0 };
      r.revenue += rv;
      r.trips += 1;
      revenue.set(key, r);
    }
    const advanceSum = new Map<string, number>();
    for (const c of advances) {
      const key = `${c.trip.driverId}|${monthOf(c.trip.pickupTime)}`;
      advanceSum.set(key, (advanceSum.get(key) ?? 0) + Number(c.amount));
    }
    for (const v of fuel) {
      const key = `${v.driverId}|${v.date.toISOString().slice(0, 7)}`;
      advanceSum.set(key, (advanceSum.get(key) ?? 0) + Number(v.amount));
    }

    const rows = drivers.map((d) => {
      const detail = months.map((m) => {
        const rate = rateFor(d.id, m.month);
        const r = revenue.get(`${d.id}|${m.month}`) ?? { revenue: 0, trips: 0 };
        const baseSalary = rate ? Number(rate.baseSalary) : 0;
        const commissionPercent = rate ? Number(rate.commissionPercent) : 0;
        const baseAmount = Math.round((baseSalary * m.days) / m.daysInMonth);
        const commission = Math.round((r.revenue * commissionPercent) / 100);
        const reimbursement = Math.round(advanceSum.get(`${d.id}|${m.month}`) ?? 0);
        const total = baseAmount + commission;
        return { ...m, hasRate: !!rate, baseSalary, commissionPercent, baseAmount, trips: r.trips, revenue: Math.round(r.revenue), commission, total, reimbursement, netPay: total + reimbursement };
      });
      const sum = (k: 'baseAmount' | 'revenue' | 'commission' | 'trips' | 'total' | 'reimbursement' | 'netPay') => detail.reduce((s, x) => s + x[k], 0);
      const last = detail[detail.length - 1];
      const myPending = pending.filter((t) => t.driverId === d.id);
      return {
        driverId: d.id,
        fullName: d.fullName,
        phone: d.phone,
        status: d.status,
        missingRate: detail.some((x) => !x.hasRate),
        baseSalary: last.baseSalary,
        commissionPercent: last.commissionPercent,
        trips: sum('trips'),
        revenue: sum('revenue'),
        baseAmount: sum('baseAmount'),
        commission: sum('commission'),
        total: sum('total'),
        reimbursement: sum('reimbursement'),
        netPay: sum('netPay'),
        months: detail,
        pendingTrips: myPending.map((t) => ({ id: t.id, pickupTime: t.pickupTime, status: t.status, booking: t.booking })),
        // Chuyến đã hoàn thành kèm doanh số và tiền % (dùng cho app lái xe)
        completedTrips: tripRevenue
          .filter(({ t }) => t.driverId === d.id)
          .map(({ t, revenue: rv }) => {
            const pct = detail.find((m) => m.month === monthOf(t.pickupTime))?.commissionPercent ?? 0;
            return {
              id: t.id,
              pickupTime: t.pickupTime,
              pickupAddress: t.pickupAddress,
              dropoffAddress: t.dropoffAddress,
              service: t.service?.name ?? null,
              bookingCode: t.booking.code,
              revenue: Math.round(rv),
              commission: Math.round((rv * pct) / 100),
            };
          }),
        advances: [
          ...advances
            .filter((c) => c.trip.driverId === d.id)
            .map((c) => ({
              id: `c${c.id}`,
              amount: Number(c.amount),
              spentAt: c.spentAt,
              note: c.note,
              category: c.category.name,
              tripId: c.trip.id as number | null,
              pickupTime: c.trip.pickupTime,
              tripStatus: c.trip.status as TripStatus | null,
              booking: c.trip.booking as { id: number; code: string } | null,
            })),
          ...fuel
            .filter((v) => v.driverId === d.id)
            .map((v) => ({
              id: `v${v.id}`,
              amount: Number(v.amount),
              spentAt: v.date,
              note: [v.code, v.vehicle?.plateNumber, v.liters ? `${Number(v.liters)} lít` : null, v.note].filter(Boolean).join(' · '),
              category: 'Xăng dầu (lái xe ứng)',
              tripId: null,
              pickupTime: v.date,
              tripStatus: null,
              booking: null,
            })),
        ],
      };
    });

    return {
      from,
      to,
      drivers: driverId ? rows : rows.filter((r) => r.status !== 'NGHI_VIEC' || r.trips > 0 || r.reimbursement > 0 || r.pendingTrips.length > 0),
    };
  }
}
