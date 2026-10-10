import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

export const INCIDENT_TYPES = ['HONG_XE', 'VA_CHAM', 'TRE_GIO', 'KHACH_VANG', 'DOI_LICH_TRINH', 'KHAC'] as const;
export const INCIDENT_LABEL: Record<(typeof INCIDENT_TYPES)[number], string> = {
  HONG_XE: 'Hỏng xe',
  VA_CHAM: 'Va chạm / tai nạn',
  TRE_GIO: 'Kẹt xe / trễ giờ',
  KHACH_VANG: 'Khách không có mặt',
  DOI_LICH_TRINH: 'Khách đổi lịch trình',
  KHAC: 'Khác',
};
export const INCIDENT_STATUS = ['MOI', 'DANG_XU_LY', 'DA_XU_LY'] as const;

/** Khách ký nhận hoàn thành chuyến trên điện thoại lái xe */
export class SignoffDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'Nhập họ tên người ký' }) @MaxLength(120) name: string;
  /** Nét ký: SVG path (chỉ lệnh M / L / số), khung 600×300 */
  @IsString()
  @IsNotEmpty({ message: 'Chưa có chữ ký' })
  @MaxLength(60000)
  @Matches(/^[MLml0-9.,\s-]+$/, { message: 'Chữ ký không hợp lệ' })
  svg: string;
  @Transform(trimOrNull) @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}

export class CreateIncidentDto {
  @IsOptional() @IsInt() tripId?: number | null;
  @IsIn(INCIDENT_TYPES, { message: 'Loại sự cố không hợp lệ' }) type: (typeof INCIDENT_TYPES)[number];
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'Mô tả sự cố' }) @MaxLength(2000) note: string;
}

export class HandleIncidentDto {
  @IsIn(INCIDENT_STATUS) status: (typeof INCIDENT_STATUS)[number];
  @Transform(trimOrNull) @IsOptional() @IsString() @MaxLength(2000) handleNote?: string | null;
}

class CheckItemDto {
  @IsString() key: string;
  @IsString() label: string;
  @IsBoolean() ok: boolean;
  @Transform(trimOrNull) @IsOptional() @IsString() @MaxLength(300) note?: string | null;
}

export class CreateVehicleCheckDto {
  @IsInt() vehicleId: number;
  @IsIn(['NHAN', 'TRA']) kind: 'NHAN' | 'TRA';
  @IsOptional() @IsInt() @Min(0) @Max(9_999_999) odometerKm?: number | null;
  @IsOptional() @IsIn([0, 25, 50, 75, 100]) fuelLevel?: number | null;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CheckItemDto) items: CheckItemDto[];
  @Transform(trimOrNull) @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
}
