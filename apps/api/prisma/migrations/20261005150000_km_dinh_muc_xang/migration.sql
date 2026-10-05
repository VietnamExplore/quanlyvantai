-- AlterTable
ALTER TABLE "BookingTrip" ADD COLUMN     "endKm" INTEGER,
ADD COLUMN     "fuelCost" DECIMAL(15,0),
ADD COLUMN     "fuelLiters" DECIMAL(8,2),
ADD COLUMN     "fuelNorm" DECIMAL(5,2),
ADD COLUMN     "fuelPrice" DECIMAL(10,0),
ADD COLUMN     "startKm" INTEGER;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "fuelNorm" DECIMAL(5,2);

