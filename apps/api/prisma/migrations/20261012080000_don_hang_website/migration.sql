-- CreateTable
CREATE TABLE "WebsiteOrder" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total" DECIMAL(15,0) NOT NULL,
    "currency" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "bookingId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteOrder_orderId_key" ON "WebsiteOrder"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteOrder_bookingId_key" ON "WebsiteOrder"("bookingId");

-- AddForeignKey
ALTER TABLE "WebsiteOrder" ADD CONSTRAINT "WebsiteOrder_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

