-- AlterTable
ALTER TABLE "BookingTrip" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedById" INTEGER,
ADD COLUMN     "dispatchNote" TEXT,
ADD COLUMN     "driverId" INTEGER,
ADD COLUMN     "partnerCost" DECIMAL(15,0),
ADD COLUMN     "partnerDriverName" TEXT,
ADD COLUMN     "partnerDriverPhone" TEXT,
ADD COLUMN     "partnerId" INTEGER,
ADD COLUMN     "partnerPlate" TEXT,
ADD COLUMN     "vehicleId" INTEGER;

-- CreateTable
CREATE TABLE "TripEvent" (
    "id" SERIAL NOT NULL,
    "tripId" INTEGER NOT NULL,
    "status" "TripStatus" NOT NULL,
    "note" TEXT,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripEvent_tripId_idx" ON "TripEvent"("tripId");

-- CreateIndex
CREATE INDEX "BookingTrip_vehicleId_pickupTime_idx" ON "BookingTrip"("vehicleId", "pickupTime");

-- CreateIndex
CREATE INDEX "BookingTrip_driverId_pickupTime_idx" ON "BookingTrip"("driverId", "pickupTime");

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripEvent" ADD CONSTRAINT "TripEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "BookingTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripEvent" ADD CONSTRAINT "TripEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
