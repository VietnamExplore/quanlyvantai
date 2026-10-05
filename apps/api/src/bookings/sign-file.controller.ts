import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { assertCanEditBooking } from './booking-access';
import { Role } from '@prisma/client';
import { execFile } from 'child_process';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join, resolve } from 'path';
import { promisify } from 'util';
import { OFFICE_ROLES, Roles, AuthUser, CurrentUser } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

/** Thư mục lưu file bảng đón: apps/api/uploads/signs (đổi bằng biến môi trường UPLOAD_DIR) */
export const SIGN_DIR = resolve(process.env.UPLOAD_DIR ?? join(__dirname, '..', '..', 'uploads'), 'signs');
mkdirSync(SIGN_DIR, { recursive: true });

const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};
const MAX_SIZE = 100 * 1024 * 1024; // 100 MB

function removeFile(name: string | null) {
  if (!name) return;
  // File gốc + ảnh trang đầu đã chuyển từ PDF (nếu có)
  for (const n of [name, previewName(name)]) {
    const path = join(SIGN_DIR, n);
    // Chỉ xóa trong thư mục bảng đón, không theo đường dẫn lạ
    if (resolve(path).startsWith(SIGN_DIR) && existsSync(path)) unlinkSync(path);
  }
}

/** Tên ảnh trang đầu của bảng đón PDF (lưu cạnh file gốc) */
const previewName = (signFile: string) => `${signFile}.p1.jpg`;
const run = promisify(execFile);
const converting = new Map<string, Promise<void>>();

/**
 * Ảnh để hiện bảng đón trên điện thoại: file ảnh thì dùng luôn;
 * file PDF thì chuyển trang đầu thành ảnh JPG (một lần, lưu lại cho lần sau).
 */
export async function signImage(signFile: string, type: string | null): Promise<{ file: string; type: string }> {
  if (type?.startsWith('image/')) return { file: signFile, type };
  if (type !== 'application/pdf') throw new BadRequestException('File bảng đón không phải ảnh hoặc PDF');
  const out = previewName(signFile);
  if (!existsSync(join(SIGN_DIR, out))) {
    let job = converting.get(out);
    if (!job) {
      // pdftoppm (poppler-utils): trang 1, ảnh JPG rộng tối đa 1800px
      job = run('pdftoppm', ['-jpeg', '-f', '1', '-l', '1', '-singlefile', '-scale-to', '1800', join(SIGN_DIR, signFile), join(SIGN_DIR, out.replace(/\.jpg$/, ''))], { timeout: 60_000 })
        .then(() => undefined)
        .finally(() => converting.delete(out));
      converting.set(out, job);
    }
    try {
      await job;
    } catch {
      throw new BadRequestException('Không chuyển được file PDF bảng đón thành ảnh');
    }
  }
  return { file: out, type: 'image/jpeg' };
}

@Controller('bookings/:id/sign-file')
@Roles(...OFFICE_ROLES)
export class SignFileController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @Roles(Role.ADMIN, Role.DIEU_HANH, Role.KINH_DOANH)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: SIGN_DIR,
        filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ALLOWED[file.mimetype] ?? extname(file.originalname)}`),
      }),
      limits: { fileSize: MAX_SIZE, files: 1 },
      fileFilter: (_req, file, cb) =>
        ALLOWED[file.mimetype] ? cb(null, true) : cb(new BadRequestException('Chỉ nhận file ảnh (JPG, PNG, WEBP) hoặc PDF'), false),
    }),
  )
  async upload(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Chưa chọn file');
    try {
      await assertCanEditBooking(this.prisma, id, user);
    } catch (e) {
      removeFile(file.filename);
      throw e;
    }
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) {
      removeFile(file.filename);
      throw new NotFoundException('Không tìm thấy booking');
    }
    // Tên file gốc từ trình duyệt được mã hóa latin1: đổi lại để giữ tiếng Việt
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const updated = await this.prisma.booking.update({
      where: { id },
      data: { signFile: file.filename, signFileName: originalName, signFileType: file.mimetype },
      select: { signFile: true, signFileName: true, signFileType: true },
    });
    removeFile(booking.signFile);
    // PDF: chuyển sẵn trang đầu thành ảnh để app lái xe mở ngay (chạy nền, lỗi thì để lần mở sau thử lại)
    if (file.mimetype === 'application/pdf') signImage(file.filename, file.mimetype).catch(() => undefined);
    return updated;
  }

  @Get()
  async download(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const booking = await this.prisma.booking.findUnique({ where: { id }, select: { signFile: true, signFileName: true, signFileType: true } });
    if (!booking?.signFile || !existsSync(join(SIGN_DIR, booking.signFile))) throw new NotFoundException('Booking chưa có file bảng đón');
    res.setHeader('Content-Type', booking.signFileType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(booking.signFileName ?? booking.signFile)}`);
    res.sendFile(booking.signFile, { root: SIGN_DIR });
  }

  @Delete()
  @Roles(Role.ADMIN, Role.DIEU_HANH, Role.KINH_DOANH)
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    await assertCanEditBooking(this.prisma, id, user);
    const booking = await this.prisma.booking.findUniqueOrThrow({ where: { id } });
    await this.prisma.booking.update({ where: { id }, data: { signFile: null, signFileName: null, signFileType: null } });
    removeFile(booking.signFile);
    return { signFile: null, signFileName: null, signFileType: null };
  }
}
