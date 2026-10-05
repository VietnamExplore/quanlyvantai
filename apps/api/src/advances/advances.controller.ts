import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { AdvanceStatus, PaymentMethod, Role } from '@prisma/client';
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { AuthUser, CurrentUser, OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { AdvancesService } from './advances.service';

class ApproveDto {
  @IsOptional() @IsNumber({}, { message: 'Số tiền không hợp lệ' }) @Min(1, { message: 'Số tiền phải lớn hơn 0' }) amount?: number;
  @IsOptional() @IsIn([PaymentMethod.TIEN_MAT, PaymentMethod.CHUYEN_KHOAN], { message: 'Hình thức chi không hợp lệ' }) method?: PaymentMethod;
  @IsOptional() @IsDateString({}, { message: 'Ngày chi không hợp lệ' }) date?: string;
  @IsOptional() @IsString() note?: string | null;
}

class RejectAdvanceDto {
  @IsString() @IsNotEmpty({ message: 'Nhập lý do từ chối' }) reason: string;
}

/** Văn phòng xử lý đề nghị tạm ứng của lái xe (quản trị, kế toán) */
@Controller('advance-requests')
@Roles(Role.ADMIN, Role.KE_TOAN)
export class AdvancesController {
  constructor(private readonly advances: AdvancesService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.advances.list(Object.values(AdvanceStatus).includes(status as AdvanceStatus) ? (status as AdvanceStatus) : undefined);
  }

  /** Số đề nghị chờ duyệt (hiện trên menu) */
  @Get('pending-count')
  @Roles(...OFFICE_ROLES)
  async pendingCount() {
    return { count: await this.advances.pendingCount() };
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id', ParseIntPipe) id: number, @Body() dto: ApproveDto, @CurrentUser() user: AuthUser) {
    return this.advances.approve(id, user, dto);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectAdvanceDto, @CurrentUser() user: AuthUser) {
    return this.advances.reject(id, user, dto.reason);
  }
}
