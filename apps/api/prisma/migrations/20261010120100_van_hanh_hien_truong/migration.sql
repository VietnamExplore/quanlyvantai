-- AlterTable
ALTER TABLE "BookingTrip" ADD COLUMN     "signoffAt" TIMESTAMP(3),
ADD COLUMN     "signoffName" TEXT,
ADD COLUMN     "signoffNote" TEXT,
ADD COLUMN     "signoffSvg" TEXT;

-- CreateTable
CREATE TABLE "FieldIncident" (
    "id" SERIAL NOT NULL,
    "tripId" INTEGER,
    "driverId" INTEGER NOT NULL,
    "vehicleId" INTEGER,
    "type" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'MOI',
    "handleNote" TEXT,
    "handledById" INTEGER,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleCheck" (
    "id" SERIAL NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "driverId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "odometerKm" INTEGER,
    "fuelLevel" INTEGER,
    "items" JSONB NOT NULL DEFAULT '[]',
    "defects" INTEGER NOT NULL DEFAULT 0,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldIncident_status_createdAt_idx" ON "FieldIncident"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FieldIncident_tripId_idx" ON "FieldIncident"("tripId");

-- CreateIndex
CREATE INDEX "VehicleCheck_vehicleId_createdAt_idx" ON "VehicleCheck"("vehicleId", "createdAt");

-- CreateIndex
CREATE INDEX "VehicleCheck_driverId_createdAt_idx" ON "VehicleCheck"("driverId", "createdAt");

-- AddForeignKey
ALTER TABLE "FieldIncident" ADD CONSTRAINT "FieldIncident_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "BookingTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldIncident" ADD CONSTRAINT "FieldIncident_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldIncident" ADD CONSTRAINT "FieldIncident_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldIncident" ADD CONSTRAINT "FieldIncident_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCheck" ADD CONSTRAINT "VehicleCheck_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCheck" ADD CONSTRAINT "VehicleCheck_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

