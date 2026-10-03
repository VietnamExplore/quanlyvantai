import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { BookingStatus, Prisma, Role, TripStatus } from '@prisma/client';
import { AuthUser, CurrentUser, OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

const TZ = 'Asia/Ho_Chi_Minh';
const DAY_MS = 86_400_000;
/** Doanh thu chỉ tính booking khách đã xác nhận hoặc đã hoàn thành */
const REVENUE_STATUSES: BookingStatus[] = [BookingStatus.XAC_NHAN, BookingStatus.HOAN_THANH];

type GroupBy = 'day' | 'month';

interface Agg {
  revenue: number;
  cost: number;
  trips: number;
}
const emptyAgg = (): Agg => ({ revenue: 0, cost: 0, trips: 0 });
const withProfit = (a: Agg) => ({ ...a, revenue: Math.round(a.revenue), cost: Math.round(a.cost), profit: Math.round(a.revenue - a.cost) });

const vnDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // YYYY-MM-DD
const startOfVnDay = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);
const endOfVnDay = (ymd: string) => new Date(`${ymd}T23:59:59.999+07:00`);
const isYmd = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

function periodKeys(from: string, to: string, groupBy: GroupBy) {
  const keys: string[] = [];
  for (let t = startOfVnDay(from).getTime(); t <= startOfVnDay(to).getTime(); t += DAY_MS) {
    const key = groupBy === 'day' ? vnDate(new Date(t)) : vnDate(new Date(t)).slice(0, 7);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  return keys;
}

@Controller('reports')
@Roles(...OFFICE_ROLES)
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Báo cáo doanh thu – chi phí – lợi nhuận theo ngày đón khách.
   * Doanh thu = thành tiền chuyến sau khi phân bổ giảm giá của booking, chưa gồm VAT.
   * Nhân viên kinh doanh (không kiêm vai trò quản lý) chỉ thấy số liệu booking của mình.
   */
  @Get('summary')
  async summary(
    @CurrentUser() user: AuthUser,
    @Query('from') fromQ?: string,
    @Query('to') toQ?: string,
    @Query('groupBy') groupByQ?: string,
  ) {
    const today = vnDate(new Date());
    const from = isYmd(fromQ) ? fromQ! : `${today.slice(0, 8)}01`;
    const to = isYmd(toQ) ? toQ! : today;
    if (startOfVnDay(from) > startOfVnDay(to)) throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    const days = Math.round((startOfVnDay(to).getTime() - startOfVnDay(from).getTime()) / DAY_MS) + 1;
    if (days > 731) throw new BadRequestException('Chỉ xem tối đa 2 năm mỗi lần');
    const groupBy: GroupBy = groupByQ === 'month' || groupByQ === 'day' ? groupByQ : days > 62 ? 'month' : 'day';

    const ownOnly = !user.roles.some((r) => r === Role.ADMIN || r === Role.KE_TOAN || r === Role.DIEU_HANH);
    const bookingScope: Prisma.BookingWhereInput = ownOnly ? { salesUserId: user.id } : {};

    // Kỳ trước có cùng độ dài, ngay trước kỳ đang xem, để so sánh tăng/giảm
    const prevTo = vnDate(new Date(startOfVnDay(from).getTime() - DAY_MS));
    const prevFrom = vnDate(new Date(startOfVnDay(from).getTime() - days * DAY_MS));

    const [trips, prevTrips, quotes, drafts, waitingDispatch, upcoming] = await Promise.all([
      this.loadTrips(from, to, bookingScope),
      this.loadTrips(prevFrom, prevTo, bookingScope),
      this.prisma.booking.findMany({
        where: { ...bookingScope, status: BookingStatus.BAO_GIA },
        select: { discountAmount: true, trips: { select: { amount: true, status: true } } },
      }),
      this.prisma.booking.count({ where: { ...bookingScope, status: BookingStatus.NHAP } }),
      this.prisma.bookingTrip.count({
        where: { status: TripStatus.CHO_DIEU, pickupTime: { gte: new Date() }, booking: { ...bookingScope, status: BookingStatus.XAC_NHAN } },
      }),
      this.prisma.bookingTrip.count({
        where: {
          status: { not: TripStatus.HUY },
          pickupTime: { gte: new Date(), lte: new Date(Date.now() + 7 * DAY_MS) },
          booking: { ...bookingScope, status: { in: REVENUE_STATUSES } },
        },
      }),
    ]);

    const keys = periodKeys(from, to, groupBy);
    const series = new Map(keys.map((k) => [k, emptyAgg()]));
    const total = emptyAgg();
    const byService = new Map<string, Agg>();
    const byVehicleType = new Map<string, Agg>();
    const bySales = new Map<string, Agg & { bookings: Set<number> }>();
    const byCustomer = new Map<string, Agg & { bookings: Set<number> }>();
    const bookingIds = new Set<number>();
    let tripsWithoutCost = 0;

    const add = (a: Agg, revenue: number, cost: number) => {
      a.revenue += revenue;
      a.cost += cost;
      a.trips += 1;
    };
    const bucket = <T extends Agg>(map: Map<string, T>, key: string, make: () => T) => {
      if (!map.has(key)) map.set(key, make());
      return map.get(key)!;
    };

    for (const t of trips) {
      const revenue = t.revenue;
      const cost = t.estimatedCost === null ? 0 : Number(t.estimatedCost);
      if (t.estimatedCost === null) tripsWithoutCost++;
      bookingIds.add(t.booking.id);

      const dateKey = vnDate(t.pickupTime);
      add(series.get(groupBy === 'day' ? dateKey : dateKey.slice(0, 7)) ?? emptyAgg(), revenue, cost);
      add(total, revenue, cost);
      add(bucket(byService, t.serviceType, emptyAgg), revenue, cost);
      add(bucket(byVehicleType, t.vehicleType.name, emptyAgg), revenue, cost);

      const salesName = t.booking.salesUser?.fullName ?? 'Chưa gán NV';
      const s = bucket(bySales, salesName, () => ({ ...emptyAgg(), bookings: new Set<number>() }));
      add(s, revenue, cost);
      s.bookings.add(t.booking.id);

      const customerName = t.booking.customer?.name ?? `${t.booking.contactName} (khách lẻ)`;
      const c = bucket(byCustomer, customerName, () => ({ ...emptyAgg(), bookings: new Set<number>() }));
      add(c, revenue, cost);
      c.bookings.add(t.booking.id);
    }

    const prev = emptyAgg();
    for (const t of prevTrips) add(prev, t.revenue, t.estimatedCost === null ? 0 : Number(t.estimatedCost));

    const ranked = <T extends Agg>(map: Map<string, T>, limit = 10) =>
      [...map.entries()]
        .map(([name, a]) => ({ name, ...withProfit(a), ...('bookings' in a ? { bookings: (a as { bookings: Set<number> }).bookings.size } : {}) }))
        .sort((x, y) => y.revenue - x.revenue)
        .slice(0, limit);

    return {
      from,
      to,
      groupBy,
      ownOnly,
      kpis: { ...withProfit(total), bookings: bookingIds.size, tripsWithoutCost },
      previous: { from: prevFrom, to: prevTo, ...withProfit(prev) },
      series: keys.map((period) => ({ period, ...withProfit(series.get(period)!) })),
      byService: [...byService.entries()].map(([serviceType, a]) => ({ serviceType, ...withProfit(a) })).sort((x, y) => y.revenue - x.revenue),
      byVehicleType: ranked(byVehicleType),
      bySales: ranked(bySales),
      topCustomers: ranked(byCustomer, 8),
      pipeline: {
        quotes: quotes.length,
        quoteValue: Math.round(quotes.reduce((s, b) => s + Math.max(0, this.subtotal(b.trips) - Number(b.discountAmount)), 0)),
        drafts,
        waitingDispatch,
        upcoming7Days: upcoming,
      },
    };
  }

  private subtotal(trips: { amount: Prisma.Decimal; status: TripStatus }[]) {
    return trips.filter((t) => t.status !== TripStatus.HUY).reduce((s, t) => s + Number(t.amount), 0);
  }

  /** Chuyến có doanh thu trong khoảng ngày, kèm doanh thu đã phân bổ giảm giá của booking */
  private async loadTrips(from: string, to: string, bookingScope: Prisma.BookingWhereInput) {
    const rows = await this.prisma.bookingTrip.findMany({
      where: {
        status: { not: TripStatus.HUY },
        pickupTime: { gte: startOfVnDay(from), lte: endOfVnDay(to) },
        booking: { ...bookingScope, status: { in: REVENUE_STATUSES } },
      },
      select: {
        amount: true,
        estimatedCost: true,
        pickupTime: true,
        serviceType: true,
        vehicleType: { select: { name: true } },
        booking: {
          select: {
            id: true,
            discountAmount: true,
            contactName: true,
            customer: { select: { name: true } },
            salesUser: { select: { fullName: true } },
            trips: { select: { amount: true, status: true } },
          },
        },
      },
    });
    return rows.map((t) => {
      const subtotal = this.subtotal(t.booking.trips);
      const factor = subtotal > 0 ? Math.max(0, subtotal - Number(t.booking.discountAmount)) / subtotal : 0;
      return { ...t, revenue: Number(t.amount) * factor };
    });
  }
}
