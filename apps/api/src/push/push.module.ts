import { Global, Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';

@Global()
@Module({
  imports: [MailModule],
  controllers: [NotificationsController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
