import { BadRequestException, Body, Controller, Get, NotFoundException, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { diskStorage } from 'multer';
import { join, resolve } from 'path';
import { Public, Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

/** File cài app lái xe (APK Android): uploads/app (đổi bằng UPLOAD_DIR) */
export const APP_DIR = resolve(process.env.UPLOAD_DIR ?? join(__dirname, '..', '..', 'uploads'), 'app');
const KEY = 'driverApp.release';

export interface DriverAppRelease {
  version: string;
  versionCode: number;
  file: string;
  size: number;
  notes: string | null;
  updatedAt: string;
}

/**
 * Phát hành app lái xe: văn phòng tải file APK lên, lái xe tải về bằng link / mã QR (không cần đăng nhập),
 * app đã cài tự kiểm tra có bản mới để nhắc cập nhật.
 */
@Controller('app/driver')
export class AppReleaseController {
  constructor(private readonly prisma: PrismaService) {
    mkdirSync(APP_DIR, { recursive: true });
  }

  private async release(): Promise<DriverAppRelease | null> {
    const row = await this.prisma.setting.findUnique({ where: { key: KEY } });
    if (!row?.value) return null;
    try {
      const r = JSON.parse(row.value) as DriverAppRelease;
      return existsSync(join(APP_DIR, r.file)) ? r : null;
    } catch {
      return null;
    }
  }

  /** Bản app lái xe mới nhất (công khai: trang tải app, app tự kiểm tra cập nhật) */
  @Get()
  @Public()
  async info() {
    const r = await this.release();
    if (!r) return { available: false };
    return { available: true, version: r.version, versionCode: r.versionCode, size: r.size, notes: r.notes, updatedAt: r.updatedAt, url: '/api/app/driver/download' };
  }

  /** Tải file cài đặt APK */
  @Get('download')
  @Public()
  async download(@Res() res: Response) {
    const r = await this.release();
    if (!r) throw new NotFoundException('Chưa có file cài app lái xe. Liên hệ văn phòng.');
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="LaiXe-${r.version}.apk"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(r.file, { root: APP_DIR });
  }

  /** Admin tải lên bản APK mới (giữ bản ngay trước để phòng cần quay lại) */
  @Post()
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          mkdirSync(APP_DIR, { recursive: true });
          cb(null, APP_DIR);
        },
        filename: (_req, _file, cb) => cb(null, `laixe-${Date.now()}-${randomBytes(4).toString('hex')}.apk`),
      }),
      limits: { fileSize: 250 * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) =>
        /\.apk$/i.test(file.originalname) ? cb(null, true) : cb(new BadRequestException('Chọn file cài đặt Android (.apk)'), false),
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Body() body: { version?: string; versionCode?: string; notes?: string }) {
    if (!file) throw new BadRequestException('Chưa chọn file .apk');
    const version = body.version?.trim();
    const versionCode = Number(body.versionCode);
    if (!version || !/^\d+(\.\d+){1,3}$/.test(version) || !Number.isInteger(versionCode) || versionCode < 1) {
      unlinkSync(file.path);
      throw new BadRequestException('Nhập số phiên bản (vd 1.7.0) và mã phiên bản (số nguyên, vd 17)');
    }
    const next: DriverAppRelease = { version, versionCode, file: file.filename, size: file.size, notes: body.notes?.trim() || null, updatedAt: new Date().toISOString() };
    await this.prisma.setting.upsert({ where: { key: KEY }, update: { value: JSON.stringify(next) }, create: { key: KEY, value: JSON.stringify(next) } });
    // Xóa các file cũ, chỉ giữ bản vừa tải (bản cũ lưu ở máy văn phòng D:\Android\apk nếu cần quay lại)
    for (const f of readdirSync(APP_DIR)) {
      if (f !== next.file && f.endsWith('.apk')) unlinkSync(join(APP_DIR, f));
    }
    return this.info();
  }
}
