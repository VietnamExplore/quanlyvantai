import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { PayrollService } from './payroll.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [FinanceModule],
  controllers: [ReportsController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class ReportsModule {}
