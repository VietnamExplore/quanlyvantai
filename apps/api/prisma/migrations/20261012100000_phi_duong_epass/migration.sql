-- CreateTable
CREATE TABLE "TollTransaction" (
    "id" SERIAL NOT NULL,
    "txId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'EPASS',
    "plate" TEXT NOT NULL,
    "vehicleId" INTEGER,
    "station" TEXT NOT NULL,
    "vehicleClass" INTEGER,
    "passedAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "amountNet" DECIMAL(15,2) NOT NULL,
    "vatPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "categoryCode" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "invoiceDate" DATE,
    "tripId" INTEGER,
    "tripCostId" INTEGER,
    "importedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TollTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TollTransaction_txId_key" ON "TollTransaction"("txId");

-- CreateIndex
CREATE UNIQUE INDEX "TollTransaction_tripCostId_key" ON "TollTransaction"("tripCostId");

-- CreateIndex
CREATE INDEX "TollTransaction_passedAt_idx" ON "TollTransaction"("passedAt");

-- CreateIndex
CREATE INDEX "TollTransaction_vehicleId_passedAt_idx" ON "TollTransaction"("vehicleId", "passedAt");

-- AddForeignKey
ALTER TABLE "TollTransaction" ADD CONSTRAINT "TollTransaction_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TollTransaction" ADD CONSTRAINT "TollTransaction_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "BookingTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TollTransaction" ADD CONSTRAINT "TollTransaction_tripCostId_fkey" FOREIGN KEY ("tripCostId") REFERENCES "TripCost"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Khoản mục chi phí riêng cho phí ra vào sân bay
INSERT INTO "CostCategory" ("code", "name", "sortOrder", "isActive", "driverVisible") VALUES ('PHI_SAN_BAY', 'Phí sân bay', 3, true, true) ON CONFLICT ("code") DO NOTHING;
