import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

const isYmd = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /** Nhật ký toàn hệ thống (chỉ Admin): lọc theo ngày, người, loại đối tượng, từ khóa; phân trang trên máy chủ */
  @Get()
  @Roles(Role.ADMIN)
  async list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
    @Query('entity') entity?: string,
    @Query('q') q?: string,
    @Query('failed') failed?: string,
    @Query('page') pageQ?: string,
    @Query('pageSize') sizeQ?: string,
  ) {
    const page = Math.max(1, Number(pageQ) || 1);
    const pageSize = Math.min(Math.max(Number(sizeQ) || 100, 10), 200);
    const where: Prisma.AuditLogWhereInput = {
      ...((isYmd(from) || isYmd(to)) && {
        createdAt: {
          ...(isYmd(from) && { gte: new Date(`${from}T00:00:00+07:00`) }),
          ...(isYmd(to) && { lte: new Date(`${to}T23:59:59.999+07:00`) }),
        },
      }),
      ...(userId && Number(userId) && { userId: Number(userId) }),
      ...(entity && { entity }),
      ...(failed === '1' && { success: false }),
      ...(q?.trim() && {
        OR: [
          { entityLabel: { contains: q.trim(), mode: 'insensitive' } },
          { action: { contains: q.trim(), mode: 'insensitive' } },
          { detail: { contains: q.trim(), mode: 'insensitive' } },
          { userName: { contains: q.trim(), mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total, users] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.groupBy({ by: ['userId', 'userName'], where: { userId: { not: null } }, orderBy: { userName: 'asc' } }),
    ]);
    return { items, total, page, pageSize, users: users.map((u) => ({ id: u.userId, name: u.userName })) };
  }

  /** Lịch sử thay đổi của một booking (mọi nhân viên văn phòng xem được) */
  @Get('booking/:id')
  @Roles(...OFFICE_ROLES)
  booking(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.auditLog.findMany({ where: { bookingId: id }, orderBy: { id: 'desc' }, take: 300 });
  }
}
