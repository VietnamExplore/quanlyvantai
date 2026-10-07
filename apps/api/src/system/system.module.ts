import { Module } from '@nestjs/common';
import { GdriveService } from './gdrive.service';
import { MaintenanceService } from './maintenance.service';
import { SystemController } from './system.controller';

/** Sao lưu tự động hằng ngày và dọn nhật ký thao tác / thông báo cũ */
@Module({
  controllers: [SystemController],
  providers: [MaintenanceService, GdriveService],
})
export class SystemModule {}
