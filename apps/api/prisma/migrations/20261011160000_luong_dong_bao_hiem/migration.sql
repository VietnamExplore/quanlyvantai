-- AlterTable
ALTER TABLE "DriverSalary" ADD COLUMN     "insuranceSalary" DECIMAL(14,0) NOT NULL DEFAULT 0;


-- Lái xe công ty đang có mức lương: đóng bảo hiểm theo mức 5.000.000 đ/tháng
UPDATE "DriverSalary" SET "insuranceSalary" = 5000000;
