-- CreateEnum
CREATE TYPE "AdvanceStatus" AS ENUM ('CHO_DUYET', 'DA_CHI', 'TU_CHOI', 'DA_HUY');

-- CreateTable
CREATE TABLE "AdvanceRequest" (
    "id" SERIAL NOT NULL,
    "driverId" INTEGER NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AdvanceStatus" NOT NULL DEFAULT 'CHO_DUYET',
    "decidedAt" TIMESTAMP(3),
    "decidedById" INTEGER,
    "decisionNote" TEXT,
    "voucherId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdvanceRequest_voucherId_key" ON "AdvanceRequest"("voucherId");

-- CreateIndex
CREATE INDEX "AdvanceRequest_driverId_idx" ON "AdvanceRequest"("driverId");

-- CreateIndex
CREATE INDEX "AdvanceRequest_status_idx" ON "AdvanceRequest"("status");

-- AddForeignKey
ALTER TABLE "AdvanceRequest" ADD CONSTRAINT "AdvanceRequest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceRequest" ADD CONSTRAINT "AdvanceRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceRequest" ADD CONSTRAINT "AdvanceRequest_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "CashVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

