import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsArray } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { TotoService, type TotoRow } from './toto.service';

class TotoRowsDto {
  /** Các dòng file Excel TOTO Booking (trình duyệt đọc sẵn) – máy chủ kiểm tra lại từng trường */
  @IsArray() rows: TotoRow[];
}

/** Nhập booking từ các kênh OTA bằng file xuất của trang nhà cung cấp */
@Controller('ota')
@Roles(Role.ADMIN, Role.DIEU_HANH, Role.KINH_DOANH)
export class OtaController {
  constructor(private readonly toto: TotoService) {}

  /** Xem trước: booking mới / đã nhập / đã thay đổi / lỗi, và booking cùng ngày không còn trong file */
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
