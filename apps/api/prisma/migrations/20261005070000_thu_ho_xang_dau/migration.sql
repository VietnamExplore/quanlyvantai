-- AlterTable
ALTER TABLE "BookingTrip" ADD COLUMN     "collectAmount" DECIMAL(15,0),
ADD COLUMN     "collectMethod" "PaymentMethod",
ADD COLUMN     "collectNote" TEXT,
ADD COLUMN     "collectPaymentId" INTEGER,
ADD COLUMN     "collectSettledAt" TIMESTAMP(3),
ADD COLUMN     "collectedAmount" DECIMAL(15,0),
ADD COLUMN     "collectedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CashVoucher" ADD COLUMN     "driverId" INTEGER,
ADD COLUMN     "driverPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "liters" DECIMAL(8,2),
ADD COLUMN     "odometerKm" INTEGER,
ADD COLUMN     "receiptFile" TEXT,
ADD COLUMN     "receiptType" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BookingTrip_collectPaymentId_key" ON "BookingTrip"("collectPaymentId");

-- CreateIndex
CREATE INDEX "CashVoucher_driverId_idx" ON "CashVoucher"("driverId");

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_collectPaymentId_fkey" FOREIGN KEY ("collectPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashVoucher" ADD CONSTRAINT "CashVoucher_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

