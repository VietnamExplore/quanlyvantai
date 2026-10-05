-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'NHA_XE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "partnerId" INTEGER;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

