import { Module } from '@nestjs/common';
import { AdvancesModule } from '../advances/advances.module';
import { FinanceModule } from '../finance/finance.module';
import { DriverAppController } from './driver-app.controller';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [FinanceModule, ReportsModule, AdvancesModule],
  controllers: [DriverAppController],
})
export class DriverAppModule {}
