import { TripStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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
