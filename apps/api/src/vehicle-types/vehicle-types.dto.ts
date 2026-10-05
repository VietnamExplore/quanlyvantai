import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { CleanNames } from '../common/doc-language';

export class CreateVehicleTypeDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @Min(2)
  seats: number;

  @IsInt()
  @Min(1)
  maxPassengers: number;

  @IsArray()
  @IsString({ each: true })
  licenseClasses: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Định mức xăng dầu của loại xe (lít/100km), null = 11 */
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? Number(value) : value))
  @IsOptional()
  @IsNumber({}, { message: 'Định mức xăng không hợp lệ' })
  @Min(1, { message: 'Định mức xăng phải từ 1 lít/100km' })
  @Max(100, { message: 'Định mức xăng tối đa 100 lít/100km' })
  fuelNorm?: number | null;

  /** Tên trên giấy tờ gửi khách nước ngoài */
  @CleanNames()
  @IsOptional()
  @IsObject()
  names?: Record<string, string>;
}

export class UpdateVehicleTypeDto extends PartialType(CreateVehicleTypeDto) {}
