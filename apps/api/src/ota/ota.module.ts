import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { WebsiteModule } from '../website/website.module';
import { OtaMailController } from './ota-mail.controller';
import { OtaMailService } from './ota-mail.service';
import { OtaController } from './ota.controller';
import { TotoService } from './toto.service';

@Module({ imports: [BookingsModule, WebsiteModule], controllers: [OtaController, OtaMailController], providers: [TotoService, OtaMailService] })
export class OtaModule {}
