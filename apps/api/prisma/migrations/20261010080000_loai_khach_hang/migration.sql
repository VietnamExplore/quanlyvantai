-- Loại khách hàng: enum cố định -> danh mục CustomerKind (thêm mới được), giữ nguyên dữ liệu khách
CREATE TABLE "CustomerKind" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "isAgent" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CustomerKind_pkey" PRIMARY KEY ("code")
);

INSERT INTO "CustomerKind" ("code", "name", "color", "isAgent", "sortOrder") VALUES
    ('KHACH_LE', 'Khách lẻ', NULL, false, 1),
    ('DOANH_NGHIEP', 'Doanh nghiệp', 'blue', false, 2),
    ('DAI_LY', 'Đại lý', 'purple', true, 3),
    ('KHACH_SAN', 'Khách sạn', 'cyan', false, 4);

ALTER TABLE "Customer" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Customer" ALTER COLUMN "type" TYPE TEXT USING "type"::text;
ALTER TABLE "Customer" ALTER COLUMN "type" SET DEFAULT 'KHACH_LE';

DROP TYPE "CustomerType";

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_type_fkey" FOREIGN KEY ("type") REFERENCES "CustomerKind"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
