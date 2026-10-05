-- AlterTable
ALTER TABLE "Driver" DROP COLUMN "fuelNorm";

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "fuelNorm" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "VehicleType" ADD COLUMN     "fuelNorm" DECIMAL(5,2);

