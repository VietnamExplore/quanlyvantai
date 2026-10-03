import { PartialType } from '@nestjs/mapped-types';
import { BookingSource, BookingStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
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

export class CreateBookingDto {
  @IsOptional() @IsInt() customerId?: number | null;

  @IsString()
  @IsNotEmpty({ message: 'Chưa nhập tên người liên hệ' })
  contactName: string;

  @IsString()
  @IsNotEmpty({ message: 'Chưa nhập SĐT người liên hệ' })
  contactPhone: string;

  @IsOptional() @IsEnum(BookingSource) source?: BookingSource;
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
