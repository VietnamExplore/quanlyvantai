-- Chuyển "Dịch vụ" từ danh sách cố định (enum) sang danh mục do Admin quản lý.
-- Viết tay để giữ nguyên dữ liệu: đổi kiểu cột tại chỗ thay vì xóa và tạo lại.

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('TUYEN', 'THEO_NGAY');

-- CreateTable
CREATE TABLE "Service" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'TUYEN',
    "hasFlight" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("code")
);

-- 5 dịch vụ trước đây, giữ nguyên mã để dữ liệu cũ liên kết được
INSERT INTO "Service" ("code", "name", "pricingMode", "hasFlight", "color", "sortOrder") VALUES
    ('DON_TIEN_SAN_BAY', 'Đón/tiễn sân bay', 'TUYEN', true, 'blue', 1),
    ('THEO_TUYEN', 'Đưa đón theo tuyến', 'TUYEN', false, 'cyan', 2),
    ('CITY_TOUR', 'City tour', 'THEO_NGAY', false, 'green', 3),
    ('THUE_THEO_NGAY', 'Thuê xe theo ngày', 'THEO_NGAY', false, 'purple', 4),
    ('TOUR_NHIEU_NGAY', 'Tour nhiều ngày', 'THEO_NGAY', false, 'magenta', 5);

-- Đổi kiểu cột tại chỗ (enum -> text), giữ nguyên giá trị
ALTER TABLE "RoutePrice" ALTER COLUMN "serviceType" DROP DEFAULT;
ALTER TABLE "RoutePrice" ALTER COLUMN "serviceType" SET DATA TYPE TEXT USING "serviceType"::text;
ALTER TABLE "RoutePrice" ALTER COLUMN "serviceType" SET DEFAULT 'THEO_TUYEN';
ALTER TABLE "BookingTrip" ALTER COLUMN "serviceType" SET DATA TYPE TEXT USING "serviceType"::text;

-- DropEnum
DROP TYPE "ServiceType";

-- AddForeignKey
ALTER TABLE "RoutePrice" ADD CONSTRAINT "RoutePrice_serviceType_fkey" FOREIGN KEY ("serviceType") REFERENCES "Service"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_serviceType_fkey" FOREIGN KEY ("serviceType") REFERENCES "Service"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
