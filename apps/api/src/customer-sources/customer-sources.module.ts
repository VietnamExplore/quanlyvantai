import { Module } from '@nestjs/common';
import { CustomerSourcesController } from './customer-sources.controller';

@Module({
  controllers: [CustomerSourcesController],
})
export class CustomerSourcesModule {}
