import { TripStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, Max, IsNotEmpty } from 'class-validator';

export class DispatchQueryDto {
  /** YYYY-MM-DD */
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(TripStatus) status?: TripStatus;
  @IsOptional() @IsString() q?: string;
}

export class AssignDto {
  @IsIn(['COMPANY', 'PARTNER'])
  mode: 'COMPANY' | 'PARTNER';

  // Xe công ty
  @IsOptional() @IsInt() vehicleId?: number;
  @IsOptional() @IsInt() driverId?: number | null;

  // Nhà xe đối tác
  @IsOptional() @IsInt() partnerId?: number;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsOptional()
  @IsString()
  partnerPlate?: string | null;
  @IsOptional() @IsString() partnerDriverName?: string | null;
  @IsOptional() @IsString() partnerDriverPhone?: string | null;
  @IsOptional() @IsNumber() @Min(0) partnerCost?: number;

  @IsOptional() @IsString() dispatchNote?: string | null;
  /** Giao nhà xe: yêu cầu nhà xe xuất hóa đơn cho công ty */
  @IsOptional() @IsBoolean() partnerInvoice?: boolean;
  @IsOptional() @IsString() partnerInvoiceNote?: string | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) partnerVatPercent?: number;

  /** Đã xem cảnh báo và vẫn muốn gán */
  @IsOptional() @IsBoolean() force?: boolean;
}

export class CheckDto {
  @IsInt() vehicleId: number;
  @IsOptional() @IsInt() driverId?: number | null;
}

/** Trạng thái Điều hành được cập nhật tay (thay lái xe / cho chuyến đối tác) */
export const MANUAL_STATUSES = [TripStatus.TAI_XE_NHAN, TripStatus.DANG_DEN_DON, TripStatus.DA_DON_KHACH, TripStatus.HOAN_THANH] as const;

export class TripStatusDto {
  @IsIn(MANUAL_STATUSES)
  status: (typeof MANUAL_STATUSES)[number];

  @IsOptional() @IsString() note?: string;
}

/** Lý do điều chỉnh giá nhà xe */
export const PARTNER_ADJUST_REASONS = ['TRE_GIO', 'KHONG_DON', 'PHAT_SINH', 'KHAC'] as const;

/** Admin / Điều hành điều chỉnh giá giao nhà xe (kể cả chuyến / booking đã hoàn thành) */
export class PartnerCostDto {
  @IsNumber({}, { message: 'Giá thuê không hợp lệ' })
  @Min(0, { message: 'Giá thuê không được âm' })
  partnerCost: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100) partnerVatPercent?: number;
  /** Sửa phát sinh nhà xe đã nhập (trước thuế) */
  @IsOptional() @IsNumber() @Min(0) partnerExtraUp?: number;
  @IsOptional() @IsNumber() @Min(0) partnerExtraDown?: number;

  @IsIn(PARTNER_ADJUST_REASONS, { message: 'Chọn lý do điều chỉnh' })
  reason: (typeof PARTNER_ADJUST_REASONS)[number];

  @IsString()
  @IsNotEmpty({ message: 'Nhập ghi chú điều chỉnh' })
  note: string;
}
