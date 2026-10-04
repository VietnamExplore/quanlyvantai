import { PartialType } from '@nestjs/mapped-types';
import { PaymentMethod, VoucherType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, NotEquals } from 'class-validator';

export class CreateCostCategoryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsOptional()
  @Matches(/^[A-Z0-9_]+$/, { message: 'Mã chỉ gồm chữ không dấu, số và dấu gạch dưới' })
  code?: string;

  @IsString()
  @IsNotEmpty({ message: 'Tên loại chi phí không được để trống' })
  name: string;

  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateCostCategoryDto extends PartialType(CreateCostCategoryDto) {}

export class CreateTripCostDto {
  @IsString()
  @IsNotEmpty({ message: 'Chưa chọn loại chi phí' })
  categoryCode: string;

  @IsNumber({}, { message: 'Số tiền không hợp lệ' })
  @Min(1, { message: 'Số tiền phải lớn hơn 0' })
  amount: number;

  @IsOptional() @IsDateString() spentAt?: string;
  @IsOptional() @IsString() note?: string | null;
}

export class CreatePaymentDto {
  /** Số âm = hoàn tiền cho khách */
  @IsNumber({}, { message: 'Số tiền không hợp lệ' })
  @NotEquals(0, { message: 'Số tiền phải khác 0' })
  amount: number;

  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @IsDateString({}, { message: 'Ngày thu không hợp lệ' }) paidAt: string;
  @IsOptional() @IsString() reference?: string | null;
  @IsOptional() @IsString() note?: string | null;
}

export class CreatePartnerPaymentDto extends CreatePaymentDto {}

export class RangeQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class CreateVoucherDto {
  @IsEnum(VoucherType, { message: 'Loại phiếu không hợp lệ' }) type: VoucherType;
  @IsDateString({}, { message: 'Ngày lập phiếu không hợp lệ' }) date: string;

  @IsNumber({}, { message: 'Số tiền không hợp lệ' })
  @Min(1, { message: 'Số tiền phải lớn hơn 0' })
  amount: number;

  @IsOptional() @IsString() categoryCode?: string | null;
  @IsOptional() @IsString() title?: string | null;
  @IsOptional() @IsInt() vehicleId?: number | null;
  @IsOptional() @IsInt() partnerId?: number | null;
  @IsOptional() @IsString() counterparty?: string | null;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @IsOptional() @IsString() reference?: string | null;
  @IsOptional() @IsString() note?: string | null;
}

export class UpdateVoucherDto extends PartialType(CreateVoucherDto) {}
