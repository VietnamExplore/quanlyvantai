import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { ShuttleModule } from '../shuttle/shuttle.module';
import { WebsiteController } from './website.controller';
import { WebsiteService } from './website.service';

@Module({
  imports: [BookingsModule, ShuttleModule],
  controllers: [WebsiteController],
  providers: [WebsiteService],
  exports: [WebsiteService],
})
export class WebsiteModule {}
