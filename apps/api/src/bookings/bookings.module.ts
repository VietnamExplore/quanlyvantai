import { Module } from '@nestjs/common';
import { ShuttleModule } from '../shuttle/shuttle.module';
import { TranslateModule } from '../translate/translate.module';
import { BookingTranslationsController } from './booking-translations.controller';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { SignFileController } from './sign-file.controller';

@Module({
  imports: [TranslateModule, ShuttleModule],
  controllers: [BookingsController, SignFileController, BookingTranslationsController],
  providers: [BookingsService],
})
export class BookingsModule {}
