-- DropIndex
DROP INDEX "RentalRate_vehicleTypeId_key";

-- AlterTable
ALTER TABLE "BookingTrip" ADD COLUMN     "rentalRateId" INTEGER;

-- AlterTable
ALTER TABLE "RentalRate" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'Giá chuẩn',
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "RentalRate_vehicleTypeId_idx" ON "RentalRate"("vehicleTypeId");

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_rentalRateId_fkey" FOREIGN KEY ("rentalRateId") REFERENCES "RentalRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Chuyến thuê theo ngày đã có (không chọn tuyến): gắn vào gói "Giá chuẩn" của loại xe
UPDATE "BookingTrip" t
SET "rentalRateId" = r."id"
FROM "RentalRate" r, "Service" s
WHERE r."vehicleTypeId" = t."vehicleTypeId"
  AND s."code" = t."serviceType"
  AND s."pricingMode" = 'THEO_NGAY'
  AND t."routePriceId" IS NULL
  AND t."rentalRateId" IS NULL;
