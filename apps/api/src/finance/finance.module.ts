import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { OdometerService } from './odometer.service';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, OdometerService],
  exports: [FinanceService, OdometerService],
})
export class FinanceModule {}
