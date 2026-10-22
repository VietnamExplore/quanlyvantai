import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Ownership, Prisma, ShuttleRunStatus, TripStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { AssignRunDto, CreateRunDto, RunProgressDto, ShuttleRouteDto, UpdateRunDto } from './shuttle.dto';

const TZ = 'Asia/Ho_Chi_Minh';
const DAY_MS = 86_400_000;
const vnYmd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const startOfVnDay = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);
const fmt = (d: Date) => new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(d);
/** Thứ trong tuần theo giờ Việt Nam: 1 = Thứ Hai … 7 = Chủ nhật */
const isoWeekday = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00+07:00`).getUTCDay();
  return d === 0 ? 7 : d;
};

/** Giờ chạy cố định có chạy vào ngày này không (ngày trong tuần, hiệu lực) */
const scheduleRunsOn = (s: { weekdays: number[]; validFrom: Date | null; validTo: Date | null }, ymd: string) =>
  (!s.weekdays.length || s.weekdays.includes(isoWeekday(ymd))) && (!s.validFrom || ymd >= vnYmd(s.validFrom)) && (!s.validTo || ymd <= vnYmd(s.validTo));

/** Chuyến theo lịch còn khớp giờ chạy hiện tại: giờ chạy đang bật, tuyến đang chạy, đúng giờ xuất bến và đúng ngày chạy */
const runMatches = (s: { isActive: boolean; departTime: string; weekdays: number[]; validFrom: Date | null; validTo: Date | null }, routeActive: boolean, departAt: Date) => {
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(departAt).replace(/^24/, '00');
  return routeActive && s.isActive && s.departTime === hm && scheduleRunsOn(s, vnYmd(departAt));
};

/** Lượt đặt chỗ còn giữ ghế: chuyến chưa hủy, booking chưa hủy */
export const ACTIVE_SEAT: Prisma.BookingTripWhereInput = { status: { not: TripStatus.HUY }, booking: { status: { not: BookingStatus.HUY } } };

const runInclude = {
  route: { select: { id: true, code: true, name: true, durationMinutes: true, isActive: true } },
  schedule: { select: { isActive: true, departTime: true, weekdays: true, validFrom: true, validTo: true } },
  vehicleType: { select: { id: true, name: true, seats: true, maxPassengers: true } },
  vehicle: { select: { id: true, plateNumber: true } },
  driver: { select: { id: true, fullName: true, phone: true } },
  partner: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.ShuttleRunInclude;

@Injectable()
export class ShuttleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  // ───── Tuyến ─────

  routes(all = false) {
    return this.prisma.shuttleRoute.findMany({
      where: all ? {} : { isActive: true },
      include: {
        vehicleType: { select: { id: true, name: true, seats: true } },
        stops: { where: all ? {} : { isActive: true }, orderBy: { seq: 'asc' } },
        schedules: { orderBy: { departTime: 'asc' } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  private checkRoute(dto: ShuttleRouteDto) {
    if (!dto.stops.length) throw new BadRequestException('Tuyến cần ít nhất một điểm dừng / khu vực đón');
    if (!dto.stops.some((s) => s.canPickup !== false)) throw new BadRequestException('Tuyến cần ít nhất một điểm cho khách lên');
    if (!dto.stops.some((s) => s.canDropoff !== false)) throw new BadRequestException('Tuyến cần ít nhất một điểm cho khách xuống');
    const times = dto.schedules.filter((s) => s.isActive !== false).map((s) => s.departTime);
    if (new Set(times).size !== times.length) throw new BadRequestException('Có giờ xuất bến bị trùng');
  }

  private routeData(dto: ShuttleRouteDto) {
    return {
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      vehicleTypeId: dto.vehicleTypeId,
      capacity: dto.capacity,
      durationMinutes: dto.durationMinutes,
      adultPrice: dto.adultPrice,
      childPrice: dto.childPrice ?? 0,
      agentAdultPrice: dto.agentAdultPrice ?? null,
      agentChildPrice: dto.agentChildPrice ?? null,
      notes: dto.notes?.trim() || null,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };
  }

  async createRoute(dto: ShuttleRouteDto) {
    this.checkRoute(dto);
    try {
      const route = await this.prisma.shuttleRoute.create({
        data: {
          ...this.routeData(dto),
          stops: { create: dto.stops.map((s, i) => this.stopData(s, i)) },
          schedules: { create: dto.schedules.map((s) => this.scheduleData(s)) },
        },
      });
      return this.routeOne(route.id);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Mã tuyến đã có');
      throw e;
    }
  }

  private stopData(s: ShuttleRouteDto['stops'][number], i: number) {
    return {
      seq: i + 1,
      name: s.name.trim(),
      kind: s.kind,
      address: s.address?.trim() || null,
      offsetMinutes: s.offsetMinutes,
      surcharge: s.surcharge ?? 0,
      canPickup: s.canPickup ?? true,
      canDropoff: s.canDropoff ?? true,
      isActive: true,
    };
  }

  private scheduleData(s: ShuttleRouteDto['schedules'][number]) {
    return {
      departTime: s.departTime,
      weekdays: [...new Set(s.weekdays)].sort(),
      validFrom: s.validFrom ? new Date(s.validFrom) : null,
      validTo: s.validTo ? new Date(s.validTo) : null,
      capacity: s.capacity ?? null,
      isActive: s.isActive ?? true,
    };
  }

  /** Sửa tuyến: điểm dừng / giờ chạy cũ bị bỏ thì ẩn đi (giữ liên kết với các lượt đặt và chuyến đã tạo) */
  async updateRoute(id: number, dto: ShuttleRouteDto) {
    this.checkRoute(dto);
    const current = await this.prisma.shuttleRoute.findUnique({ where: { id }, include: { stops: true, schedules: true } });
    if (!current) throw new NotFoundException('Không có tuyến này');
    const keepStops = new Set(dto.stops.map((s) => s.id).filter(Boolean));
    const keepSchedules = new Set(dto.schedules.map((s) => s.id).filter(Boolean));
    for (const s of dto.stops) if (s.id && !current.stops.some((c) => c.id === s.id)) throw new BadRequestException('Điểm dừng không thuộc tuyến này');
    for (const s of dto.schedules) if (s.id && !current.schedules.some((c) => c.id === s.id)) throw new BadRequestException('Giờ chạy không thuộc tuyến này');
    try {
      await this.prisma.$transaction([
        this.prisma.shuttleRoute.update({ where: { id }, data: this.routeData(dto) }),
        this.prisma.shuttleStop.updateMany({ where: { routeId: id, id: { notIn: [...keepStops] as number[] } }, data: { isActive: false } }),
        ...dto.stops.map((s, i) =>
          s.id ? this.prisma.shuttleStop.update({ where: { id: s.id }, data: this.stopData(s, i) }) : this.prisma.shuttleStop.create({ data: { ...this.stopData(s, i), routeId: id } }),
        ),
        this.prisma.shuttleSchedule.updateMany({ where: { routeId: id, id: { notIn: [...keepSchedules] as number[] } }, data: { isActive: false } }),
        ...dto.schedules.map((s) =>
          s.id ? this.prisma.shuttleSchedule.update({ where: { id: s.id }, data: this.scheduleData(s) }) : this.prisma.shuttleSchedule.create({ data: { ...this.scheduleData(s), routeId: id } }),
        ),
      ]);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Mã tuyến đã có');
      throw e;
    }
    // Giờ chạy bị tắt / đổi giờ / tuyến ngừng: xóa ngay các chuyến tới chưa có khách không còn khớp lịch
    await this.pruneRuns({ routeId: id });
    return this.routeOne(id);
  }

  /** Xóa tuyến: chưa có chuyến nào thì xóa hẳn, có rồi thì ngừng sử dụng */
  async removeRoute(id: number) {
    const runs = await this.prisma.shuttleRun.count({ where: { routeId: id, trips: { some: {} } } });
    if (runs) {
      await this.prisma.shuttleRoute.update({ where: { id }, data: { isActive: false } });
      return { message: 'Tuyến đã có khách đặt nên được chuyển sang ngừng sử dụng' };
    }
    await this.prisma.$transaction([this.prisma.shuttleRun.deleteMany({ where: { routeId: id } }), this.prisma.shuttleRoute.delete({ where: { id } })]);
    return { message: 'Đã xóa tuyến' };
  }

  private routeOne(id: number) {
    return this.prisma.shuttleRoute.findUniqueOrThrow({
      where: { id },
      include: { vehicleType: { select: { id: true, name: true, seats: true } }, stops: { orderBy: { seq: 'asc' } }, schedules: { orderBy: { departTime: 'asc' } } },
    });
  }

  // ───── Chuyến xe ghép ─────

  /** Tạo các chuyến theo lịch cố định trong khoảng ngày (nếu chưa có) */
  async ensureRuns(from: string, to: string) {
    const start = startOfVnDay(from).getTime();
    const end = startOfVnDay(to).getTime();
    if (end < start || end - start > 62 * DAY_MS) throw new BadRequestException('Khoảng ngày không hợp lệ (tối đa 2 tháng)');
    const routes = await this.prisma.shuttleRoute.findMany({ where: { isActive: true }, include: { schedules: { where: { isActive: true } } } });
    const rows: Prisma.ShuttleRunCreateManyInput[] = [];
    for (let t = start; t <= end; t += DAY_MS) {
      const ymd = vnYmd(new Date(t + 12 * 3_600_000));
      for (const r of routes) {
        for (const s of r.schedules) {
          if (!scheduleRunsOn(s, ymd)) continue;
          rows.push({ routeId: r.id, scheduleId: s.id, departAt: new Date(`${ymd}T${s.departTime}:00+07:00`), capacity: s.capacity ?? r.capacity, vehicleTypeId: r.vehicleTypeId });
        }
      }
    }
    if (rows.length) await this.prisma.shuttleRun.createMany({ data: rows, skipDuplicates: true });
    // Chuyến đã có (vd còn khách) đang gắn giờ chạy cũ đã tắt / đổi, mà lịch hiện tại có giờ trùng: gắn sang giờ chạy đó
    const linked = await this.prisma.shuttleRun.findMany({
      where: { departAt: { gte: new Date(start), lt: new Date(end + DAY_MS) }, scheduleId: { not: null }, routeId: { in: routes.map((r) => r.id) } },
      include: { schedule: true },
    });
    for (const run of linked) {
      if (run.schedule && runMatches(run.schedule, true, run.departAt)) continue;
      const match = routes.find((r) => r.id === run.routeId)?.schedules.find((s) => runMatches(s, true, run.departAt));
      if (match) await this.prisma.shuttleRun.update({ where: { id: run.id }, data: { scheduleId: match.id } });
    }
    await this.pruneRuns({ from: new Date(start), to: new Date(end + DAY_MS) });
  }

  /**
   * Dọn chuyến theo lịch không còn khớp (giờ chạy đã tắt / đổi giờ / đổi ngày trong tuần / hết hiệu lực, tuyến ngừng chạy):
   * chưa có lượt đặt nào thì xóa; đã có khách thì giữ lại (hiện nhãn "Đã bỏ khỏi lịch" để điều hành chuyển khách).
   * Chuyến còn khớp và chưa có khách: cập nhật số ghế / loại xe theo lịch hiện tại. Chuyến tạo thêm bằng tay không bị đụng tới.
   * Chỉ xét chuyến từ đầu hôm nay trở đi (chuyến đã qua giữ nguyên làm lịch sử).
   */
  async pruneRuns(opts: { from?: Date; to?: Date; routeId?: number } = {}) {
    const today = startOfVnDay(vnYmd(new Date()));
    const from = opts.from && opts.from > today ? opts.from : today;
    const runs = await this.prisma.shuttleRun.findMany({
      where: { scheduleId: { not: null }, departAt: { gte: from, ...(opts.to && { lt: opts.to }) }, ...(opts.routeId && { routeId: opts.routeId }), trips: { none: {} } },
      include: { schedule: true, route: { select: { isActive: true, capacity: true, vehicleTypeId: true } } },
    });
    const stale: number[] = [];
    for (const run of runs) {
      if (!run.schedule || !runMatches(run.schedule, run.route.isActive, run.departAt)) stale.push(run.id);
      else {
        const capacity = run.schedule.capacity ?? run.route.capacity;
        if (run.capacity !== capacity || run.vehicleTypeId !== run.route.vehicleTypeId) {
          await this.prisma.shuttleRun.update({ where: { id: run.id }, data: { capacity, vehicleTypeId: run.route.vehicleTypeId } });
        }
      }
    }
    if (stale.length) await this.prisma.shuttleRun.deleteMany({ where: { id: { in: stale }, trips: { none: {} } } });
    return stale.length;
  }

  /** Số ghế đã giữ theo chuyến: đã xác nhận (booking xác nhận / hoàn thành) và đang giữ chỗ (booking nháp / báo giá) */
  private async seatCounts(runIds: number[]) {
    if (!runIds.length) return new Map<number, { confirmed: number; held: number; bookings: number }>();
    const trips = await this.prisma.bookingTrip.findMany({
      where: { shuttleRunId: { in: runIds }, ...ACTIVE_SEAT },
      select: { shuttleRunId: true, passengers: true, booking: { select: { status: true } } },
    });
    const map = new Map<number, { confirmed: number; held: number; bookings: number }>();
    for (const t of trips) {
      const m = map.get(t.shuttleRunId!) ?? { confirmed: 0, held: 0, bookings: 0 };
      if (t.booking.status === BookingStatus.XAC_NHAN || t.booking.status === BookingStatus.HOAN_THANH) m.confirmed += t.passengers;
      else m.held += t.passengers;
      m.bookings += 1;
      map.set(t.shuttleRunId!, m);
    }
    return map;
  }

  /** Các chuyến trong ngày (hoặc khoảng ngày), kèm số ghế đã bán / còn trống */
  async listRuns(q: { date?: string; from?: string; to?: string; routeId?: number }) {
    const from = q.from ?? q.date ?? vnYmd(new Date());
    const to = q.to ?? q.date ?? from;
    await this.ensureRuns(from, to);
    const runs = await this.prisma.shuttleRun.findMany({
      where: { departAt: { gte: startOfVnDay(from), lt: new Date(startOfVnDay(to).getTime() + DAY_MS) }, ...(q.routeId && { routeId: q.routeId }) },
      include: runInclude,
      orderBy: [{ departAt: 'asc' }, { route: { sortOrder: 'asc' } }],
    });
    const seats = await this.seatCounts(runs.map((r) => r.id));
    // Tiến trình chạy theo các lượt khách đã điều
    const progress = await this.prisma.bookingTrip.groupBy({ by: ['shuttleRunId', 'status'], where: { shuttleRunId: { in: runs.map((r) => r.id) }, ...ACTIVE_SEAT }, _count: true });
    return runs.map((r) => {
      const s = seats.get(r.id) ?? { confirmed: 0, held: 0, bookings: 0 };
      const st = progress.filter((p) => p.shuttleRunId === r.id);
      return {
        ...r,
        seatsConfirmed: s.confirmed,
        seatsHeld: s.held,
        seatsLeft: Math.max(0, r.capacity - s.confirmed - s.held),
        bookingCount: s.bookings,
        // Chuyến theo lịch nhưng giờ chạy đã tắt / đổi (còn khách nên chưa xóa): cần chuyển khách sang giờ khác
        offSchedule: !!r.scheduleId && (!r.schedule || !runMatches(r.schedule, r.route.isActive, r.departAt)),
        tripStatus: st.length ? (st.every((p) => p.status === TripStatus.HOAN_THANH) ? 'HOAN_THANH' : st.some((p) => ['DANG_DEN_DON', 'DA_DON_KHACH', 'HOAN_THANH'].includes(p.status)) ? 'DANG_CHAY' : st.some((p) => p.status !== TripStatus.CHO_DIEU) ? 'DA_DIEU' : 'CHO_DIEU') : null,
      };
    });
  }

  /** Chuyến xe ghép có khách đã xác nhận mà chưa điều xe, từ đầu hôm nay đến N ngày tới (nhắc ở trang Điều xe) */
  async pending(days = 7) {
    const from = startOfVnDay(vnYmd(new Date()));
    const runs = await this.prisma.shuttleRun.findMany({
      where: {
        departAt: { gte: from, lt: new Date(from.getTime() + days * DAY_MS) },
        status: { not: ShuttleRunStatus.HUY },
        vehicleId: null,
        partnerId: null,
        trips: { some: { status: { not: TripStatus.HUY }, booking: { status: { in: [BookingStatus.XAC_NHAN, BookingStatus.HOAN_THANH] } } } },
      },
      select: { id: true, departAt: true, route: { select: { id: true, name: true } } },
      orderBy: { departAt: 'asc' },
    });
    return runs.map((r) => ({ id: r.id, departAt: r.departAt, routeId: r.route.id, routeName: r.route.name }));
  }

  /** Chuyến còn bán (cho ô chọn giờ chạy khi nhập booking) */
  async availability(routeId: number, date: string) {
    const runs = await this.listRuns({ date, routeId });
    return runs.filter((r) => r.status !== ShuttleRunStatus.HUY);
  }

  /** Chi tiết chuyến + danh sách khách theo điểm đón */
  async getRun(id: number) {
    const run = await this.prisma.shuttleRun.findUnique({ where: { id }, include: { ...runInclude, route: { include: { stops: { orderBy: { seq: 'asc' } } } } } });
    if (!run) throw new NotFoundException('Không có chuyến xe ghép này');
    const trips = await this.prisma.bookingTrip.findMany({
      where: { shuttleRunId: id },
      include: {
        shuttlePickupStop: true,
        shuttleDropoffStop: true,
        booking: {
          select: {
            id: true,
            code: true,
            status: true,
            contactName: true,
            contactPhone: true,
            customerRef: true,
            leaderName: true,
            leaderPhone: true,
            // Khách đi (tên, giới tính, năm sinh, quốc tịch, SĐT) cho lệnh gửi nhà xe cung cấp
            passengers: { select: { seq: true, fullName: true, gender: true, birthYear: true, nationality: true, phone: true }, orderBy: { seq: 'asc' } },
            customer: { select: { name: true, type: true } },
            payments: { select: { amount: true } },
            trips: { select: { amount: true, status: true } },
            discountAmount: true,
            notes: true,
          },
        },
      },
      orderBy: [{ pickupTime: 'asc' }, { id: 'asc' }],
    });
    const seats = (await this.seatCounts([id])).get(id) ?? { confirmed: 0, held: 0, bookings: 0 };
    return {
      ...run,
      seatsConfirmed: seats.confirmed,
      seatsHeld: seats.held,
      seatsLeft: Math.max(0, run.capacity - seats.confirmed - seats.held),
      trips: trips.map(({ booking, ...t }) => {
        const total = booking.trips.filter((x) => x.status !== TripStatus.HUY).reduce((s, x) => s + Number(x.amount), 0) - Number(booking.discountAmount);
        const paid = booking.payments.reduce((s, p) => s + Number(p.amount), 0);
        const { payments: _p, trips: _t, discountAmount: _d, ...b } = booking;
        return { ...t, booking: { ...b, balance: Math.max(0, Math.round(total - paid)) } };
      }),
    };
  }

  async createRun(dto: CreateRunDto) {
    const route = await this.prisma.shuttleRoute.findUnique({ where: { id: dto.routeId } });
    if (!route) throw new NotFoundException('Không có tuyến này');
    try {
      const run = await this.prisma.shuttleRun.create({
        data: { routeId: route.id, departAt: new Date(dto.departAt), capacity: dto.capacity ?? route.capacity, vehicleTypeId: dto.vehicleTypeId ?? route.vehicleTypeId, note: dto.note?.trim() || null },
      });
      return this.getRun(run.id);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Tuyến này đã có chuyến cùng giờ xuất bến');
      throw e;
    }
  }

  async updateRun(id: number, dto: UpdateRunDto) {
    const run = await this.prisma.shuttleRun.findUniqueOrThrow({ where: { id } });
    const seats = (await this.seatCounts([id])).get(id);
    const used = (seats?.confirmed ?? 0) + (seats?.held ?? 0);
    if (dto.capacity !== undefined && dto.capacity < used) throw new BadRequestException(`Chuyến đã có ${used} khách, không giảm số ghế xuống ${dto.capacity} được`);
    if (dto.status === ShuttleRunStatus.HUY && used > 0) throw new BadRequestException(`Chuyến còn ${used} khách đã đặt: chuyển khách sang chuyến khác hoặc hủy các lượt đặt trước khi hủy chuyến`);
    await this.prisma.shuttleRun.update({
      where: { id },
      data: {
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.status && { status: dto.status }),
        ...(dto.note !== undefined && { note: dto.note?.trim() || null }),
        ...(dto.dispatchNote !== undefined && { dispatchNote: dto.dispatchNote?.trim() || null }),
        ...(dto.vehicleTypeId && { vehicleTypeId: dto.vehicleTypeId }),
      },
    });
    if (dto.dispatchNote !== undefined && run.dispatchNote !== dto.dispatchNote) await this.syncRun(id);
    return this.getRun(id);
  }

  /** Kiểm tra trùng lịch xe / lái xe với các chuyến khác (không tính các lượt của chính chuyến ghép này) */
  private async conflicts(run: { id: number; departAt: Date; endAt: Date }, vehicleId?: number | null, driverId?: number | null) {
    const busy: Prisma.BookingTripWhereInput = {
      status: { not: TripStatus.HUY },
      booking: { status: { not: BookingStatus.HUY } },
      pickupTime: { lt: run.endAt },
      endTime: { gt: run.departAt },
      OR: [{ shuttleRunId: null }, { shuttleRunId: { not: run.id } }],
    };
    const text = (rows: { pickupTime: Date; booking: { code: string } }[]) => [...new Set(rows.map((r) => `${r.booking.code} (${fmt(r.pickupTime)})`))].join(', ');
    const warnings: string[] = [];
    if (vehicleId) {
      const rows = await this.prisma.bookingTrip.findMany({ where: { ...busy, vehicleId }, select: { pickupTime: true, booking: { select: { code: true } } } });
      if (rows.length) warnings.push(`Xe đã có chuyến trùng giờ: ${text(rows)}`);
    }
    if (driverId) {
      const rows = await this.prisma.bookingTrip.findMany({ where: { ...busy, driverId }, select: { pickupTime: true, booking: { select: { code: true } } } });
      if (rows.length) warnings.push(`Lái xe đã có chuyến trùng giờ: ${text(rows)}`);
    }
    return warnings;
  }

  /** Điều xe cho cả chuyến xe ghép: mọi lượt khách nhận cùng xe / lái xe / nhà xe, chi phí chia theo số khách */
  async assign(id: number, dto: AssignRunDto, user: AuthUser) {
    const run = await this.prisma.shuttleRun.findUniqueOrThrow({ where: { id }, include: { route: true } });
    if (run.status === ShuttleRunStatus.HUY) throw new BadRequestException('Chuyến đã hủy');
    const endAt = new Date(run.departAt.getTime() + run.route.durationMinutes * 60_000);
    let data: Prisma.ShuttleRunUncheckedUpdateInput;
    if (dto.mode === 'COMPANY') {
      if (!dto.vehicleId) throw new BadRequestException('Chưa chọn xe');
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId }, include: { vehicleType: true } });
      if (!vehicle || vehicle.ownership !== Ownership.CONG_TY) throw new BadRequestException('Chỉ chọn xe công ty');
      const seats = (await this.seatCounts([id])).get(id);
      const used = (seats?.confirmed ?? 0) + (seats?.held ?? 0);
      if (vehicle.vehicleType.maxPassengers < used) throw new BadRequestException(`${vehicle.plateNumber} chỉ chở tối đa ${vehicle.vehicleType.maxPassengers} khách, chuyến đã có ${used} khách`);
      if (dto.driverId) {
        const driver = await this.prisma.driver.findUnique({ where: { id: dto.driverId } });
        if (!driver || driver.partnerId) throw new BadRequestException('Chỉ chọn lái xe công ty');
      }
      const warnings = await this.conflicts({ id, departAt: run.departAt, endAt }, dto.vehicleId, dto.driverId);
      if (warnings.length && !dto.force) throw new ConflictException({ message: warnings.join('\n'), warnings, needConfirm: true });
      data = {
        vehicleId: dto.vehicleId,
        driverId: dto.driverId ?? null,
        estimatedCost: dto.estimatedCost ?? null,
        companyPricePerPax: dto.companyPricePerPax ?? null,
        companyPrice: dto.companyPricePerPax != null ? null : (dto.companyPrice ?? null),
        partnerId: null,
        partnerCost: null,
        partnerPricePerPax: null,
        partnerPlate: null,
        partnerDriverName: null,
        partnerDriverPhone: null,
      };
    } else {
      if (!dto.partnerId) throw new BadRequestException('Chưa chọn nhà xe');
      data = {
        partnerId: dto.partnerId,
        // Theo đầu khách: tổng chuyến tính lại ở syncRun theo số khách thực tế
        partnerPricePerPax: dto.partnerPricePerPax ?? null,
        partnerCost: dto.partnerPricePerPax != null ? null : (dto.partnerCost ?? null),
        partnerPlate: dto.partnerPlate?.trim().toUpperCase() || null,
        partnerDriverName: dto.partnerDriverName?.trim() || null,
        partnerDriverPhone: dto.partnerDriverPhone?.trim() || null,
        vehicleId: null,
        driverId: null,
        estimatedCost: null,
        companyPrice: null,
        companyPricePerPax: null,
      };
    }
    await this.prisma.shuttleRun.update({ where: { id }, data: { ...data, assignedAt: new Date(), ...(dto.dispatchNote !== undefined && { dispatchNote: dto.dispatchNote?.trim() || null }) } });
    const count = await this.syncRun(id, user);
    // Một thông báo cho cả chuyến (không gửi từng lượt khách)
    const when = fmt(run.departAt);
    const after = await this.prisma.shuttleRun.findUniqueOrThrow({ where: { id } });
    if (after.driverId && after.driverId !== run.driverId) {
      await this.push.notifyDriver(after.driverId, `Chuyến xe ghép ${run.route.name}`, `${when} · ${count.trips} lượt, ${count.pax} khách`, {}, 'TRIP_NEW');
    }
    if (after.partnerId && after.partnerId !== run.partnerId) {
      await this.push.notifyPartner(after.partnerId, {
        type: 'PARTNER_TRIP_NEW',
        title: `Chuyến xe ghép ${run.route.name} – chờ nhà xe nhận`,
        body:
          after.partnerPricePerPax != null
            ? `${when} · ${count.pax} khách × ${Number(after.partnerPricePerPax).toLocaleString('vi-VN')}đ/khách = ${(count.pax * Number(after.partnerPricePerPax)).toLocaleString('vi-VN')}đ`
            : `${when} · ${count.trips} lượt, ${count.pax} khách${after.partnerCost ? ` · giá thuê cả chuyến ${Number(after.partnerCost).toLocaleString('vi-VN')}đ` : ''}`,
      });
    }
    return this.getRun(id);
  }

  /** Hủy điều xe cả chuyến: các lượt khách chưa chạy trở về chờ điều */
  async unassign(id: number, user: AuthUser) {
    const run = await this.prisma.shuttleRun.findUniqueOrThrow({ where: { id } });
    const started = await this.prisma.bookingTrip.count({ where: { shuttleRunId: id, status: { in: [TripStatus.DANG_DEN_DON, TripStatus.DA_DON_KHACH, TripStatus.HOAN_THANH] } } });
    if (started) throw new BadRequestException('Chuyến đã bắt đầu chạy, không hủy điều xe được');
    const trips = await this.prisma.bookingTrip.findMany({ where: { shuttleRunId: id, status: { in: [TripStatus.DA_GAN, TripStatus.TAI_XE_NHAN] } }, select: { id: true } });
    await this.prisma.$transaction([
      this.prisma.shuttleRun.update({
        where: { id },
        data: { vehicleId: null, driverId: null, partnerId: null, partnerCost: null, partnerPricePerPax: null, partnerPlate: null, partnerDriverName: null, partnerDriverPhone: null, estimatedCost: null, companyPrice: null, companyPricePerPax: null, assignedAt: null },
      }),
      this.prisma.bookingTrip.updateMany({
        where: { id: { in: trips.map((t) => t.id) } },
        data: { status: TripStatus.CHO_DIEU, vehicleId: null, driverId: null, partnerId: null, partnerCost: null, partnerPlate: null, partnerDriverName: null, partnerDriverPhone: null, estimatedCost: null, companyPrice: null, assignedAt: null, assignedById: null },
      }),
      ...trips.map((t) => this.prisma.tripEvent.create({ data: { tripId: t.id, status: TripStatus.CHO_DIEU, note: 'Hủy điều xe chuyến xe ghép', userId: user.id } })),
    ]);
    if (run.driverId) await this.push.notifyDriver(run.driverId, 'Chuyến xe ghép đã được chuyển', `${fmt(run.departAt)} không còn giao cho bạn`, {}, 'TRIP_MOVED');
    if (run.partnerId) await this.push.notifyPartner(run.partnerId, { type: 'PARTNER_TRIP_MOVED', title: 'Chuyến xe ghép đã được chuyển', body: `${fmt(run.departAt)} không còn giao cho nhà xe` });
    return this.getRun(id);
  }

  /** Bắt đầu chạy / hoàn thành cả chuyến (văn phòng cập nhật thay lái xe) */
  async progress(id: number, dto: RunProgressDto, user: AuthUser) {
    const run = await this.prisma.shuttleRun.findUniqueOrThrow({ where: { id } });
    if (!run.vehicleId && !run.partnerId) throw new BadRequestException('Chuyến chưa được điều xe');
    const from: TripStatus[] = dto.step === 'DANG_CHAY' ? [TripStatus.DA_GAN, TripStatus.TAI_XE_NHAN] : [TripStatus.DA_GAN, TripStatus.TAI_XE_NHAN, TripStatus.DANG_DEN_DON, TripStatus.DA_DON_KHACH];
    const to = dto.step === 'DANG_CHAY' ? TripStatus.DANG_DEN_DON : TripStatus.HOAN_THANH;
    const trips = await this.prisma.bookingTrip.findMany({ where: { shuttleRunId: id, status: { in: from }, booking: { status: { not: BookingStatus.HUY } } }, select: { id: true, bookingId: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.bookingTrip.updateMany({ where: { id: { in: trips.map((t) => t.id) } }, data: { status: to } });
      await tx.tripEvent.createMany({ data: trips.map((t) => ({ tripId: t.id, status: to, note: dto.step === 'DANG_CHAY' ? 'Chuyến xe ghép bắt đầu chạy' : 'Chuyến xe ghép hoàn thành', userId: user.id })) });
      if (to === TripStatus.HOAN_THANH) {
        // Booking đã xác nhận có mọi chuyến xong / hủy thì chuyển Hoàn thành (giống khi lái xe hoàn thành chuyến)
        for (const bookingId of new Set(trips.map((t) => t.bookingId))) {
          const open = await tx.bookingTrip.count({ where: { bookingId, status: { notIn: [TripStatus.HOAN_THANH, TripStatus.HUY] } } });
          if (open === 0) await tx.booking.updateMany({ where: { id: bookingId, status: BookingStatus.XAC_NHAN }, data: { status: BookingStatus.HOAN_THANH } });
        }
      }
    });
    return this.getRun(id);
  }

  /**
   * Đồng bộ các lượt khách với chuyến: nhận xe / lái xe / nhà xe của chuyến, chia chi phí cả chuyến theo số khách.
   * Gọi sau khi điều xe và sau mỗi lần booking thêm / sửa / hủy lượt đặt.
   */
  async syncRun(id: number, user?: AuthUser) {
    const run = await this.prisma.shuttleRun.findUnique({ where: { id } });
    if (!run) return { trips: 0, pax: 0 };
    const trips = await this.prisma.bookingTrip.findMany({
      where: { shuttleRunId: id, ...ACTIVE_SEAT },
      select: { id: true, status: true, passengers: true, booking: { select: { status: true } } },
      orderBy: { id: 'asc' },
    });
    const pax = trips.reduce((s, t) => s + t.passengers, 0);
    const assigned = !!(run.vehicleId || run.partnerId);
    if (!assigned) return { trips: trips.length, pax };
    // Nhà xe tính theo đầu khách: mỗi lượt = số khách × giá; tổng chuyến cập nhật theo số khách thực tế
    const perPax = run.partnerId && run.partnerPricePerPax != null ? Number(run.partnerPricePerPax) : null;
    const total = perPax != null ? perPax * pax : Number((run.partnerId ? run.partnerCost : run.estimatedCost) ?? 0);
    const hasCost = perPax != null || (run.partnerId ? run.partnerCost : run.estimatedCost) !== null;
    // Xe công ty: giá điều xe (doanh số xe / lái xe) theo đầu khách hoặc cả chuyến chia theo số khách
    const pricePerPax = !run.partnerId && run.companyPricePerPax != null ? Number(run.companyPricePerPax) : null;
    const priceTotal = pricePerPax != null ? pricePerPax * pax : run.companyPrice !== null ? Number(run.companyPrice) : null;
    let given = 0;
    let priceGiven = 0;
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    trips.forEach((t, i) => {
      // Lượt cuối nhận phần lẻ để tổng đúng bằng chi phí cả chuyến
      const share = !hasCost ? null : perPax != null ? perPax * t.passengers : i === trips.length - 1 ? total - given : Math.round((total * t.passengers) / Math.max(1, pax));
      if (share !== null) given += share;
      const price = run.partnerId || priceTotal === null ? null : pricePerPax != null ? pricePerPax * t.passengers : i === trips.length - 1 ? priceTotal - priceGiven : Math.round((priceTotal * t.passengers) / Math.max(1, pax));
      if (price !== null) priceGiven += price;
      // Chỉ điều các lượt của booking đã xác nhận; booking nháp / báo giá giữ ghế nhưng chưa giao xe
      const dispatchable = t.booking.status === BookingStatus.XAC_NHAN || t.booking.status === BookingStatus.HOAN_THANH;
      const base = run.partnerId
        ? { partnerId: run.partnerId, partnerPlate: run.partnerPlate, partnerDriverName: run.partnerDriverName, partnerDriverPhone: run.partnerDriverPhone, partnerCost: share, estimatedCost: share, companyPrice: null, vehicleId: null, driverId: null }
        : { vehicleId: run.vehicleId, driverId: run.driverId, estimatedCost: share, companyPrice: price, partnerId: null, partnerCost: null, partnerPlate: null, partnerDriverName: null, partnerDriverPhone: null };
      const toAssign = dispatchable && t.status === TripStatus.CHO_DIEU;
      ops.push(
        this.prisma.bookingTrip.update({
          where: { id: t.id },
          data: { ...(dispatchable && base), ...(!dispatchable && { estimatedCost: share }), dispatchNote: run.dispatchNote, ...(toAssign && { status: TripStatus.DA_GAN, assignedAt: new Date(), assignedById: user?.id ?? null }) },
        }),
      );
      if (toAssign) ops.push(this.prisma.tripEvent.create({ data: { tripId: t.id, status: TripStatus.DA_GAN, note: 'Điều xe theo chuyến xe ghép', userId: user?.id ?? null } }));
    });
    if (perPax != null && Number(run.partnerCost ?? -1) !== total) ops.push(this.prisma.shuttleRun.update({ where: { id }, data: { partnerCost: total } }));
    if (pricePerPax != null && Number(run.companyPrice ?? -1) !== priceTotal) ops.push(this.prisma.shuttleRun.update({ where: { id }, data: { companyPrice: priceTotal } }));
    if (ops.length) await this.prisma.$transaction(ops);
    return { trips: trips.length, pax };
  }

  async syncRuns(ids: Iterable<number | null | undefined>) {
    for (const id of new Set([...ids].filter((x): x is number => !!x))) await this.syncRun(id);
  }

  /** Dữ liệu kiểm tra lượt đặt khi lưu booking: chuyến, điểm dừng, số ghế còn */
  async seatCheck(runId: number, excludeTripId?: number) {
    const run = await this.prisma.shuttleRun.findUnique({ where: { id: runId }, include: { route: { include: { stops: true } } } });
    if (!run) throw new BadRequestException('Không có chuyến xe ghép này');
    const used = await this.prisma.bookingTrip.aggregate({
      where: { shuttleRunId: runId, ...ACTIVE_SEAT, ...(excludeTripId && { id: { not: excludeTripId } }) },
      _sum: { passengers: true },
    });
    return { run, used: used._sum.passengers ?? 0 };
  }
}
