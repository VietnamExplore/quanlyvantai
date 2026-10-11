import { Module } from '@nestjs/common';
import { TollsController } from './tolls.controller';
import { TollsService } from './tolls.service';

@Module({
  controllers: [TollsController],
  providers: [TollsService],
})
export class TollsModule {}
