import { BadRequestException, Body, Controller, Get, HttpCode, Post, Put, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/auth.decorators';
import { OtaMailService } from './ota-mail.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class OtaMailConfigDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) @Matches(/^[\w.-]*$/, { message: 'Máy chủ IMAP không hợp lệ' }) host?: string;
  @IsOptional() @Transform(trim) @IsEmail({}, { message: 'Địa chỉ email không hợp lệ' }) user?: string;
  /** Mật khẩu ứng dụng; bỏ trống = giữ mật khẩu cũ */
  @IsOptional() @IsString() @MaxLength(200) pass?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) folder?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  /** Chỉ đọc email nhận từ ngày này (YYYY-MM-DD) */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày không hợp lệ' }) since?: string;
}

/** Hộp thư nhận booking OTA: quét email đặt / đổi / hủy của các kênh OTA */
@Controller('ota/mail')
export class OtaMailController {
  constructor(private readonly mail: OtaMailService) {}

  @Get('status')
  @Roles(Role.ADMIN, Role.DIEU_HANH)
  status() {
    return this.mail.status();
  }

  @Put('config')
  @Roles(Role.ADMIN)
  config(@Body() dto: OtaMailConfigDto) {
    return this.mail.saveConfig(dto);
  }

  @Post('test')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  test() {
    return this.mail.test();
  }

  @Post('scan')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.DIEU_HANH)
  scan() {
    return this.mail.scan(true);
  }

  /** Nhập tay file email (.eml – trong Gmail: Tải thư xuống) khi chưa kết nối hộp thư / email gửi tới hộp thư khác */
  @Post('eml')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.DIEU_HANH, Role.KINH_DOANH)
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => (/.eml$/i.test(file.originalname) ? cb(null, true) : cb(new BadRequestException('Chỉ nhận file email .eml'), false)),
    }),
  )
  async eml(@UploadedFiles() files: Express.Multer.File[] = []) {
    if (!files.length) throw new BadRequestException('Chưa chọn file email');
    const out: { file: string; status: string | null }[] = [];
    for (const f of files) out.push({ file: Buffer.from(f.originalname, 'latin1').toString('utf8'), status: await this.mail.handle(f.buffer, null, null) });
    return out;
  }
}
