import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { IsInt, IsOptional } from 'class-validator';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { TollsService } from './tolls.service';

export class AssignTollDto {
  /** null = bỏ gắn chuyến (chi phí xe) */
  @IsOptional() @IsInt() tripId?: number | null;
}

const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

/** Phí đường bộ / phí sân bay ePass: nhập hóa đơn, gắn vào chi phí chuyến */
@Controller('tolls')
@Roles(Role.ADMIN, Role.KE_TOAN, Role.DIEU_HANH)
export class TollsController {
  constructor(private readonly tolls: TollsService) {}

  @Get()
  list(@Query() q: { from?: string; to?: string; vehicleId?: string; unmatched?: string }) {
    return this.tolls.list({ from: q.from, to: q.to, vehicleId: num(q.vehicleId), unmatched: q.unmatched === '1' });
  }

  @Post('import')
  @HttpCode(200)
  @UseInterceptors(
    FilesInterceptor('files', 31, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) =>
        /pdf|xml/i.test(file.mimetype) || /\.(pdf|xml)$/i.test(file.originalname) ? cb(null, true) : cb(new BadRequestException('Chỉ nhận file hóa đơn PDF hoặc XML'), false),
    }),
  )
  import(@UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: AuthUser) {
    return this.tolls.import(files, user);
  }

  @Post('rematch')
  @HttpCode(200)
  rematch(@CurrentUser() user: AuthUser) {
    return this.tolls.rematch(user);
  }

  @Post(':id/assign')
  @HttpCode(200)
  assign(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignTollDto, @CurrentUser() user: AuthUser) {
    return this.tolls.assign(id, dto.tripId ?? null, user);
  }
}
