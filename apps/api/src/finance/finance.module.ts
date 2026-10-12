import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { CollectionsService } from './collections.service';
import { FinanceService } from './finance.service';
import { FuelPriceService } from './fuel-price.service';
import { OdometerService } from './odometer.service';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, OdometerService, FuelPriceService, CollectionsService],
  exports: [FinanceService, OdometerService, FuelPriceService],
})
export class FinanceModule {}
