import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as webpush from 'web-push';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { partnerRunText, partnerTripText } from './partner-mail';

/** Khóa VAPID của Web Push (tự tạo lần đầu, lưu trong cài đặt hệ thống – không trả về trang Thông tin công ty) */
const VAPID_KEY = 'sys.webpush.vapid';
const VAPID_SUBJECT = 'https://dieuxe.vietnamexplore.vn';

export interface NotifyPayload {
  /** Loại thông báo, vd. BOOKING_NEW, COLLECTED, TRIP_NEW… */
  type: string;
  title: string;
  body: string;
  /** Đường dẫn trên web khi bấm vào thông báo */
  link?: string | null;
  tripId?: number | null;
}

/**
 * Thông báo trong phần mềm (chuông trên web và app lái xe) + thông báo đẩy tới app lái xe qua Expo Push.
 * Lỗi gửi thông báo không được làm hỏng thao tác chính (lưu booking, điều xe… vẫn thành công).
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private vapidKeys?: { publicKey: string; privateKey: string };

  /** Khóa VAPID: đọc từ cài đặt, chưa có thì tạo (dùng mãi, đổi khóa thì mọi máy phải bật lại thông báo) */
  async vapid() {
    if (this.vapidKeys) return this.vapidKeys;
    const row = await this.prisma.setting.findUnique({ where: { key: VAPID_KEY } });
    let keys = row ? (JSON.parse(row.value) as { publicKey: string; privateKey: string }) : null;
    if (!keys) {
      keys = webpush.generateVAPIDKeys();
      await this.prisma.setting.upsert({ where: { key: VAPID_KEY }, create: { key: VAPID_KEY, value: JSON.stringify(keys) }, update: {} });
      // Hai tiến trình cùng tạo: dùng khóa đã lưu trước
      keys = JSON.parse((await this.prisma.setting.findUniqueOrThrow({ where: { key: VAPID_KEY } })).value);
    }
    this.vapidKeys = keys!;
    return this.vapidKeys;
  }

  /**
   * Thông báo đẩy Web Push tới app lái xe bản web (iPhone: đã thêm vào Màn hình chính, iOS 16.4+).
   * Kèm số thông báo chưa đọc để hiện số đỏ trên biểu tượng app. Đăng ký hết hạn (404 / 410) thì xóa.
   */
  async webPush(userId: number, n: { title: string; body: string; tripId?: number | null; type?: string; link?: string | null }) {
    const subs = await this.prisma.webPushSubscription.findMany({ where: { userId } });
    if (!subs.length) return;
    const keys = await this.vapid();
    const badge = await this.prisma.notification.count({ where: { userId, readAt: null } });
    const payload = JSON.stringify({ title: n.title, body: n.body, tripId: n.tripId ?? null, type: n.type ?? null, link: n.link ?? null, badge });
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
          vapidDetails: { subject: VAPID_SUBJECT, publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 6 * 3600,
          urgency: 'high',
        });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await this.prisma.webPushSubscription.deleteMany({ where: { id: sub.id } });
        else this.logger.warn(`Gửi Web Push thất bại: ${status ?? (e as Error).message}`);
      }
    }
  }

  /** Gửi tới các người dùng cụ thể (bỏ trùng, bỏ người đã khóa / đã xóa) */
  async notifyUsers(userIds: (number | null | undefined)[], n: NotifyPayload) {
    try {
      const ids = [...new Set(userIds.filter((x): x is number => !!x))];
      if (!ids.length) return;
      const active = await this.prisma.user.findMany({ where: { id: { in: ids }, isActive: true, deletedAt: null }, select: { id: true } });
      if (!active.length) return;
      await this.prisma.notification.createMany({
        data: active.map((u) => ({ userId: u.id, type: n.type, title: n.title, body: n.body, link: n.link ?? null, tripId: n.tripId ?? null })),
      });
      // Đẩy tới máy đã bật thông báo (không chờ, không làm chậm thao tác đang chạy)
      for (const u of active) void this.webPush(u.id, n).catch((e) => this.logger.warn(`Web Push: ${(e as Error).message}`));
    } catch (e) {
      this.logger.warn(`Không lưu được thông báo: ${(e as Error).message}`);
    }
  }

  /** Gửi tới mọi người dùng có một trong các vai trò; extra = thêm người cụ thể; exclude = bỏ người gây ra sự kiện */
  async notifyRoles(roles: Role[], n: NotifyPayload, opts: { exclude?: number | null; extra?: (number | null | undefined)[] } = {}) {
    try {
      const users = await this.prisma.user.findMany({ where: { isActive: true, deletedAt: null, roles: { hasSome: roles } }, select: { id: true } });
      const ids = [...users.map((u) => u.id), ...(opts.extra ?? [])].filter((id) => id !== opts.exclude);
      await this.notifyUsers(ids, n);
    } catch (e) {
      this.logger.warn(`Không gửi được thông báo: ${(e as Error).message}`);
    }
  }

  /**
   * Thông báo cho mọi tài khoản của một nhà xe đối tác (chuông trên web nhà xe) + email tới nhà xe (nếu có email và đã bật email gửi đi).
   * Giao chuyến / thay đổi chuyến: email kèm lệnh điều xe đầy đủ; runId: giao khách xe ghép cả chuyến.
   */
  async notifyPartner(partnerId: number | null | undefined, n: NotifyPayload, opts: { runId?: number } = {}) {
    if (!partnerId) return;
    const link = n.link ?? (n.tripId ? `/partner?trip=${n.tripId}` : '/partner');
    try {
      const users = await this.prisma.user.findMany({ where: { partnerId, isActive: true, deletedAt: null }, select: { id: true } });
      await this.notifyUsers(
        users.map((u) => u.id),
        { ...n, link },
      );
    } catch (e) {
      this.logger.warn(`Không gửi được thông báo nhà xe: ${(e as Error).message}`);
    }
    // Email: không chờ (SMTP chậm không làm chậm điều xe)
    void this.emailPartner(partnerId, n, link, opts).catch((e) => this.logger.warn(`Email nhà xe: ${(e as Error).message}`));
  }

  private async emailPartner(partnerId: number, n: NotifyPayload, link: string, opts: { runId?: number }) {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId }, select: { name: true, email: true } });
    const to = (partner?.email ?? '').split(/[,;\s]+/).filter((x) => x.includes('@'));
    if (!partner || !to.length) return;
    const detail = opts.runId ? await partnerRunText(this.prisma, opts.runId) : n.tripId && (n.type === 'PARTNER_TRIP_NEW' || n.type === 'PARTNER_TRIP_CHANGED') ? await partnerTripText(this.prisma, n.tripId) : '';
    const portal = process.env.PARTNER_URL?.replace(/\/+$/, '');
    const text = [
      `Kính gửi ${partner.name},`,
      '',
      n.body,
      ...(detail ? ['', detail] : []),
      '',
      ...(portal ? [`Xem chi tiết và nhận chuyến trên cổng nhà xe: ${portal}${link}`] : []),
      'Email gửi tự động từ phần mềm điều hành Vietnam Explore – cần trao đổi vui lòng liên hệ văn phòng điều hành.',
    ].join('\n');
    const r = await this.mail.send({ to, subject: n.title, text });
    if ('off' in r && r.off) return;
    // Ghi lịch sử chuyến: đã gửi / gửi lỗi
    const tripIds = n.tripId ? [n.tripId] : opts.runId ? (await this.prisma.bookingTrip.findMany({ where: { shuttleRunId: opts.runId, partnerId }, select: { id: true } })).map((t) => t.id) : [];
    if (!tripIds.length) return;
    const trips = await this.prisma.bookingTrip.findMany({ where: { id: { in: tripIds } }, select: { id: true, status: true } });
    await this.prisma.tripEvent.createMany({
      data: trips.map((t) => ({ tripId: t.id, status: t.status, note: r.ok ? `📧 Đã gửi email cho nhà xe ${partner.name} (${to.join(', ')}): ${n.title}` : `📧 Gửi email cho nhà xe ${partner.name} thất bại: ${r.reason}` })),
    });
  }

  /** Thông báo cho lái xe: lưu vào chuông trên app + đẩy tới điện thoại (nếu app đã đăng ký) */
  async notifyDriver(driverId: number | null | undefined, title: string, body: string, data: Record<string, unknown> = {}, type = 'TRIP') {
    if (!driverId) return;
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, include: { user: { select: { id: true, pushToken: true, isActive: true } } } });
    if (!driver?.user) return;
    const tripId = typeof data.tripId === 'number' ? data.tripId : null;
    // Lưu vào chuông + Web Push (app lái xe bản web) trong notifyUsers
    await this.notifyUsers([driver.user.id], { type, title, body, tripId });
    if (driver.user.isActive && driver.user.pushToken) await this.expoPush(driver.user.id, driver.user.pushToken, { title, body, data });
  }

  /**
   * Thông báo đẩy tới app Android (Expo Push → Firebase). Trả kết quả: 'ok' hoặc lý do lỗi.
   * Máy đã gỡ app / đổi máy (DeviceNotRegistered): bỏ mã nhận thông báo cũ (app mở lại sẽ tự đăng ký mã mới).
   */
  async expoPush(userId: number, token: string, n: { title: string; body: string; data?: Record<string, unknown> }): Promise<string> {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ to: token, title: n.title, body: n.body, data: n.data ?? {}, sound: 'default', priority: 'high', channelId: 'trips' }),
      });
      if (!res.ok) {
        this.logger.warn(`Gửi thông báo thất bại: HTTP ${res.status}`);
        return `HTTP ${res.status}`;
      }
      const out = (await res.json().catch(() => null)) as { data?: { status?: string; message?: string; details?: { error?: string } } } | null;
      if (out?.data?.status === 'error') {
        const why = out.data.details?.error ?? out.data.message ?? 'lỗi';
        this.logger.warn(`Gửi thông báo thất bại: ${why}`);
        if (out.data.details?.error === 'DeviceNotRegistered') await this.prisma.user.update({ where: { id: userId }, data: { pushToken: null } });
        return why;
      }
      return 'ok';
    } catch (e) {
      this.logger.warn(`Gửi thông báo thất bại: ${(e as Error).message}`);
      return (e as Error).message;
    }
  }

  /** Gửi thử 1 thông báo đẩy tới các máy của chính người dùng (nút "Gửi thông báo thử" trong app lái xe) */
  async testPush(userId: number) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true } });
    const msg = { title: '🔔 Thông báo thử', body: 'Máy này đã nhận được thông báo đẩy từ phần mềm điều xe.' };
    const android = u?.pushToken ? await this.expoPush(userId, u.pushToken, msg) : null;
    const web = await this.prisma.webPushSubscription.count({ where: { userId } });
    if (web) await this.webPush(userId, { ...msg, type: 'TEST' });
    return { android, web };
  }
}
