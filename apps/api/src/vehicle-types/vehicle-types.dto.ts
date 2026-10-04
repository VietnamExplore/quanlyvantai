import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Min } from 'class-validator';
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

  /** Tên trên giấy tờ gửi khách nước ngoài */
  @CleanNames()
  @IsOptional()
  @IsObject()
  names?: Record<string, string>;
}

export class UpdateVehicleTypeDto extends PartialType(CreateVehicleTypeDto) {}
