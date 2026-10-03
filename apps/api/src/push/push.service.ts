import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Gửi thông báo đẩy tới app lái xe qua dịch vụ Expo Push.
 * Lỗi gửi thông báo không được làm hỏng thao tác chính (điều xe vẫn thành công).
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notifyDriver(driverId: number | null | undefined, title: string, body: string, data: Record<string, unknown> = {}) {
    if (!driverId) return;
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, include: { user: { select: { pushToken: true, isActive: true } } } });
    const token = driver?.user?.isActive ? driver.user.pushToken : null;
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
