import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

/** Giữ thông báo trong 90 ngày */
const KEEP_DAYS = 90;

/** Chuông thông báo: mọi người dùng đã đăng nhập (văn phòng và lái xe) chỉ thấy thông báo của mình */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

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

  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
}
