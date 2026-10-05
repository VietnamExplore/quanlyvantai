-- AlterTable
ALTER TABLE "BookingTrip" ADD COLUMN     "partnerExtraDown" DECIMAL(15,0) NOT NULL DEFAULT 0,
ADD COLUMN     "partnerExtraNote" TEXT,
ADD COLUMN     "partnerExtraUp" DECIMAL(15,0) NOT NULL DEFAULT 0;

