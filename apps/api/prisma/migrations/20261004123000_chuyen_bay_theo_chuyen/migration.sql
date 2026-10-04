-- Số hiệu chuyến bay nhập theo từng chuyến (đón + tiễn), bỏ ô chuyến bay ở cấp booking
ALTER TABLE "Booking" DROP COLUMN "arrivalFlight",
DROP COLUMN "departureFlight";

ALTER TABLE "BookingTrip" ADD COLUMN "departureFlight" TEXT;
