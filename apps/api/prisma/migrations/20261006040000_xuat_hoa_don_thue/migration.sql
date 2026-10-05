-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "invoiceAddress" TEXT,
ADD COLUMN     "invoiceCompany" TEXT,
ADD COLUMN     "invoiceEmail" TEXT,
ADD COLUMN     "invoiceRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "invoiceTaxCode" TEXT;

-- AlterTable
ALTER TABLE "BookingTrip" ADD COLUMN     "partnerVatPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;


-- Booking cũ đã có VAT: coi như khách lấy hóa đơn
UPDATE "Booking" SET "invoiceRequired" = true WHERE "vatPercent" > 0;
