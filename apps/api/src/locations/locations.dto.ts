import { PartialType } from '@nestjs/mapped-types';
import { LocationType } from '@prisma/client';
import { IsBoolean, IsEnum, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLocationDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên địa điểm không được để trống' })
  name: string;

  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;

  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsLatitude() lat?: number | null;
  @IsOptional() @IsLongitude() lng?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateLocationDto extends PartialType(CreateLocationDto) {}
