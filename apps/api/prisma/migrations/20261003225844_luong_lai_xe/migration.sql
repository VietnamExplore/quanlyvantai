-- CreateTable
CREATE TABLE "DriverSalary" (
    "id" SERIAL NOT NULL,
    "driverId" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "baseSalary" DECIMAL(14,0) NOT NULL,
    "commissionPercent" DECIMAL(5,2) NOT NULL,
    "note" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverSalary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverSalary_driverId_effectiveFrom_key" ON "DriverSalary"("driverId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "DriverSalary" ADD CONSTRAINT "DriverSalary_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
