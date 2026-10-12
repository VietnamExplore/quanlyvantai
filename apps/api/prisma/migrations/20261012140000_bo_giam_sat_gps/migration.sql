-- AlterTable
ALTER TABLE "Driver" DROP COLUMN "lastGpsAt",
DROP COLUMN "lastGpsTripId",
DROP COLUMN "lastLat",
DROP COLUMN "lastLng",
DROP COLUMN "lastSpeed";

-- DropTable
DROP TABLE "GpsAlert";

-- DropTable
DROP TABLE "GpsPoint";


-- Bỏ giám sát GPS (quyền riêng tư của lái xe; xe đã định vị qua đơn vị giám sát hành trình theo chuẩn Bộ Công an)
DELETE FROM "Notification" WHERE "type" LIKE 'GPS%';
DELETE FROM "Setting" WHERE "key" IN ('gpsSpeedLimit', 'gpsStopMinutes', 'gpsLostMinutes', 'vietmapKey', 'googleMapsKey');
