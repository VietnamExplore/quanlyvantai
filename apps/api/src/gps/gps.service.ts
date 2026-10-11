import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Role, TripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

/** Chuyến đang chạy: lái xe gửi vị trí trong các trạng thái này */
const ACTIVE: TripStatus[] = [TripStatus.TAI_XE_NHAN, TripStatus.DANG_DEN_DON, TripStatus.DA_DON_KHACH];
/** Đang trên đường (theo dõi dừng lâu / mất tín hiệu) */
const MOVING: TripStatus[] = [TripStatus.DANG_DEN_DON, TripStatus.DA_DON_KHACH];
const KEEP_DAYS = 90;

export interface GpsInput {
  lat: number;
  lng: number;
  /** km/h */
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
  /** ISO time hoặc mili giây */
  at: string | number;
}

const ALERT_LABEL: Record<string, string> = {
  QUA_TOC_DO: 'Quá tốc độ',
  DUNG_LAU: 'Dừng lâu khi đang chở khách',
  MAT_TIN_HIEU: 'Mất tín hiệu GPS',
};

/** Khoảng cách (m) giữa 2 tọa độ */
function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

@Injectable()
export class GpsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Gps');
  private timer?: NodeJS.Timeout;
  private lastCleanup = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  onModuleInit() {
    // Mỗi 2 phút: kiểm tra mất tín hiệu; mỗi ngày: xóa điểm cũ hơn 90 ngày
    this.timer = setInterval(() => void this.tick(), 120_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Ngưỡng cảnh báo (Cài đặt → Giám sát GPS) */
  async config() {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: ['gpsSpeedLimit', 'gpsStopMinutes', 'gpsLostMinutes'] } } });
    const num = (k: string, d: number) => {
      const v = Number(rows.find((r) => r.key === k)?.value);
      return Number.isFinite(v) && v > 0 ? v : d;
    };
    return { speedLimit: num('gpsSpeedLimit', 80), stopMinutes: num('gpsStopMinutes', 20), lostMinutes: num('gpsLostMinutes', 10) };
  }

  /** Chuyến đang chạy của lái xe (gần giờ hiện tại nhất) */
  private async activeTrip(driverId: number) {
    const trips = await this.prisma.bookingTrip.findMany({
      where: { driverId, status: { in: ACTIVE } },
      select: { id: true, status: true, vehicleId: true, pickupTime: true, booking: { select: { code: true } } },
    });
    const now = Date.now();
    // Ưu tiên chuyến đang trên đường, rồi chuyến có giờ đón gần nhất
    return trips.sort((a, b) => Number(MOVING.includes(b.status)) - Number(MOVING.includes(a.status)) || Math.abs(+a.pickupTime - now) - Math.abs(+b.pickupTime - now))[0] ?? null;
  }

  /** App lái xe gửi lô điểm GPS */
  async ingest(driverId: number, points: GpsInput[]) {
    const now = Date.now();
    const clean = points
      .map((p) => ({ ...p, t: new Date(typeof p.at === 'number' ? p.at : Date.parse(p.at)) }))
      .filter(
        (p) =>
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng) &&
          Math.abs(p.lat) <= 90 &&
          Math.abs(p.lng) <= 180 &&
          !Number.isNaN(+p.t) &&
          +p.t > now - 3 * 86400_000 &&
          +p.t < now + 5 * 60_000,
      )
      .sort((a, b) => +a.t - +b.t);
    if (!clean.length) return { saved: 0 };
    if (clean.length > 1000) throw new BadRequestException('Gửi tối đa 1000 điểm mỗi lần');

    const [trip, driver] = await Promise.all([
      this.activeTrip(driverId),
      this.prisma.driver.findUniqueOrThrow({ where: { id: driverId }, select: { fullName: true, defaultVehicles: { select: { id: true }, take: 1 } } }),
    ]);
    const vehicleId = trip?.vehicleId ?? driver.defaultVehicles[0]?.id ?? null;
    const speedOf = (s?: number | null) => (s == null || !Number.isFinite(s) || s < 0 ? null : Math.round(s * 10) / 10);

    await this.prisma.gpsPoint.createMany({
      data: clean.map((p) => ({
        driverId,
        vehicleId,
        tripId: trip?.id ?? null,
        lat: p.lat,
        lng: p.lng,
        speed: speedOf(p.speed),
        heading: p.heading ?? null,
        accuracy: p.accuracy ?? null,
        recordedAt: p.t,
      })),
    });
    const last = clean[clean.length - 1];
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { lastLat: last.lat, lastLng: last.lng, lastSpeed: speedOf(last.speed), lastGpsAt: last.t, lastGpsTripId: trip?.id ?? null },
    });

    if (trip) await this.detect(driverId, driver.fullName, vehicleId, trip, clean.map((p) => ({ lat: p.lat, lng: p.lng, speed: speedOf(p.speed), t: p.t })));
    return { saved: clean.length, tripId: trip?.id ?? null };
  }

  /** Quá tốc độ (2 điểm liên tiếp trên ngưỡng) và dừng lâu khi đang chở khách */
  private async detect(
    driverId: number,
    driverName: string,
    vehicleId: number | null,
    trip: { id: number; status: TripStatus; booking: { code: string } },
    pts: { lat: number; lng: number; speed: number | null; t: Date }[],
  ) {
    const cfg = await this.config();
    // Quá tốc độ: 2 điểm liên tiếp vượt ngưỡng, hoặc 1 điểm vượt ngưỡng + 20 km/h
    let worst: (typeof pts)[number] | null = null;
    for (let i = 0; i < pts.length; i++) {
      const s = pts[i].speed ?? 0;
      const over = s > cfg.speedLimit && ((pts[i - 1]?.speed ?? 0) > cfg.speedLimit || s > cfg.speedLimit + 20);
      if (over && (!worst || s > (worst.speed ?? 0))) worst = pts[i];
    }
    if (worst) {
      await this.raise('QUA_TOC_DO', { driverId, driverName, vehicleId, trip, lat: worst.lat, lng: worst.lng, value: worst.speed, at: worst.t }, 15, `${worst.speed} km/h (giới hạn ${cfg.speedLimit})`);
    }

    // Dừng lâu: đang chở khách, mọi điểm trong N phút gần nhất đều đứng yên (< 3 km/h, trong bán kính 150 m)
    if (trip.status === TripStatus.DA_DON_KHACH) {
      const since = new Date(+pts[pts.length - 1].t - cfg.stopMinutes * 60_000);
      const recent = await this.prisma.gpsPoint.findMany({ where: { driverId, recordedAt: { gte: new Date(+since - 2 * 60_000) } }, orderBy: { recordedAt: 'asc' }, select: { lat: true, lng: true, speed: true, recordedAt: true } });
      if (recent.length >= 3 && +recent[0].recordedAt <= +since) {
        const still = recent.every((p) => (p.speed ?? 0) < 3 && meters(recent[0], p) < 150);
        if (still) {
          const last = recent[recent.length - 1];
          await this.raise('DUNG_LAU', { driverId, driverName, vehicleId, trip, lat: last.lat, lng: last.lng, value: Math.round((+last.recordedAt - +recent[0].recordedAt) / 60_000), at: last.recordedAt }, 60, `đứng yên ${cfg.stopMinutes}+ phút`);
        }
      }
    }
  }

  /** Tạo cảnh báo (không lặp lại cùng loại cho cùng chuyến trong `quietMin` phút) và báo điều hành */
  private async raise(
    type: string,
    x: { driverId: number; driverName: string; vehicleId: number | null; trip: { id: number; booking: { code: string } }; lat?: number; lng?: number; value?: number | null; at?: Date },
    quietMin: number,
    note: string,
  ) {
    // So theo thời điểm xảy ra (điểm gửi bù khi mất mạng mang giờ cũ), không theo giờ máy chủ
    const ref = +(x.at ?? new Date());
    const recent = await this.prisma.gpsAlert.findFirst({
      where: { type, tripId: x.trip.id, at: { gte: new Date(ref - quietMin * 60_000), lte: new Date(ref + quietMin * 60_000) } },
    });
    if (recent) return;
    const plate = x.vehicleId ? (await this.prisma.vehicle.findUnique({ where: { id: x.vehicleId }, select: { plateNumber: true } }))?.plateNumber : null;
    const alert = await this.prisma.gpsAlert.create({
      data: { type, driverId: x.driverId, vehicleId: x.vehicleId, tripId: x.trip.id, lat: x.lat ?? null, lng: x.lng ?? null, value: x.value ?? null, note, at: x.at ?? new Date() },
    });
    await this.push.notifyRoles([Role.ADMIN, Role.DIEU_HANH], {
      type: 'GPS_ALERT',
      title: `📍 ${ALERT_LABEL[type] ?? type}: ${plate ?? x.driverName}`,
      body: [x.driverName, plate, `chuyến ${x.trip.booking.code}`, note].filter(Boolean).join(' · '),
      link: `/gps?alert=${alert.id}`,
      tripId: x.trip.id,
    });
  }

  /** Mất tín hiệu: chuyến đang trên đường mà quá N phút không nhận được vị trí */
  private async tick() {
    try {
      const cfg = await this.config();
      const cutoff = new Date(Date.now() - cfg.lostMinutes * 60_000);
      const trips = await this.prisma.bookingTrip.findMany({
        where: { status: { in: MOVING }, driverId: { not: null }, driver: { lastGpsAt: { lt: cutoff, gte: new Date(Date.now() - 12 * 3600_000) } } },
        select: { id: true, vehicleId: true, booking: { select: { code: true } }, driver: { select: { id: true, fullName: true, lastGpsAt: true, lastLat: true, lastLng: true, lastGpsTripId: true } } },
      });
      for (const t of trips) {
        const d = t.driver!;
        // Chỉ cảnh báo khi trước đó app đã gửi vị trí cho chính chuyến này
        if (d.lastGpsTripId !== t.id) continue;
        const mins = Math.round((Date.now() - +d.lastGpsAt!) / 60_000);
        await this.raise('MAT_TIN_HIEU', { driverId: d.id, driverName: d.fullName, vehicleId: t.vehicleId, trip: t, lat: d.lastLat ?? undefined, lng: d.lastLng ?? undefined, value: mins }, 60, `${mins} phút chưa nhận được vị trí`);
      }
      if (Date.now() - this.lastCleanup > 86400_000) {
        this.lastCleanup = Date.now();
        const r = await this.prisma.gpsPoint.deleteMany({ where: { recordedAt: { lt: new Date(Date.now() - KEEP_DAYS * 86400_000) } } });
        if (r.count) this.logger.log(`Đã xóa ${r.count} điểm GPS cũ hơn ${KEEP_DAYS} ngày`);
      }
    } catch (e) {
      this.logger.warn((e as Error).message);
    }
  }

  // ───── Văn phòng ─────

  /** Vị trí hiện tại của các lái xe có tín hiệu trong `hours` giờ qua, kèm chuyến đang chạy */
  async live(hours = 12) {
    const drivers = await this.prisma.driver.findMany({
      where: { lastGpsAt: { gte: new Date(Date.now() - hours * 3600_000) } },
      select: { id: true, fullName: true, phone: true, lastLat: true, lastLng: true, lastSpeed: true, lastGpsAt: true, lastGpsTripId: true, defaultVehicles: { select: { plateNumber: true }, take: 1 } },
      orderBy: { lastGpsAt: 'desc' },
    });
    const tripIds = drivers.map((d) => d.lastGpsTripId).filter((x): x is number => !!x);
    const trips = await this.prisma.bookingTrip.findMany({
      where: { id: { in: tripIds } },
      select: { id: true, status: true, pickupTime: true, pickupAddress: true, dropoffAddress: true, passengers: true, vehicle: { select: { plateNumber: true } }, partnerPlate: true, booking: { select: { id: true, code: true } } },
    });
    const byId = new Map(trips.map((t) => [t.id, t]));
    const cfg = await this.config();
    return {
      config: cfg,
      drivers: drivers.map((d) => {
        const trip = d.lastGpsTripId ? byId.get(d.lastGpsTripId) : undefined;
        return {
          id: d.id,
          fullName: d.fullName,
          phone: d.phone,
          lat: d.lastLat,
          lng: d.lastLng,
          speed: d.lastSpeed,
          at: d.lastGpsAt,
          plate: trip?.vehicle?.plateNumber ?? trip?.partnerPlate ?? d.defaultVehicles[0]?.plateNumber ?? null,
          trip: trip ?? null,
        };
      }),
    };
  }

  /** Lộ trình: theo chuyến, hoặc theo lái xe / xe trong một ngày (giờ VN) */
  async track(q: { tripId?: number; driverId?: number; vehicleId?: number; date?: string }) {
    let where: Record<string, unknown>;
    if (q.tripId) where = { tripId: q.tripId };
    else {
      if (!q.date || !/^\d{4}-\d{2}-\d{2}$/.test(q.date)) throw new BadRequestException('Chọn ngày');
      const from = new Date(`${q.date}T00:00:00+07:00`);
      const to = new Date(+from + 86400_000);
      where = { ...(q.driverId && { driverId: q.driverId }), ...(q.vehicleId && { vehicleId: q.vehicleId }), recordedAt: { gte: from, lt: to } };
      if (!q.driverId && !q.vehicleId) throw new BadRequestException('Chọn lái xe hoặc xe');
    }
    const pts = await this.prisma.gpsPoint.findMany({ where, orderBy: { recordedAt: 'asc' }, select: { lat: true, lng: true, speed: true, recordedAt: true, tripId: true } });
    // Rút gọn khi quá nhiều điểm (giữ điểm đầu, cuối)
    const step = Math.ceil(pts.length / 4000) || 1;
    const out = step > 1 ? pts.filter((_, i) => i % step === 0 || i === pts.length - 1) : pts;
    let km = 0;
    let maxSpeed = 0;
    for (let i = 1; i < pts.length; i++) km += meters(pts[i - 1], pts[i]) / 1000;
    for (const p of pts) maxSpeed = Math.max(maxSpeed, p.speed ?? 0);
    const alerts = await this.prisma.gpsAlert.findMany({
      where: q.tripId ? { tripId: q.tripId } : { ...(q.driverId && { driverId: q.driverId }), ...(q.vehicleId && { vehicleId: q.vehicleId }), at: (where as { recordedAt: object }).recordedAt },
      orderBy: { at: 'asc' },
    });
    return {
      points: out.map((p) => ({ lat: p.lat, lng: p.lng, speed: p.speed, at: p.recordedAt, tripId: p.tripId })),
      count: pts.length,
      km: Math.round(km * 10) / 10,
      maxSpeed: Math.round(maxSpeed),
      start: pts[0]?.recordedAt ?? null,
      end: pts[pts.length - 1]?.recordedAt ?? null,
      alerts,
    };
  }

  async alerts(q: { days?: number; unseen?: boolean }) {
    const rows = await this.prisma.gpsAlert.findMany({
      where: { at: { gte: new Date(Date.now() - (q.days ?? 7) * 86400_000) }, ...(q.unseen && { seenAt: null }) },
      orderBy: { at: 'desc' },
      take: 300,
    });
    const [drivers, vehicles, trips] = await Promise.all([
      this.prisma.driver.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.driverId))] } }, select: { id: true, fullName: true, phone: true } }),
      this.prisma.vehicle.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.vehicleId).filter((x): x is number => !!x))] } }, select: { id: true, plateNumber: true } }),
      this.prisma.bookingTrip.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.tripId).filter((x): x is number => !!x))] } }, select: { id: true, booking: { select: { id: true, code: true } } } }),
    ]);
    return rows.map((r) => ({
      ...r,
      label: ALERT_LABEL[r.type] ?? r.type,
      driver: drivers.find((d) => d.id === r.driverId) ?? null,
      vehicle: vehicles.find((v) => v.id === r.vehicleId) ?? null,
      trip: trips.find((t) => t.id === r.tripId) ?? null,
    }));
  }

  unseenCount() {
    return this.prisma.gpsAlert.count({ where: { seenAt: null, at: { gte: new Date(Date.now() - 7 * 86400_000) } } });
  }

  markSeen(ids: number[], who: string) {
    return this.prisma.gpsAlert.updateMany({ where: { id: { in: ids }, seenAt: null }, data: { seenAt: new Date(), seenBy: who } });
  }
}
