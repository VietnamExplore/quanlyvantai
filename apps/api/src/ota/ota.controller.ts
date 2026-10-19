import { BadRequestException, Body, Controller, HttpCode, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { IsArray } from 'class-validator';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { parseTotoPdf, type TotoPdfRow } from './toto-pdf';
import { matchSign, type SignCandidate, type SignMatch } from './toto-sign';
import { TotoService, type TotoRow } from './toto.service';

class TotoRowsDto {
  /** Các booking TOTO (dòng Excel trình duyệt đọc sẵn, hoặc trang chi tiết PDF máy chủ đã đọc) – máy chủ kiểm tra lại từng trường */
  @IsArray() rows: TotoRow[];
}

/** Nhập booking từ các kênh OTA bằng file xuất / trang in của trang nhà cung cấp */
@Controller('ota')
@Roles(Role.ADMIN, Role.DIEU_HANH, Role.KINH_DOANH)
export class OtaController {
  constructor(private readonly toto: TotoService) {}

  /** Đọc các file PDF trang chi tiết đặt chỗ TOTO (mỗi file một booking) → dòng booking */
  @Post('toto/pdf')
  @HttpCode(200)
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => (/\.pdf$/i.test(file.originalname) ? cb(null, true) : cb(new BadRequestException('Chỉ nhận file .pdf'), false)),
    }),
  )
  async pdf(@UploadedFiles() files: Express.Multer.File[] = []) {
    if (!files.length) throw new BadRequestException('Chưa chọn file PDF');
    const rows: TotoPdfRow[] = [];
    const errors: { file: string; message: string }[] = [];
    for (const f of files) {
      // Tên file tiếng Việt gửi lên dạng latin1
      const name = Buffer.from(f.originalname, 'latin1').toString('utf8');
      try {
        rows.push(await parseTotoPdf(new Uint8Array(f.buffer)));
      } catch (e) {
        errors.push({ file: name, message: (e as Error).message });
      }
    }
    return { rows, errors };
  }

  /**
   * Ghép các file bảng đón (PDF / ảnh) với booking TOTO trong bảng xem trước.
   * File không lưu ở bước này: trình duyệt giữ file, sau khi nhập thì tải lên từng booking (bảng đón của booking).
   */
  @Post('toto/sign-match')
  @HttpCode(200)
  @UseInterceptors(
    FilesInterceptor('files', 100, {
      storage: memoryStorage(),
      limits: { fileSize: 30 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => (/\.(pdf|jpe?g|png|webp)$/i.test(file.originalname) ? cb(null, true) : cb(new BadRequestException('Bảng đón: chỉ nhận PDF, JPG, PNG, WEBP'), false)),
    }),
  )
  async signMatch(@UploadedFiles() files: Express.Multer.File[] = [], @Body('candidates') raw?: string) {
    if (!files.length) throw new BadRequestException('Chưa chọn file bảng đón');
    let candidates: SignCandidate[] = [];
    try {
      candidates = (JSON.parse(raw ?? '[]') as SignCandidate[]).filter((c) => c && typeof c.reservationId === 'string' && /^\w{3,40}$/.test(c.reservationId)).map((c) => ({ reservationId: c.reservationId, customerName: String(c.customerName ?? '') }));
    } catch {
      throw new BadRequestException('Danh sách booking không hợp lệ');
    }
    const out: SignMatch[] = [];
    for (const f of files) {
      // Tên file tiếng Việt gửi lên dạng latin1
      const name = Buffer.from(f.originalname, 'latin1').toString('utf8');
      out.push(await matchSign({ name, data: new Uint8Array(f.buffer), pdf: /\.pdf$/i.test(name) }, candidates));
    }
    return out;
  }

  /** Xem trước: booking mới / đã nhập / bổ sung / đã thay đổi / đã hủy / lỗi, và booking cùng ngày không còn trong file Excel */
  @Post('toto/preview')
  @HttpCode(200)
  preview(@Body() dto: TotoRowsDto) {
    return this.toto.preview(dto.rows);
  }

  @Post('toto/import')
  @HttpCode(200)
  import(@Body() dto: TotoRowsDto, @CurrentUser() user: AuthUser) {
    return this.toto.import(dto.rows, user);
  }
}
