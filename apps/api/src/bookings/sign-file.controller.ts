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
import { Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join, resolve } from 'path';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
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
  const path = join(SIGN_DIR, name);
  // Chỉ xóa trong thư mục bảng đón, không theo đường dẫn lạ
  if (resolve(path).startsWith(SIGN_DIR) && existsSync(path)) unlinkSync(path);
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
  async upload(@Param('id', ParseIntPipe) id: number, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Chưa chọn file');
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
  async remove(@Param('id', ParseIntPipe) id: number) {
    const booking = await this.prisma.booking.findUniqueOrThrow({ where: { id } });
    await this.prisma.booking.update({ where: { id }, data: { signFile: null, signFileName: null, signFileType: null } });
    removeFile(booking.signFile);
    return { signFile: null, signFileName: null, signFileType: null };
  }
}
