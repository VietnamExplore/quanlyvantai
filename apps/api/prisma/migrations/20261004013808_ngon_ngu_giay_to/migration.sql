-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "docLanguage" TEXT NOT NULL DEFAULT 'vi';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "docLanguage" TEXT NOT NULL DEFAULT 'vi';

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "names" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "VehicleType" ADD COLUMN     "names" JSONB NOT NULL DEFAULT '{}';

-- Tên ngoại ngữ cho 5 dịch vụ có sẵn (người dùng sửa lại được ở Danh mục → Dịch vụ)
UPDATE "Service" SET "names" = '{"en":"Airport transfer","ko":"공항 픽업·샌딩","zh":"机场接送","ja":"空港送迎"}' WHERE "code" = 'DON_TIEN_SAN_BAY' AND "names" = '{}';
UPDATE "Service" SET "names" = '{"en":"Point-to-point transfer","ko":"구간 이동","zh":"定线接送","ja":"区間送迎"}' WHERE "code" = 'THEO_TUYEN' AND "names" = '{}';
UPDATE "Service" SET "names" = '{"en":"City tour","ko":"시티 투어","zh":"城市观光","ja":"市内観光"}' WHERE "code" = 'CITY_TOUR' AND "names" = '{}';
UPDATE "Service" SET "names" = '{"en":"Private car with driver (daily)","ko":"일일 차량 대절 (기사 포함)","zh":"包车（按天，含司机）","ja":"貸切車（日単位・運転手付き）"}' WHERE "code" = 'THUE_THEO_NGAY' AND "names" = '{}';
UPDATE "Service" SET "names" = '{"en":"Multi-day tour","ko":"다일 투어","zh":"多日游","ja":"複数日ツアー"}' WHERE "code" = 'TOUR_NHIEU_NGAY' AND "names" = '{}';
