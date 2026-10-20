import type { PrismaService } from '../prisma/prisma.service';

/** Nhân viên kinh doanh được tính mọi booking OTA (email OTA, TOTO): tài khoản "Sale team" (saleteam) */
export const OTA_SALES_USERNAME = 'saleteam';

export async function otaSalesUserId(prisma: PrismaService) {
  const u =
    (await prisma.user.findFirst({ where: { username: OTA_SALES_USERNAME, deletedAt: null }, select: { id: true } })) ??
    (await prisma.user.findFirst({ where: { fullName: { equals: 'Sale team', mode: 'insensitive' }, deletedAt: null }, select: { id: true } }));
  return u?.id ?? null;
}
