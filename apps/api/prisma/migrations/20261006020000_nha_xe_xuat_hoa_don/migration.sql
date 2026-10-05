-- AlterTable
ALTER TABLE "BookingTrip" ADD COLUMN     "partnerInvoice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partnerInvoiceNote" TEXT;

