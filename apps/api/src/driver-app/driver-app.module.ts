import { Module } from '@nestjs/common';
import { DriverAppController } from './driver-app.controller';

@Module({
  controllers: [DriverAppController],
})
export class DriverAppModule {}
