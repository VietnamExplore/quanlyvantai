import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
