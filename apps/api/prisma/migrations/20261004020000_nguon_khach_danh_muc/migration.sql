-- Chuyển "Nguồn khách" của booking từ danh sách cố định (enum) sang danh mục do người dùng quản lý.
-- Viết tay để giữ nguyên dữ liệu: đổi kiểu cột tại chỗ thay vì xóa và tạo lại.

-- CreateTable
CREATE TABLE "CustomerSource" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CustomerSource_pkey" PRIMARY KEY ("code")
);

-- Các nguồn trước đây (giữ nguyên mã để dữ liệu cũ liên kết được) + OTA
INSERT INTO "CustomerSource" ("code", "name", "sortOrder") VALUES
    ('HOTLINE', 'Hotline', 1),
    ('ZALO', 'Zalo', 2),
    ('WEBSITE', 'Website', 3),
    ('EMAIL', 'Email', 4),
    ('DAI_LY', 'Đại lý', 5),
    ('OTA', 'OTA (Booking.com, Agoda, Traveloka, Klook…)', 6),
    ('KHAC', 'Khác', 99);

-- Đổi kiểu cột tại chỗ (enum -> text), giữ nguyên giá trị
ALTER TABLE "Booking" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "Booking" ALTER COLUMN "source" SET DATA TYPE TEXT USING "source"::text;
ALTER TABLE "Booking" ALTER COLUMN "source" SET DEFAULT 'HOTLINE';

-- DropEnum
DROP TYPE "BookingSource";

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_source_fkey" FOREIGN KEY ("source") REFERENCES "CustomerSource"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
