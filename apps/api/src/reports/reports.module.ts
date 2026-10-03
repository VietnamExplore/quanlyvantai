import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { ReportsController } from './reports.controller';

@Module({
  imports: [FinanceModule],
  controllers: [ReportsController],
})
export class ReportsModule {}
