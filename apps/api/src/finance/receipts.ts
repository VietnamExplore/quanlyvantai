import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { diskStorage } from 'multer';
import { join, resolve } from 'path';

/** Ảnh hóa đơn / vé chi phí chuyến: apps/api/uploads/receipts (đổi bằng biến môi trường UPLOAD_DIR) */
export const RECEIPT_DIR = resolve(process.env.UPLOAD_DIR ?? join(__dirname, '..', '..', 'uploads'), 'receipts');
mkdirSync(RECEIPT_DIR, { recursive: true });

const ALLOWED: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

export const receiptUpload: MulterOptions = {
  storage: diskStorage({
    destination: RECEIPT_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ALLOWED[file.mimetype] ?? '.jpg'}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (ALLOWED[file.mimetype] ? cb(null, true) : cb(new BadRequestException('Chỉ nhận ảnh JPG, PNG, WEBP'), false)),
};

export function removeReceipt(name: string | null | undefined) {
  if (!name) return;
  const path = join(RECEIPT_DIR, name);
  // Chỉ xóa trong thư mục ảnh hóa đơn, không theo đường dẫn lạ
  if (resolve(path).startsWith(RECEIPT_DIR) && existsSync(path)) unlinkSync(path);
}

export function sendReceipt(res: Response, cost: { receiptFile: string | null; receiptType: string | null } | null) {
  if (!cost?.receiptFile || !existsSync(join(RECEIPT_DIR, cost.receiptFile))) throw new NotFoundException('Chi phí này chưa có ảnh hóa đơn');
  res.setHeader('Content-Type', cost.receiptType ?? 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(cost.receiptFile, { root: RECEIPT_DIR });
}
