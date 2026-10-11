import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Roles } from '../auth/auth.decorators';
import { WebsiteService } from './website.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class WebsiteConfigDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300) @Matches(/^(https?:\/\/\S+)?$/, { message: 'Địa chỉ website phải bắt đầu bằng https://' }) url?: string;
  /** Consumer key WooCommerce (ck_…); bỏ trống = giữ khóa cũ */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) key?: string;
  /** Consumer secret WooCommerce (cs_…); bỏ trống = giữ khóa cũ */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) secret?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  /** Chỉ nhận đơn tạo từ ngày này (YYYY-MM-DD) */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày không hợp lệ' }) since?: string;
}

/** Kết nối website công ty (WooCommerce): tự nhận đơn đặt hàng thành booking */
@Controller('website')
export class WebsiteController {
  constructor(private readonly website: WebsiteService) {}

  @Get('status')
  @Roles(Role.ADMIN, Role.DIEU_HANH)
  status() {
    return this.website.status();
  }

  @Put('config')
  @Roles(Role.ADMIN)
  config(@Body() dto: WebsiteConfigDto) {
    return this.website.saveConfig(dto);
  }

  @Post('test')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  test() {
    return this.website.test();
  }

  @Post('sync')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.DIEU_HANH)
  sync() {
    return this.website.sync(true);
  }
}
