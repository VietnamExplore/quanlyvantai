import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { RatesController } from './rates.controller';
import { RoutePricesController } from './route-prices.controller';

@Module({
  controllers: [RoutePricesController, RatesController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
