import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { SignFileController } from './sign-file.controller';

@Module({
  controllers: [BookingsController, SignFileController],
  providers: [BookingsService],
})
export class BookingsModule {}
