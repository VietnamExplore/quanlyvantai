import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { DriverAppController } from './driver-app.controller';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [FinanceModule, ReportsModule],
  controllers: [DriverAppController],
})
export class DriverAppModule {}
