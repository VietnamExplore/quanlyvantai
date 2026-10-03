import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Hạng bằng mặc định theo Luật TTATGT đường bộ 2024 (hiệu lực 01/01/2025).
// Admin kiểm tra lại và chỉnh trong phần mềm nếu cần (ví dụ thêm các hạng bằng cũ còn hiệu lực).
const vehicleTypes = [
  { code: 'XE4', name: 'Xe 4 chỗ', seats: 4, maxPassengers: 3, licenseClasses: ['B', 'C1', 'C', 'D1', 'D2', 'D'] },
  { code: 'XE7', name: 'Xe 7 chỗ', seats: 7, maxPassengers: 6, licenseClasses: ['B', 'C1', 'C', 'D1', 'D2', 'D'] },
  { code: 'LIMO9', name: 'Limousine 9 chỗ', seats: 9, maxPassengers: 8, licenseClasses: ['B', 'C1', 'C', 'D1', 'D2', 'D'] },
  { code: 'XE16', name: 'Xe 16 chỗ', seats: 16, maxPassengers: 15, licenseClasses: ['D1', 'D2', 'D'] },
  { code: 'XE29', name: 'Xe 29 chỗ', seats: 29, maxPassengers: 28, licenseClasses: ['D2', 'D'] },
  { code: 'XE35', name: 'Xe 35 chỗ', seats: 35, maxPassengers: 34, licenseClasses: ['D'] },
  { code: 'XE45', name: 'Xe 45 chỗ', seats: 45, maxPassengers: 44, licenseClasses: ['D'] },
];

async function main() {
  for (const vt of vehicleTypes) {
    await prisma.vehicleType.upsert({ where: { code: vt.code }, update: {}, create: vt });
  }

  const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error('Thiếu SEED_ADMIN_PASSWORD trong file .env');
  await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      passwordHash: await bcrypt.hash(password, 10),
      fullName: 'Quản trị hệ thống',
      roles: [Role.ADMIN],
    },
  });

  console.log(`Đã tạo ${vehicleTypes.length} loại xe và tài khoản admin "${username}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
