import { PartialType } from '@nestjs/mapped-types';
import { BookingStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class PriceLineDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  amount: number;

  /** true = phụ thu tự động (ban đêm, lễ Tết), sẽ được tính lại khi đổi giờ đón */
  @IsOptional()
  @IsBoolean()
  auto?: boolean;
}

export class TripDto {
  /** Có id = sửa chuyến cũ; không có = thêm chuyến mới */
  @IsOptional() @IsInt() id?: number;

  @IsString() @IsNotEmpty({ message: 'Chưa chọn dịch vụ' }) serviceType: string;
  @IsDateString() pickupTime: string;
  /** Bỏ trống để hệ thống tự tính theo tuyến / số ngày thuê */
  @IsOptional() @IsDateString() endTime?: string | null;

  @IsOptional() @IsInt() pickupLocationId?: number | null;

  @IsString()
  @IsNotEmpty({ message: 'Chưa nhập điểm đón' })
  pickupAddress: string;

  @IsOptional() @IsInt() dropoffLocationId?: number | null;
  @IsOptional() @IsString() dropoffAddress?: string | null;
  @IsOptional() @IsString() flightNumber?: string | null;

  @IsInt() @Min(1, { message: 'Số khách phải từ 1 trở lên' }) passengers: number;
  @IsInt() vehicleTypeId: number;
  @IsOptional() @IsInt() routePriceId?: number | null;
  @IsOptional() @IsInt() @Min(1) days?: number;
  @IsOptional() @IsInt() @Min(0) extraKm?: number;
  @IsOptional() @IsInt() @Min(0) extraHours?: number;

  @IsNumber() @Min(0) unitPrice: number;

  /** Chi phí dự kiến của chuyến (giá thuê đối tác / chi phí xe công ty) */
  @IsOptional() @IsNumber() @Min(0) estimatedCost?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceLineDto)
  surcharges?: PriceLineDto[];

  @IsOptional() @IsString() itinerary?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

export class PassengerDto {
  @IsString()
  @IsNotEmpty({ message: 'Hành khách phải có họ tên' })
  fullName: string;

  @IsOptional() @IsIn(['NAM', 'NU'], { message: 'Giới tính hành khách không hợp lệ' }) gender?: 'NAM' | 'NU' | null;
  @IsOptional() @IsInt() @Min(1900, { message: 'Năm sinh không hợp lệ' }) @Max(2100, { message: 'Năm sinh không hợp lệ' }) birthYear?: number | null;
  @IsOptional() @IsString() idNumber?: string | null;
  @IsOptional() @IsString() nationality?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() note?: string | null;
}

export class CreateBookingDto {
  @IsOptional() @IsInt() customerId?: number | null;

  /** Mã booking của khách / đại lý (nếu có) */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsOptional()
  @IsString()
  customerRef?: string | null;

  @IsString()
  @IsNotEmpty({ message: 'Chưa nhập tên người liên hệ' })
  contactName: string;

  @IsString()
  @IsNotEmpty({ message: 'Chưa nhập SĐT người liên hệ' })
  contactPhone: string;

  /** Mã nguồn khách trong danh mục Nguồn khách (HOTLINE, ZALO, OTA…) */
  @IsOptional() @IsString() @IsNotEmpty({ message: 'Chưa chọn nguồn khách' }) source?: string;
  @IsOptional() @IsInt() salesUserId?: number | null;
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) vatPercent?: number;
  @IsOptional() @IsNumber() @Min(0) depositAmount?: number;
  @IsOptional() @IsDateString() quoteValidUntil?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsString() internalNotes?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripDto)
  trips: TripDto[];

  /** Danh sách hành khách: gửi kèm thì thay toàn bộ danh sách cũ */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  passengers?: PassengerDto[];

  @IsOptional() @IsString() signTitle?: string | null;
  @IsOptional() @IsString() signSubtitle?: string | null;
}

export class UpdateBookingDto extends PartialType(CreateBookingDto) {}

export class ChangeStatusDto {
  @IsEnum(BookingStatus) status: BookingStatus;
  @IsOptional() @IsString() cancelReason?: string;
}

export class BookingQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(BookingStatus) status?: BookingStatus;
  @IsOptional() @IsInt() salesUserId?: number;
  /** Lọc theo ngày đón của chuyến: YYYY-MM-DD */
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
