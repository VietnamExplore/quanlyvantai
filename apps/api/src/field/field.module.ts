import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { DriverFieldController, FieldController } from './field.controller';
import { FieldService } from './field.service';

@Module({
  imports: [PushModule],
  controllers: [DriverFieldController, FieldController],
  providers: [FieldService],
})
export class FieldModule {}
