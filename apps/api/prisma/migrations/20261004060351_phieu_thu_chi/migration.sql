-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('THU', 'CHI');

-- CreateTable
CREATE TABLE "CashVoucher" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "type" "VoucherType" NOT NULL,
    "date" DATE NOT NULL,
    "categoryCode" TEXT,
    "title" TEXT,
    "vehicleId" INTEGER,
    "partnerId" INTEGER,
    "counterparty" TEXT,
    "amount" DECIMAL(15,0) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'TIEN_MAT',
    "reference" TEXT,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashVoucher_code_key" ON "CashVoucher"("code");

-- CreateIndex
CREATE INDEX "CashVoucher_date_idx" ON "CashVoucher"("date");

-- CreateIndex
CREATE INDEX "CashVoucher_vehicleId_idx" ON "CashVoucher"("vehicleId");

-- CreateIndex
CREATE INDEX "CashVoucher_partnerId_idx" ON "CashVoucher"("partnerId");

-- AddForeignKey
ALTER TABLE "CashVoucher" ADD CONSTRAINT "CashVoucher_categoryCode_fkey" FOREIGN KEY ("categoryCode") REFERENCES "CostCategory"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashVoucher" ADD CONSTRAINT "CashVoucher_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashVoucher" ADD CONSTRAINT "CashVoucher_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashVoucher" ADD CONSTRAINT "CashVoucher_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
