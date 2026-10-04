-- Bỏ ý tưởng "nhiều gói giá / loại xe": mỗi loại xe lại chỉ có 1 bảng giá thuê,
-- thay vào đó bảng giá có thêm các dòng giá tự thêm (thuê 4 tiếng, 6 tiếng, 8 tiếng…)

-- DropForeignKey
ALTER TABLE "BookingTrip" DROP CONSTRAINT "BookingTrip_rentalRateId_fkey";

-- AlterTable
ALTER TABLE "BookingTrip" DROP COLUMN "rentalRateId";

-- DropIndex
DROP INDEX "RentalRate_vehicleTypeId_idx";

-- AlterTable
ALTER TABLE "RentalRate" DROP COLUMN "isActive",
DROP COLUMN "name",
DROP COLUMN "sortOrder",
ADD COLUMN     "extraOptions" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE UNIQUE INDEX "RentalRate_vehicleTypeId_key" ON "RentalRate"("vehicleTypeId");
