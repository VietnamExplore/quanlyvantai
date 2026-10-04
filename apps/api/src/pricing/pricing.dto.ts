import { PartialType } from '@nestjs/mapped-types';
import { SurchargeRule } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

// ───── Giá theo tuyến ─────

export class RoutePriceItemDto {
  @IsInt()
  vehicleTypeId: number;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  partnerCost?: number | null;
}

export class CreateRoutePriceDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên tuyến không được để trống' })
  name: string;

  @IsOptional() @IsString() serviceType?: string;
  @IsOptional() @IsInt() fromLocationId?: number | null;
  @IsOptional() @IsInt() toLocationId?: number | null;
  @IsOptional() @IsInt() @Min(0) distanceKm?: number | null;
  @IsOptional() @IsNumber() @Min(0) durationHours?: number | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutePriceItemDto)
  items: RoutePriceItemDto[];
}

export class UpdateRoutePriceDto extends PartialType(CreateRoutePriceDto) {}

// ───── Giá thuê theo ngày ─────

/** Một dòng giá thuê thêm, ví dụ "Thuê 4 tiếng" */
export class RentalOptionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Dòng giá thêm phải có tên (ví dụ: Thuê 4 tiếng)' })
  name: string;

  @IsNumber({}, { message: 'Giá của dòng giá thêm không hợp lệ' }) @Min(0) price: number;
  @IsInt({ message: 'Số giờ của dòng giá thêm không hợp lệ' }) @Min(1, { message: 'Số giờ tối thiểu là 1' }) hours: number;
  @IsOptional() @IsInt() @Min(0) km?: number;
}

export class RentalRateDto {
  @IsNumber() @Min(0) fullDayPrice: number;
  @IsOptional() @IsInt() @Min(1) fullDayHours?: number;
  @IsOptional() @IsInt() @Min(0) fullDayKm?: number;
  @IsOptional() @IsNumber() @Min(0) halfDayPrice?: number | null;
  @IsOptional() @IsInt() @Min(1) halfDayHours?: number;
  @IsOptional() @IsInt() @Min(0) halfDayKm?: number;
  @IsOptional() @IsNumber() @Min(0) extraKmPrice?: number;
  @IsOptional() @IsNumber() @Min(0) extraHourPrice?: number;
  @IsOptional() @IsNumber() @Min(0) driverOvernightFee?: number;

  /** Các dòng giá tự thêm (thuê 4 tiếng, 6 tiếng, 8 tiếng…) */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RentalOptionDto)
  extraOptions?: RentalOptionDto[];
}

// ───── Phụ thu & ngày lễ ─────

export class CreateSurchargeDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên phụ thu không được để trống' })
  name: string;

  @IsOptional() @IsEnum(SurchargeRule) rule?: SurchargeRule;
  @IsOptional() @IsBoolean() isPercent?: boolean;
  @IsNumber() @Min(0) value: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateSurchargeDto extends PartialType(CreateSurchargeDto) {}

export class CreateHolidayDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên ngày lễ không được để trống' })
  name: string;

  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
}

export class UpdateHolidayDto extends PartialType(CreateHolidayDto) {}

// ───── Tính giá ─────

export class CalculatePriceDto {
  @IsString() serviceType: string;
  @IsInt() vehicleTypeId: number;
  @IsOptional() @IsInt() routePriceId?: number | null;
  @IsDateString() pickupTime: string;
  @IsOptional() @IsInt() @Min(1) days?: number;
  /** Thuê nửa ngày (chỉ áp dụng khi không chọn tuyến) */
  @IsOptional() @IsBoolean() halfDay?: boolean;
  /** Chọn một dòng giá thêm của bảng giá thuê (vị trí trong danh sách), ví dụ Thuê 4 tiếng */
  @IsOptional() @IsInt() @Min(0) optionIndex?: number | null;
  @IsOptional() @IsInt() @Min(0) extraKm?: number;
  @IsOptional() @IsInt() @Min(0) extraHours?: number;
}
