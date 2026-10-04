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

// GIÁ MẪU để dùng thử: Admin/Kế toán sửa lại theo giá thực tế của công ty.
// [giá 1 ngày, giá nửa ngày, vượt km, vượt giờ]
const sampleRentalRates: Record<string, [number, number, number, number]> = {
  XE4: [1_200_000, 700_000, 10_000, 80_000],
  XE7: [1_400_000, 850_000, 12_000, 90_000],
  LIMO9: [2_200_000, 1_300_000, 15_000, 150_000],
  XE16: [1_800_000, 1_100_000, 15_000, 120_000],
  XE29: [2_800_000, 1_700_000, 20_000, 150_000],
  XE35: [3_200_000, 2_000_000, 22_000, 180_000],
  XE45: [3_800_000, 2_400_000, 25_000, 200_000],
};

const defaultSettings: Record<string, string> = {
  companyName: 'CÔNG TY DU LỊCH (sửa trong Cài đặt)',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
  companyTaxCode: '',
  bankInfo: '',
  quoteFooter:
    'Giá đã bao gồm: xe đời mới, tài xế, xăng dầu, phí cầu đường thông thường.\n' +
    'Giá chưa bao gồm: VAT, phí bến bãi tại điểm tham quan, ăn ở của tài xế (nếu có).\n' +
    'Báo giá có hiệu lực 7 ngày.',
};

async function main() {
  for (const vt of vehicleTypes) {
    const type = await prisma.vehicleType.upsert({ where: { code: vt.code }, update: {}, create: vt });
    const r = sampleRentalRates[vt.code];
    if (r) {
      await prisma.rentalRate.upsert({
        where: { vehicleTypeId: type.id },
        update: {},
        create: {
          vehicleTypeId: type.id,
          fullDayPrice: r[0],
          halfDayPrice: r[1],
          extraKmPrice: r[2],
          extraHourPrice: r[3],
          driverOvernightFee: 300_000,
        },
      });
    }
  }

  if ((await prisma.surcharge.count()) === 0) {
    await prisma.surcharge.createMany({
      data: [
        { name: 'Phụ thu ban đêm (22h–5h)', rule: 'BAN_DEM', isPercent: true, value: 20 },
        { name: 'Phụ thu Lễ, Tết', rule: 'LE_TET', isPercent: true, value: 30 },
        { name: 'Đón / trả thêm điểm', rule: 'THU_CONG', isPercent: false, value: 100_000 },
        { name: 'Phí bến bãi', rule: 'THU_CONG', isPercent: false, value: 50_000 },
      ],
    });
  }

  for (const [key, value] of Object.entries(defaultSettings)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
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
