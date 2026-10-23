import { Body, Controller, Get, Headers, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';
import { WebPushSubscribeDto } from './webpush.dto';

/** Giữ thông báo trong 90 ngày */
const KEEP_DAYS = 90;

/** Chuông thông báo: mọi người dùng đã đăng nhập (văn phòng và lái xe) chỉ thấy thông báo của mình */
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query('limit') limitQ?: string) {
    const take = Math.min(Math.max(Number(limitQ) || 30, 1), 100);
    // Dọn thông báo cũ của người này
    await this.prisma.notification.deleteMany({ where: { userId: user.id, createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } });
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId: user.id }, orderBy: { id: 'desc' }, take }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return { items, unread };
  }

  /** Số chưa đọc + mã thông báo mới nhất (để web / app biết có thông báo mới mà hiện nhắc) */
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    const [unread, latest] = await Promise.all([
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
      this.prisma.notification.findFirst({ where: { userId: user.id }, orderBy: { id: 'desc' }, select: { id: true } }),
    ]);
    return { unread, latestId: latest?.id ?? 0 };
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() user: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  // ───── Thông báo đẩy trên web văn phòng / cổng nhà xe (máy tính, Android, iPhone đã thêm vào Màn hình chính) ─────

  @Get('webpush/key')
  async webPushKey() {
    return { publicKey: (await this.push.vapid()).publicKey };
  }

  @Post('webpush/subscribe')
  @HttpCode(200)
  async webPushSubscribe(@CurrentUser() user: AuthUser, @Body() dto: WebPushSubscribeDto, @Headers('user-agent') ua?: string) {
    const data = { userId: user.id, p256dh: dto.keys.p256dh, auth: dto.keys.auth, userAgent: ua?.slice(0, 300) ?? null };
    await this.prisma.webPushSubscription.upsert({ where: { endpoint: dto.endpoint }, create: { endpoint: dto.endpoint, ...data }, update: data });
    return { ok: true };
  }

  @Post('webpush/unsubscribe')
  @HttpCode(200)
  async webPushUnsubscribe(@CurrentUser() user: AuthUser, @Body() dto: { endpoint?: string }) {
    if (dto?.endpoint) await this.prisma.webPushSubscription.deleteMany({ where: { endpoint: dto.endpoint, userId: user.id } });
    return { ok: true };
  }

  @Post('webpush/test')
  @HttpCode(200)
  async webPushTest(@CurrentUser() user: AuthUser) {
    await this.push.webPush(user.id, { title: '🔔 Thông báo đã bật', body: 'Máy này sẽ nhận thông báo booking, điều xe, nhà xe… kể cả khi đóng phần mềm.', type: 'TEST', link: null });
    return { ok: true };
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
}
