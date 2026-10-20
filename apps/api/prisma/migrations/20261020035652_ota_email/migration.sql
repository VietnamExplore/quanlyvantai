-- CreateTable
CREATE TABLE "OtaEmail" (
    "id" SERIAL NOT NULL,
    "messageId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ref" TEXT,
    "subject" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "data" JSONB,
    "bookingId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtaEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OtaEmail_messageId_key" ON "OtaEmail"("messageId");

-- CreateIndex
CREATE INDEX "OtaEmail_ref_idx" ON "OtaEmail"("ref");

-- CreateIndex
CREATE INDEX "OtaEmail_createdAt_idx" ON "OtaEmail"("createdAt");

-- AddForeignKey
ALTER TABLE "OtaEmail" ADD CONSTRAINT "OtaEmail_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
