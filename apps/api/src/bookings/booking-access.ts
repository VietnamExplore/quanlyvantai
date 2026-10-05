import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.decorators';
import type { PrismaService } from '../prisma/prisma.service';

/** Admin sửa mọi booking; người khác chỉ sửa booking do mình tạo hoặc mình là NV kinh doanh phụ trách */
export const canEditBooking = (b: { createdById: number; salesUserId: number | null }, user: AuthUser) =>
  user.roles.includes(Role.ADMIN) || b.createdById === user.id || b.salesUserId === user.id;

export async function assertCanEditBooking(prisma: PrismaService, id: number, user: AuthUser) {
  const b = await prisma.booking.findUnique({
    where: { id },
    select: { code: true, createdById: true, salesUserId: true, createdBy: { select: { fullName: true } }, salesUser: { select: { fullName: true } } },
  });
  if (!b) throw new NotFoundException('Không tìm thấy booking');
  if (!canEditBooking(b, user)) {
    const owner =
      !b.salesUser || b.salesUserId === b.createdById ? `của ${b.createdBy.fullName}` : `do ${b.createdBy.fullName} tạo, NV ${b.salesUser.fullName} phụ trách`;
    throw new ForbiddenException(`Booking ${b.code} ${owner}. Bạn chỉ được sửa booking của mình.`);
  }
}
