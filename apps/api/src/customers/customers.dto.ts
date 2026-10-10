import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { DOC_LANGUAGES } from '../common/doc-language';

export class CreateCustomerDto {
  /** Mã loại khách hàng (danh mục /customer-types) */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  type?: string;

  @IsString()
  @IsNotEmpty({ message: 'Tên khách hàng không được để trống' })
  name: string;

  @IsOptional() @IsString() phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @IsOptional() @IsString() taxCode?: string;
  @IsOptional() @IsString() address?: string;

  /** Thông tin Bên A trên hợp đồng vận chuyển */
  @IsOptional() @IsString() idNumber?: string | null;
  @IsOptional() @IsString() representative?: string | null;
  @IsOptional() @IsString() representativeTitle?: string | null;
  @IsOptional() @IsString() representativeIdNumber?: string | null;
  @IsOptional() @IsString() bankAccount?: string | null;

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
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsInt() salesUserId?: number;
}
