import { PartialType } from '@nestjs/mapped-types';
import { DriverStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreateDriverDto {
  @IsString()
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  fullName: string;

  @IsString()
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  phone: string;

  @IsOptional() @IsString() idCardNumber?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsOptional()
  @IsString()
  licenseClass?: string;

  @IsOptional() @IsString() licenseNumber?: string;
  @IsOptional() @IsDateString() licenseExpiry?: string | null;
  @IsOptional() @IsDateString() healthCheckExpiry?: string | null;

  /** null = lái xe công ty */
  @IsOptional()
  @IsInt()
  partnerId?: number | null;

  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  @IsOptional() @IsString() notes?: string;
}

export class UpdateDriverDto extends PartialType(CreateDriverDto) {}

export class DriverQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(DriverStatus) status?: DriverStatus;
  /** "company" = chỉ lái xe công ty; số = lái xe của nhà xe đối tác đó */
  @IsOptional() @IsString() owner?: string;
}

export class DriverSalaryDto {
  /** Tháng bắt đầu áp dụng: YYYY-MM */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Tháng áp dụng không hợp lệ' })
  effectiveFrom: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Lương cứng không hợp lệ' })
  @Min(0, { message: 'Lương cứng không được âm' })
  baseSalary: number;

  @Type(() => Number)
  @IsNumber({}, { message: '% doanh số không hợp lệ' })
  @Min(0, { message: '% doanh số không được âm' })
  @Max(100, { message: '% doanh số tối đa 100' })
  commissionPercent: number;

  @IsOptional() @IsString() note?: string | null;
}
