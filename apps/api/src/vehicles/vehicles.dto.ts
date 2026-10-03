import { PartialType } from '@nestjs/mapped-types';
import { Ownership, VehicleStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateVehicleDto {
  // Chuẩn hóa biển số: bỏ khoảng trắng thừa, viết hoa (ví dụ "51b-123.45" → "51B-123.45")
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty({ message: 'Biển số không được để trống' })
  plateNumber: string;

  @IsInt()
  vehicleTypeId: number;

  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() color?: string;

  @IsOptional()
  @IsInt()
  @Min(1980)
  @Max(2100)
  year?: number;

  @IsEnum(Ownership)
  ownership: Ownership;

  /** Bắt buộc khi ownership = DOI_TAC */
  @IsOptional()
  @IsInt()
  partnerId?: number | null;

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsOptional() @IsDateString() registrationExpiry?: string | null;
  @IsOptional() @IsDateString() insuranceExpiry?: string | null;
  @IsOptional() @IsDateString() badgeExpiry?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  odometerKm?: number;

  @IsOptional()
  @IsInt()
  defaultDriverId?: number | null;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}

export class VehicleQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(Ownership) ownership?: Ownership;
  @IsOptional() @IsEnum(VehicleStatus) status?: VehicleStatus;
  @IsOptional() @IsInt() vehicleTypeId?: number;
  @IsOptional() @IsInt() partnerId?: number;
}
