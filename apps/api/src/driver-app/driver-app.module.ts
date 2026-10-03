import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { DriverAppController } from './driver-app.controller';

@Module({
  imports: [FinanceModule],
  controllers: [DriverAppController],
})
export class DriverAppModule {}
