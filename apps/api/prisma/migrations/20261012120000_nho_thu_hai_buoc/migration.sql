-- AlterTable
ALTER TABLE "BookingTrip" ADD COLUMN     "collectAcctAt" TIMESTAMP(3),
ADD COLUMN     "collectAcctById" INTEGER,
ADD COLUMN     "collectOpsAt" TIMESTAMP(3),
ADD COLUMN     "collectOpsById" INTEGER;

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_collectOpsById_fkey" FOREIGN KEY ("collectOpsById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_collectAcctById_fkey" FOREIGN KEY ("collectAcctById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Khoản đã nộp trước đây: coi như điều hành và kế toán đã xác nhận
UPDATE "BookingTrip" SET "collectOpsAt" = "collectSettledAt", "collectAcctAt" = "collectSettledAt" WHERE "collectSettledAt" IS NOT NULL;

-- Lái xe đã thu nhưng chưa nộp về: bỏ phiếu thu tự tạo, chờ điều hành + kế toán xác nhận mới ghi thu
DELETE FROM "Payment" WHERE "id" IN (SELECT "collectPaymentId" FROM "BookingTrip" WHERE "collectedAt" IS NOT NULL AND "collectSettledAt" IS NULL AND "collectPaymentId" IS NOT NULL);
UPDATE "BookingTrip" SET "collectPaymentId" = NULL WHERE "collectedAt" IS NOT NULL AND "collectSettledAt" IS NULL;
