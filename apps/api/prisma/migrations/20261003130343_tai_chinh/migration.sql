-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('TIEN_MAT', 'CHUYEN_KHOAN', 'THE', 'KHAC');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "paymentTermDays" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CostCategory" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CostCategory_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "TripCost" (
    "id" SERIAL NOT NULL,
    "tripId" INTEGER NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "spentAt" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "byDriver" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CHUYEN_KHOAN',
    "paidAt" DATE NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerPayment" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CHUYEN_KHOAN',
    "paidAt" DATE NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripCost_tripId_idx" ON "TripCost"("tripId");

-- CreateIndex
CREATE INDEX "TripCost_spentAt_idx" ON "TripCost"("spentAt");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");

-- CreateIndex
CREATE INDEX "PartnerPayment_partnerId_idx" ON "PartnerPayment"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerPayment_paidAt_idx" ON "PartnerPayment"("paidAt");

-- AddForeignKey
ALTER TABLE "TripCost" ADD CONSTRAINT "TripCost_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "BookingTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCost" ADD CONSTRAINT "TripCost_categoryCode_fkey" FOREIGN KEY ("categoryCode") REFERENCES "CostCategory"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCost" ADD CONSTRAINT "TripCost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPayment" ADD CONSTRAINT "PartnerPayment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPayment" ADD CONSTRAINT "PartnerPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
