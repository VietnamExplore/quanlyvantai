import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { OtaController } from './ota.controller';
import { TotoService } from './toto.service';

@Module({ imports: [BookingsModule], controllers: [OtaController], providers: [TotoService] })
export class OtaModule {}
