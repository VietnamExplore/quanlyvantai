-- AlterTable
ALTER TABLE "BookingPassenger" ADD COLUMN     "addedAt" TIMESTAMP(3),
ADD COLUMN     "addedByDriverId" INTEGER,
ADD COLUMN     "addedByName" TEXT;

