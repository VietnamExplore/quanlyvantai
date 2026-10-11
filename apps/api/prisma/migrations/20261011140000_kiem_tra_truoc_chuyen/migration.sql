-- AlterTable
ALTER TABLE "VehicleCheck" ADD COLUMN     "driverItems" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "driverOk" BOOLEAN,
ADD COLUMN     "tripId" INTEGER;

-- CreateIndex
CREATE INDEX "VehicleCheck_tripId_createdAt_idx" ON "VehicleCheck"("tripId", "createdAt");

-- AddForeignKey
ALTER TABLE "VehicleCheck" ADD CONSTRAINT "VehicleCheck_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "BookingTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

