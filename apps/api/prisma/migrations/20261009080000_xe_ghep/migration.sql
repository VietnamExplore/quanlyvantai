-- CreateEnum
CREATE TYPE "ShuttleStopKind" AS ENUM ('DIEM_DUNG', 'KHU_VUC');

-- CreateEnum
CREATE TYPE "ShuttleRunStatus" AS ENUM ('MO_BAN', 'DONG_BAN', 'HUY');

-- AlterEnum
ALTER TYPE "PricingMode" ADD VALUE 'XE_GHEP';

-- AlterTable
ALTER TABLE "BookingTrip" ADD COLUMN     "childCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shuttleDropoffStopId" INTEGER,
ADD COLUMN     "shuttlePickupStopId" INTEGER,
ADD COLUMN     "shuttleRunId" INTEGER;

-- CreateTable
CREATE TABLE "ShuttleRoute" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicleTypeId" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "adultPrice" DECIMAL(15,0) NOT NULL,
    "childPrice" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "agentAdultPrice" DECIMAL(15,0),
    "agentChildPrice" DECIMAL(15,0),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShuttleRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShuttleStop" (
    "id" SERIAL NOT NULL,
    "routeId" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ShuttleStopKind" NOT NULL DEFAULT 'DIEM_DUNG',
    "address" TEXT,
    "offsetMinutes" INTEGER NOT NULL DEFAULT 0,
    "surcharge" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "canPickup" BOOLEAN NOT NULL DEFAULT true,
    "canDropoff" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShuttleStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShuttleSchedule" (
    "id" SERIAL NOT NULL,
    "routeId" INTEGER NOT NULL,
    "departTime" TEXT NOT NULL,
    "weekdays" INTEGER[],
    "validFrom" DATE,
    "validTo" DATE,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShuttleSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShuttleRun" (
    "id" SERIAL NOT NULL,
    "routeId" INTEGER NOT NULL,
    "scheduleId" INTEGER,
    "departAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "vehicleTypeId" INTEGER NOT NULL,
    "status" "ShuttleRunStatus" NOT NULL DEFAULT 'MO_BAN',
    "note" TEXT,
    "vehicleId" INTEGER,
    "driverId" INTEGER,
    "partnerId" INTEGER,
    "partnerPlate" TEXT,
    "partnerDriverName" TEXT,
    "partnerDriverPhone" TEXT,
    "partnerCost" DECIMAL(15,0),
    "estimatedCost" DECIMAL(15,0),
    "dispatchNote" TEXT,
    "assignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShuttleRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShuttleRoute_code_key" ON "ShuttleRoute"("code");

-- CreateIndex
CREATE INDEX "ShuttleRun_departAt_idx" ON "ShuttleRun"("departAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShuttleRun_routeId_departAt_key" ON "ShuttleRun"("routeId", "departAt");

-- CreateIndex
CREATE INDEX "BookingTrip_shuttleRunId_idx" ON "BookingTrip"("shuttleRunId");

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_shuttleRunId_fkey" FOREIGN KEY ("shuttleRunId") REFERENCES "ShuttleRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_shuttlePickupStopId_fkey" FOREIGN KEY ("shuttlePickupStopId") REFERENCES "ShuttleStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_shuttleDropoffStopId_fkey" FOREIGN KEY ("shuttleDropoffStopId") REFERENCES "ShuttleStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShuttleRoute" ADD CONSTRAINT "ShuttleRoute_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "VehicleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShuttleStop" ADD CONSTRAINT "ShuttleStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "ShuttleRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShuttleSchedule" ADD CONSTRAINT "ShuttleSchedule_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "ShuttleRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShuttleRun" ADD CONSTRAINT "ShuttleRun_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "ShuttleRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShuttleRun" ADD CONSTRAINT "ShuttleRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ShuttleSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShuttleRun" ADD CONSTRAINT "ShuttleRun_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "VehicleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShuttleRun" ADD CONSTRAINT "ShuttleRun_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShuttleRun" ADD CONSTRAINT "ShuttleRun_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShuttleRun" ADD CONSTRAINT "ShuttleRun_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

