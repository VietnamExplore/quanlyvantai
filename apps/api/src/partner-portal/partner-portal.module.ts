import { Module } from '@nestjs/common';
import { PartnerPortalController } from './partner-portal.controller';

/** Cổng nhà xe đối tác (tài khoản vai trò NHA_XE) */
@Module({
  controllers: [PartnerPortalController],
})
export class PartnerPortalModule {}
