import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { DriverGpsController, GpsController } from './gps.controller';
import { GpsService } from './gps.service';

@Module({
  imports: [PushModule],
  controllers: [DriverGpsController, GpsController],
  providers: [GpsService],
})
export class GpsModule {}
