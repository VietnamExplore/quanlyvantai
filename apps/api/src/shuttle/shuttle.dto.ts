import { ShuttleRunStatus, ShuttleStopKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class ShuttleStopDto {
  /** Có id = sửa điểm cũ (giữ liên kết với các lượt đặt); không có = thêm mới */
  @IsOptional() @IsInt() id?: number;
  @IsString() @IsNotEmpty({ message: 'Nhập tên điểm dừng / khu vực' }) @MaxLength(200) name: string;
  @IsEnum(ShuttleStopKind) kind: ShuttleStopKind;
  @IsOptional() @IsString() @MaxLength(300) address?: string | null;
  @IsInt() @Min(0) @Max(24 * 60) offsetMinutes: number;
  @IsOptional() @IsNumber() @Min(0) surcharge?: number;
  @IsOptional() @IsBoolean() canPickup?: boolean;
  @IsOptional() @IsBoolean() canDropoff?: boolean;
}

export class ShuttleScheduleDto {
  @IsOptional() @IsInt() id?: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Giờ xuất bến dạng HH:mm' }) departTime: string;
  /** 1 = Thứ Hai … 7 = Chủ nhật; trống = mọi ngày */
  @IsArray() @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true }) @ArrayMaxSize(7) weekdays: number[];
  @IsOptional() @IsDateString() validFrom?: string | null;
  @IsOptional() @IsDateString() validTo?: string | null;
  @IsOptional() @IsInt() @Min(1) capacity?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ShuttleRouteDto {
  @IsString() @IsNotEmpty({ message: 'Nhập mã tuyến' }) @MaxLength(40) code: string;
  @IsString() @IsNotEmpty({ message: 'Nhập tên tuyến' }) @MaxLength(200) name: string;
  @IsInt() vehicleTypeId: number;
  @IsInt() @Min(1, { message: 'Số ghế bán phải từ 1' }) capacity: number;
  @IsInt() @Min(1) durationMinutes: number;
  @IsNumber() @Min(0) adultPrice: number;
  @IsOptional() @IsNumber() @Min(0) childPrice?: number;
  @IsOptional() @IsNumber() @Min(0) agentAdultPrice?: number | null;
  @IsOptional() @IsNumber() @Min(0) agentChildPrice?: number | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;

  @IsArray() @ValidateNested({ each: true }) @Type(() => ShuttleStopDto) stops: ShuttleStopDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => ShuttleScheduleDto) schedules: ShuttleScheduleDto[];
}

/** Tạo thêm chuyến xe ghép (ngoài lịch cố định) */
export class CreateRunDto {
  @IsInt() routeId: number;
  @IsDateString() departAt: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsInt() vehicleTypeId?: number;
  @IsOptional() @IsString() note?: string | null;
}

export class UpdateRunDto {
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsIn([ShuttleRunStatus.MO_BAN, ShuttleRunStatus.DONG_BAN, ShuttleRunStatus.HUY]) status?: ShuttleRunStatus;
  @IsOptional() @IsString() note?: string | null;
  @IsOptional() @IsString() dispatchNote?: string | null;
  @IsOptional() @IsInt() vehicleTypeId?: number;
}

/** Điều xe cho cả chuyến xe ghép */
export class AssignRunDto {
  @IsIn(['COMPANY', 'PARTNER']) mode: 'COMPANY' | 'PARTNER';
  @IsOptional() @IsInt() vehicleId?: number;
  @IsOptional() @IsInt() driverId?: number | null;
  /** Chi phí dự kiến cả chuyến khi chạy xe công ty (chia cho từng lượt khách) */
  @IsOptional() @IsNumber() @Min(0) estimatedCost?: number | null;
  @IsOptional() @IsInt() partnerId?: number;
  /** Giá thuê nhà xe cả chuyến, chưa thuế */
  @IsOptional() @IsNumber() @Min(0) partnerCost?: number | null;
  @IsOptional() @IsString() partnerPlate?: string | null;
  @IsOptional() @IsString() partnerDriverName?: string | null;
  @IsOptional() @IsString() partnerDriverPhone?: string | null;
  @IsOptional() @IsString() dispatchNote?: string | null;
  /** Bỏ qua cảnh báo trùng lịch */
  @IsOptional() @IsBoolean() force?: boolean;
}

export class RunProgressDto {
  @IsIn(['DANG_CHAY', 'HOAN_THANH']) step: 'DANG_CHAY' | 'HOAN_THANH';
}

export class RunQueryDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @Type(() => Number) @IsInt() routeId?: number;
}
