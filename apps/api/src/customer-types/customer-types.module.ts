import { Module } from '@nestjs/common';
import { CustomerTypesController } from './customer-types.controller';

@Module({
  controllers: [CustomerTypesController],
})
export class CustomerTypesModule {}
