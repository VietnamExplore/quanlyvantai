import { PartialType } from '@nestjs/mapped-types';
import { CustomerType } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { DOC_LANGUAGES } from '../common/doc-language';

export class CreateCustomerDto {
  @IsOptional()
  @IsEnum(CustomerType)
  type?: CustomerType;

  @IsString()
  @IsNotEmpty({ message: 'Tên khách hàng không được để trống' })
  name: string;

  @IsOptional() @IsString() phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @IsOptional() @IsString() taxCode?: string;
  @IsOptional() @IsString() address?: string;

  /** Nhân viên kinh doanh phụ trách */
  @IsOptional()
  @IsInt()
  salesUserId?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number | null;

  /** Số ngày được nợ sau khi kết thúc chuyến */
  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermDays?: number;

  @IsOptional() @IsString() notes?: string;

  /** Ngôn ngữ giấy tờ mặc định cho booking của khách */
  @IsOptional() @IsIn(DOC_LANGUAGES, { message: 'Ngôn ngữ giấy tờ không hợp lệ' }) docLanguage?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class CustomerQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(CustomerType) type?: CustomerType;
  @IsOptional() @IsInt() salesUserId?: number;
}
