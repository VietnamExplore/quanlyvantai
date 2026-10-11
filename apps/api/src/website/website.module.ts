import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { WebsiteController } from './website.controller';
import { WebsiteService } from './website.service';

@Module({
  imports: [BookingsModule],
  controllers: [WebsiteController],
  providers: [WebsiteService],
})
export class WebsiteModule {}
