import { PartialType } from '@nestjs/mapped-types';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreatePartnerDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên nhà xe không được để trống' })
  name: string;

  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  /** Email nhận lệnh điều xe; nhiều địa chỉ cách nhau dấu phẩy */
  @IsOptional()
  @Matches(/^$|^\s*[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+(\s*[,;]\s*[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+)*\s*$/, { message: 'Email nhà xe không hợp lệ (nhiều địa chỉ cách nhau dấu phẩy)' })
  email?: string;
  @IsOptional() @IsString() zalo?: string;
  @IsOptional() @IsString() taxCode?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankAccount?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vehicleTypeCodes?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number | null;

  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePartnerDto extends PartialType(CreatePartnerDto) {}
