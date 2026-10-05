import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
    const token = driver.user.isActive ? driver.user.pushToken : null;
    if (!token) return;
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ to: token, title, body, data, sound: 'default', priority: 'high', channelId: 'trips' }),
      });
      if (!res.ok) this.logger.warn(`Gửi thông báo thất bại: HTTP ${res.status}`);
    } catch (e) {
      this.logger.warn(`Gửi thông báo thất bại: ${(e as Error).message}`);
    }
  }
}
