-- AlterTable
ALTER TABLE "BookingTrip" ADD COLUMN     "partnerExtraReviewNote" TEXT,
ADD COLUMN     "partnerExtraReviewedAt" TIMESTAMP(3),
ADD COLUMN     "partnerExtraReviewedBy" TEXT,
ADD COLUMN     "partnerExtraStatus" TEXT;

UPDATE "BookingTrip" SET "partnerExtraStatus" = 'DA_DUYET' WHERE "partnerExtraUp" > 0 OR "partnerExtraDown" > 0;
