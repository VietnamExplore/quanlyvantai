import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { diskStorage } from 'multer';
import { join, resolve } from 'path';
import { OFFICE_ROLES, Public, Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { API_KEY_KEY, PROVIDER_KEY } from '../translate/translate.service';

/** Các khóa cài đặt được phép lưu */
export const SETTING_KEYS = [
  'companyName',
  'companyAddress',
  'companyPhone',
  'companyEmail',
  'companyTaxCode',
  'bankInfo',
  'quoteFooter',
  // Ghi chú cuối báo giá theo ngôn ngữ giấy tờ
  'quoteFooter_en',
  'quoteFooter_ko',
  'quoteFooter_zh',
  'quoteFooter_ja',
  // Thông tin công ty trên giấy tờ ngoại ngữ (bỏ trống = dùng bản tiếng Việt)
  ...(['en', 'ko', 'zh', 'ja'] as const).flatMap((l) => [`companyName_${l}`, `companyAddress_${l}`, `bankInfo_${l}`] as const),
  // Dịch vụ dịch tự động: claude | google | deepl
  PROVIDER_KEY,
  // Giá xăng dầu (đ/lít) để tính chi phí xăng từng chuyến (định mức cài ở Loại xe / Xe)
  'fuelPrice',
] as const;

/** Logo công ty: apps/api/uploads/logo (đổi bằng biến môi trường UPLOAD_DIR); tên file lưu ở cài đặt "companyLogo" */
const LOGO_DIR = resolve(process.env.UPLOAD_DIR ?? join(__dirname, '..', '..', 'uploads'), 'logo');
mkdirSync(LOGO_DIR, { recursive: true });
const LOGO_TYPES: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const LOGO_KEY = 'companyLogo';

function removeLogo(name?: string | null) {
  if (!name) return;
  const path = join(LOGO_DIR, name);
  if (resolve(path).startsWith(LOGO_DIR) && existsSync(path)) unlinkSync(path);
}

@Controller('settings')
@Roles(...OFFICE_ROLES)
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    const rows = await this.prisma.setting.findMany();
    // Khóa API dịch là bí mật: không trả về, chỉ báo đã cài hay chưa
    const key = rows.find((r) => r.key === API_KEY_KEY)?.value;
    return {
      ...Object.fromEntries(rows.filter((r) => r.key !== API_KEY_KEY).map((r) => [r.key, r.value])),
      translateKeySet: key ? 'yes' : '',
      translateKeyHint: key ? '…' + key.slice(-4) : '',
    };
  }

  /** Lưu khóa API dịch tự động (bỏ trống = xóa khóa). Chỉ Admin. */
  @Put('translate-key')
  @Roles(Role.ADMIN)
  async saveTranslateKey(@Body() body: { apiKey?: unknown }) {
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (apiKey.length > 500) throw new BadRequestException('Khóa API quá dài');
    if (apiKey) await this.prisma.setting.upsert({ where: { key: API_KEY_KEY }, update: { value: apiKey }, create: { key: API_KEY_KEY, value: apiKey } });
    else await this.prisma.setting.deleteMany({ where: { key: API_KEY_KEY } });
    return this.get();
  }

  @Put()
  @Roles(Role.ADMIN)
  async save(@Body() body: Record<string, unknown>) {
    const entries = Object.entries(body).filter(([k]) => (SETTING_KEYS as readonly string[]).includes(k));
    if (entries.some(([, v]) => typeof v !== 'string')) throw new BadRequestException('Giá trị cài đặt phải là chữ');
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.setting.upsert({ where: { key }, update: { value: value as string }, create: { key, value: value as string } }),
      ),
    );
    return this.get();
  }

  /** Ảnh logo – công khai để thẻ <img> trên các trang in hiển thị được (logo không phải dữ liệu nhạy cảm) */
  @Get('logo')
  @Public()
  async logo(@Res() res: Response) {
    const row = await this.prisma.setting.findUnique({ where: { key: LOGO_KEY } });
    if (!row?.value || !existsSync(join(LOGO_DIR, row.value))) throw new NotFoundException('Chưa có logo');
    // Tên file đổi mỗi lần tải lên (?v=tên-file), nên cho trình duyệt nhớ lâu
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(row.value, { root: LOGO_DIR });
  }

  @Post('logo')
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: LOGO_DIR,
        filename: (_req, file, cb) => cb(null, `logo-${Date.now()}-${randomBytes(4).toString('hex')}${LOGO_TYPES[file.mimetype]}`),
      }),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) =>
        LOGO_TYPES[file.mimetype] ? cb(null, true) : cb(new BadRequestException('Logo phải là ảnh PNG, JPG hoặc WEBP'), false),
    }),
  )
  async uploadLogo(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Chưa chọn file logo');
    const old = await this.prisma.setting.findUnique({ where: { key: LOGO_KEY } });
    await this.prisma.setting.upsert({ where: { key: LOGO_KEY }, update: { value: file.filename }, create: { key: LOGO_KEY, value: file.filename } });
    removeLogo(old?.value);
    return this.get();
  }

  @Delete('logo')
  @Roles(Role.ADMIN)
  async deleteLogo() {
    const old = await this.prisma.setting.findUnique({ where: { key: LOGO_KEY } });
    await this.prisma.setting.deleteMany({ where: { key: LOGO_KEY } });
    removeLogo(old?.value);
    return this.get();
  }
}
