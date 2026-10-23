import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Roles } from '../auth/auth.decorators';
import { MailService } from './mail.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class MailConfigDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  /** Dùng chung tài khoản hộp thư booking OTA */
  @IsOptional() @IsBoolean() useOta?: boolean;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) @Matches(/^[\w.-]*$/, { message: 'Máy chủ SMTP không hợp lệ' }) host?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @Transform(trim) @Matches(/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'Địa chỉ email không hợp lệ' }) user?: string;
  /** Mật khẩu ứng dụng; bỏ trống = giữ mật khẩu cũ */
  @IsOptional() @IsString() @MaxLength(200) pass?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) fromName?: string;
}

export class MailTestDto {
  @Transform(trim) @IsEmail({}, { message: 'Địa chỉ email nhận thử không hợp lệ' }) to: string;
}

/** Email gửi đi (SMTP): gửi lệnh điều xe cho nhà xe đối tác */
@Controller('mail')
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get('status')
  @Roles(Role.ADMIN, Role.DIEU_HANH)
  status() {
    return this.mail.status();
  }

  @Put('config')
  @Roles(Role.ADMIN)
  config(@Body() dto: MailConfigDto) {
    return this.mail.saveConfig(dto);
  }

  @Post('test')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  test(@Body() dto: MailTestDto) {
    return this.mail.test(dto.to);
  }
}
