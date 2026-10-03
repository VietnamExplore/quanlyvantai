-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('DON_TIEN_SAN_BAY', 'THEO_TUYEN', 'CITY_TOUR', 'THUE_THEO_NGAY', 'TOUR_NHIEU_NGAY');

-- CreateEnum
CREATE TYPE "SurchargeRule" AS ENUM ('BAN_DEM', 'LE_TET', 'THU_CONG');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('HOTLINE', 'ZALO', 'WEBSITE', 'EMAIL', 'DAI_LY', 'KHAC');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('NHAP', 'BAO_GIA', 'XAC_NHAN', 'HOAN_THANH', 'HUY');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('CHO_DIEU', 'DA_GAN', 'TAI_XE_NHAN', 'DANG_DEN_DON', 'DA_DON_KHACH', 'HOAN_THANH', 'HUY');

-- CreateTable
CREATE TABLE "RoutePrice" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL DEFAULT 'THEO_TUYEN',
    "fromLocationId" INTEGER,
    "toLocationId" INTEGER,
    "distanceKm" INTEGER,
    "durationHours" DECIMAL(5,1),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutePriceItem" (
    "id" SERIAL NOT NULL,
    "routePriceId" INTEGER NOT NULL,
    "vehicleTypeId" INTEGER NOT NULL,
    "price" DECIMAL(15,0) NOT NULL,
    "partnerCost" DECIMAL(15,0),

    CONSTRAINT "RoutePriceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalRate" (
    "id" SERIAL NOT NULL,
    "vehicleTypeId" INTEGER NOT NULL,
    "fullDayPrice" DECIMAL(15,0) NOT NULL,
    "fullDayHours" INTEGER NOT NULL DEFAULT 10,
    "fullDayKm" INTEGER NOT NULL DEFAULT 100,
    "halfDayPrice" DECIMAL(15,0),
    "halfDayHours" INTEGER NOT NULL DEFAULT 4,
    "halfDayKm" INTEGER NOT NULL DEFAULT 50,
    "extraKmPrice" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "extraHourPrice" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "driverOvernightFee" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Surcharge" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "rule" "SurchargeRule" NOT NULL DEFAULT 'THU_CONG',
    "isPercent" BOOLEAN NOT NULL DEFAULT true,
    "value" DECIMAL(15,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Surcharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" INTEGER,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "source" "BookingSource" NOT NULL DEFAULT 'HOTLINE',
    "status" "BookingStatus" NOT NULL DEFAULT 'NHAP',
    "salesUserId" INTEGER,
    "discountAmount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "vatPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "depositAmount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "quoteValidUntil" DATE,
    "notes" TEXT,
    "internalNotes" TEXT,
    "cancelReason" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingTrip" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "pickupTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "pickupLocationId" INTEGER,
    "pickupAddress" TEXT NOT NULL,
    "dropoffLocationId" INTEGER,
    "dropoffAddress" TEXT,
    "flightNumber" TEXT,
    "passengers" INTEGER NOT NULL,
    "vehicleTypeId" INTEGER NOT NULL,
    "routePriceId" INTEGER,
    "days" INTEGER NOT NULL DEFAULT 1,
    "extraKm" INTEGER NOT NULL DEFAULT 0,
    "extraHours" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(15,0) NOT NULL,
    "surcharges" JSONB NOT NULL DEFAULT '[]',
    "amount" DECIMAL(15,0) NOT NULL,
    "itinerary" TEXT,
    "notes" TEXT,
    "status" "TripStatus" NOT NULL DEFAULT 'CHO_DIEU',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingTrip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoutePriceItem_routePriceId_vehicleTypeId_key" ON "RoutePriceItem"("routePriceId", "vehicleTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "RentalRate_vehicleTypeId_key" ON "RentalRate"("vehicleTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_code_key" ON "Booking"("code");

-- CreateIndex
CREATE INDEX "BookingTrip_pickupTime_idx" ON "BookingTrip"("pickupTime");

-- AddForeignKey
ALTER TABLE "RoutePrice" ADD CONSTRAINT "RoutePrice_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePrice" ADD CONSTRAINT "RoutePrice_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePriceItem" ADD CONSTRAINT "RoutePriceItem_routePriceId_fkey" FOREIGN KEY ("routePriceId") REFERENCES "RoutePrice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePriceItem" ADD CONSTRAINT "RoutePriceItem_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "VehicleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalRate" ADD CONSTRAINT "RentalRate_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "VehicleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_salesUserId_fkey" FOREIGN KEY ("salesUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_pickupLocationId_fkey" FOREIGN KEY ("pickupLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_dropoffLocationId_fkey" FOREIGN KEY ("dropoffLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "VehicleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTrip" ADD CONSTRAINT "BookingTrip_routePriceId_fkey" FOREIGN KEY ("routePriceId") REFERENCES "RoutePrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
