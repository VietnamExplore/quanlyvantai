-- AlterTable
ALTER TABLE "CostCategory" ADD COLUMN     "driverVisible" BOOLEAN NOT NULL DEFAULT true;

-- Lương / tiền chuyến tài xế và tạm ứng: văn phòng nhập, lái xe không chọn trên app
UPDATE "CostCategory" SET "driverVisible" = false WHERE code IN ('LUONG_TAI_XE', 'TAM_UNG');
