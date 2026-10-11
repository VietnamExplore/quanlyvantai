-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "lastGpsAt" TIMESTAMP(3),
ADD COLUMN     "lastGpsTripId" INTEGER,
ADD COLUMN     "lastLat" DOUBLE PRECISION,
ADD COLUMN     "lastLng" DOUBLE PRECISION,
ADD COLUMN     "lastSpeed" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "GpsPoint" (
    "id" BIGSERIAL NOT NULL,
    "driverId" INTEGER NOT NULL,
    "vehicleId" INTEGER,
    "tripId" INTEGER,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GpsPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GpsAlert" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "driverId" INTEGER NOT NULL,
    "vehicleId" INTEGER,
    "tripId" INTEGER,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "value" DOUBLE PRECISION,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),
    "seenBy" TEXT,

    CONSTRAINT "GpsAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GpsPoint_driverId_recordedAt_idx" ON "GpsPoint"("driverId", "recordedAt");

-- CreateIndex
CREATE INDEX "GpsPoint_vehicleId_recordedAt_idx" ON "GpsPoint"("vehicleId", "recordedAt");

-- CreateIndex
CREATE INDEX "GpsPoint_tripId_recordedAt_idx" ON "GpsPoint"("tripId", "recordedAt");

-- CreateIndex
CREATE INDEX "GpsAlert_at_idx" ON "GpsAlert"("at");

-- CreateIndex
CREATE INDEX "GpsAlert_tripId_idx" ON "GpsAlert"("tripId");

