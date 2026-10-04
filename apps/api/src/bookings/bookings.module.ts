import { Module } from '@nestjs/common';
import { TranslateModule } from '../translate/translate.module';
import { BookingTranslationsController } from './booking-translations.controller';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { SignFileController } from './sign-file.controller';

@Module({
  imports: [TranslateModule],
  controllers: [BookingsController, SignFileController, BookingTranslationsController],
  providers: [BookingsService],
})
export class BookingsModule {}
