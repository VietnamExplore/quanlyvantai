import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

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

  constructor(private readonly prisma: PrismaService) {}

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
  async webPush(userId: number, n: { title: string; body: string; tripId?: number | null; type?: string }) {
    const subs = await this.prisma.webPushSubscription.findMany({ where: { userId } });
    if (!subs.length) return;
    const keys = await this.vapid();
    const badge = await this.prisma.notification.count({ where: { userId, readAt: null } });
    const payload = JSON.stringify({ title: n.title, body: n.body, tripId: n.tripId ?? null, type: n.type ?? null, badge });
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

  /** Thông báo cho mọi tài khoản của một nhà xe đối tác (chuông trên web nhà xe) */
  async notifyPartner(partnerId: number | null | undefined, n: NotifyPayload) {
    if (!partnerId) return;
    try {
      const users = await this.prisma.user.findMany({ where: { partnerId, isActive: true, deletedAt: null }, select: { id: true } });
      await this.notifyUsers(
        users.map((u) => u.id),
        { ...n, link: n.link ?? (n.tripId ? `/partner?trip=${n.tripId}` : '/partner') },
      );
    } catch (e) {
      this.logger.warn(`Không gửi được thông báo nhà xe: ${(e as Error).message}`);
    }
  }

  /** Thông báo cho lái xe: lưu vào chuông trên app + đẩy tới điện thoại (nếu app đã đăng ký) */
  async notifyDriver(driverId: number | null | undefined, title: string, body: string, data: Record<string, unknown> = {}, type = 'TRIP') {
    if (!driverId) return;
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, include: { user: { select: { id: true, pushToken: true, isActive: true } } } });
    if (!driver?.user) return;
    const tripId = typeof data.tripId === 'number' ? data.tripId : null;
    await this.notifyUsers([driver.user.id], { type, title, body, tripId });
    if (driver.user.isActive) await this.webPush(driver.user.id, { title, body, tripId, type }).catch((e) => this.logger.warn(`Web Push: ${(e as Error).message}`));
    const token = driver.user.isActive ? driver.user.pushToken : null;
    if (!token) return;
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ to: token, title, body, data, sound: 'default', priority: 'high', channelId: 'trips' }),
      });
      if (!res.ok) this.logger.warn(`Gửi thông báo thất bại: HTTP ${res.status}`);
      else {
        // Máy đã gỡ app / đổi máy: bỏ mã nhận thông báo cũ (app mở lại sẽ tự đăng ký mã mới)
        const out = (await res.json().catch(() => null)) as { data?: { status?: string; message?: string; details?: { error?: string } } } | null;
        if (out?.data?.status === 'error') {
          this.logger.warn(`Gửi thông báo thất bại: ${out.data.details?.error ?? out.data.message}`);
          if (out.data.details?.error === 'DeviceNotRegistered') await this.prisma.user.update({ where: { id: driver.user.id }, data: { pushToken: null } });
        }
      }
    } catch (e) {
      this.logger.warn(`Gửi thông báo thất bại: ${(e as Error).message}`);
    }
  }
}
