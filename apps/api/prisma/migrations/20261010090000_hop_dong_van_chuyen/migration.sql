-- AlterTable
ALTER TABLE "BookingTrip" ADD COLUMN     "distanceKm" INTEGER;

-- CreateTable
CREATE TABLE "TransportContract" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "signedDate" DATE NOT NULL,
    "hirerName" TEXT NOT NULL,
    "hirerIdNumber" TEXT,
    "hirerTaxCode" TEXT,
    "hirerAddress" TEXT,
    "hirerPhone" TEXT,
    "hirerRepresentative" TEXT,
    "hirerPosition" TEXT,
    "hirerRepIdNumber" TEXT,
    "paymentMethod" TEXT,
    "extraTerms" TEXT,
    "token" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedName" TEXT,
    "acceptedIp" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportContract_bookingId_key" ON "TransportContract"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportContract_number_key" ON "TransportContract"("number");

-- CreateIndex
CREATE UNIQUE INDEX "TransportContract_token_key" ON "TransportContract"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TransportContract_year_seq_key" ON "TransportContract"("year", "seq");

-- AddForeignKey
ALTER TABLE "TransportContract" ADD CONSTRAINT "TransportContract_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportContract" ADD CONSTRAINT "TransportContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

