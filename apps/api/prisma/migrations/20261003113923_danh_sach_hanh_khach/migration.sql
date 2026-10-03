-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "signSubtitle" TEXT,
ADD COLUMN     "signTitle" TEXT;

-- CreateTable
CREATE TABLE "BookingPassenger" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "gender" TEXT,
    "birthYear" INTEGER,
    "idNumber" TEXT,
    "nationality" TEXT,
    "phone" TEXT,
    "note" TEXT,

    CONSTRAINT "BookingPassenger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingPassenger_bookingId_idx" ON "BookingPassenger"("bookingId");

-- AddForeignKey
ALTER TABLE "BookingPassenger" ADD CONSTRAINT "BookingPassenger_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
