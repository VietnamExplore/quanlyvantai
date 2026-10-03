import { PartialType } from '@nestjs/mapped-types';
import { DriverStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
