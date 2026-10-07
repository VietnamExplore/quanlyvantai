import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Put, Req, Res } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { Request, Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { CurrentUser, Roles, type AuthUser } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { BACKUP_FILE, MaintenanceService } from './maintenance.service';

class MaintenanceConfigDto {
  @IsOptional() @IsBoolean() backupEnabled?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(23) backupHour?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1, { message: 'Giữ ít nhất 1 bản sao lưu' }) @Max(365) backupKeep?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(120) auditRetentionMonths?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3650) notificationRetentionDays?: number;
}

/** Sao lưu dữ liệu và dọn nhật ký / thông báo cũ: chỉ Admin */
@Controller('system')
@Roles(Role.ADMIN)
export class SystemController {
  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('maintenance')
  status() {
    return this.maintenance.status();
  }

  @Put('maintenance')
  async save(@Body() dto: MaintenanceConfigDto) {
    await this.maintenance.saveConfig(dto);
    return this.maintenance.status();
  }

  @Post('backups/run')
  @HttpCode(200)
  async backupNow(@CurrentUser() user: AuthUser) {
    try {
      await this.maintenance.backup('manual', user.fullName);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    return this.maintenance.status();
  }

  @Post('cleanup/run')
  @HttpCode(200)
  async cleanupNow() {
    await this.maintenance.cleanup();
    return this.maintenance.status();
  }

  /** Tải file sao lưu về máy (ghi nhật ký vì file chứa toàn bộ dữ liệu) */
  @Get('backups/:file')
  async download(@Param('file') file: string, @CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response) {
    if (!BACKUP_FILE.test(file)) throw new NotFoundException('Không có file sao lưu này');
    const path = join(this.maintenance.dir, file);
    if (!existsSync(path)) throw new NotFoundException('Không có file sao lưu này');
    await this.prisma.auditLog
      .create({ data: { userId: user.id, userName: user.fullName, action: 'Tải file sao lưu', method: 'GET', path: '/system/backups/:file', entity: 'Backup', entityLabel: file, ip: req.ip } })
      .catch(() => undefined);
    res.download(path, file);
  }
}
