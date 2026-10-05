import { PartialType } from '@nestjs/mapped-types';
import { BookingStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { DOC_LANGUAGES } from '../common/doc-language';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
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
  /** Số hiệu chuyến bay đón (khách đến) */
  @IsOptional() @IsString() flightNumber?: string | null;
  /** Số hiệu chuyến bay tiễn (khách về) */
  @IsOptional() @IsString() departureFlight?: string | null;
  /** Nhờ lái xe thu tiền khách giúp (đ) */
  @IsOptional() @IsNumber({}, { message: 'Số tiền thu hộ không hợp lệ' }) @Min(0) collectAmount?: number | null;
  @IsOptional() @IsString() collectNote?: string | null;
  /** Nhà xe đối tác phải xuất hóa đơn cho công ty */
  @IsOptional() @IsBoolean() partnerInvoice?: boolean;
  @IsOptional() @IsString() partnerInvoiceNote?: string | null;
  /** Thuế suất trên hóa đơn nhà xe (%), giá thuê là giá chưa thuế */
  @IsOptional() @IsNumber() @Min(0) @Max(100) partnerVatPercent?: number;

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

export const CONTACT_APPS = ['ZALO', 'WHATSAPP', 'KAKAOTALK', 'WECHAT', 'LINE', 'VIBER', 'TELEGRAM'];

export class CreateBookingDto {
  @IsOptional() @IsInt() customerId?: number | null;

  /** Mã booking của khách / đại lý (nếu có) */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsOptional()
  @IsString()
  customerRef?: string | null;

  /** Ngôn ngữ giấy tờ gửi khách (báo giá, danh sách hành khách, bảng đón) */
  @IsOptional() @IsIn(DOC_LANGUAGES, { message: 'Ngôn ngữ giấy tờ không hợp lệ' }) docLanguage?: string;

  /** Người liên hệ trong chuyến: HDV | TRUONG_DOAN */
  @IsOptional() @IsIn(['HDV', 'TRUONG_DOAN', null], { message: 'Vai trò người liên hệ không hợp lệ' }) leaderRole?: string | null;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsOptional()
  @IsString()
  leaderName?: string | null;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsOptional()
  @IsString()
  leaderPhone?: string | null;
  /** Ứng dụng liên lạc với người liên hệ trong chuyến (trống = tự đoán theo đầu số) */
  @IsOptional() @IsIn([...CONTACT_APPS, null], { message: 'Ứng dụng liên lạc không hợp lệ' }) leaderApp?: string | null;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsOptional()
  @IsString()
  leaderAppId?: string | null;

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
  /** Khách lấy hóa đơn VAT (không tích: thuế suất = 0) */
  @IsOptional() @IsBoolean() invoiceRequired?: boolean;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsOptional()
  @IsString()
  invoiceCompany?: string | null;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsOptional()
  @IsString()
  invoiceTaxCode?: string | null;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsOptional()
  @IsString()
  invoiceAddress?: string | null;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsOptional()
  @IsEmail({}, { message: 'Email nhận hóa đơn không hợp lệ' })
  invoiceEmail?: string | null;
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

export const PAYMENT_FILTERS = ['CHUA_THU', 'MOT_PHAN', 'DU', 'CHUA_GIA', 'CON_NO'] as const;

export class BookingQueryDto {
  @IsOptional() @IsString() q?: string;
  /** Một hoặc nhiều trạng thái, cách nhau dấu phẩy: XAC_NHAN,HOAN_THANH */
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsOptional()
  @IsEnum(BookingStatus, { each: true })
  status?: BookingStatus[];
  @IsOptional() @IsInt() customerId?: number;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() serviceType?: string;
  @IsOptional() @IsInt() vehicleTypeId?: number;
  /** Lọc theo ngày tạo booking: YYYY-MM-DD */
  @IsOptional() @IsDateString() createdFrom?: string;
  @IsOptional() @IsDateString() createdTo?: string;
  /** Tình trạng thu tiền */
  @IsOptional() @IsIn(PAYMENT_FILTERS) payment?: (typeof PAYMENT_FILTERS)[number];
  @IsOptional() @IsInt() salesUserId?: number;
  /** Lọc theo ngày đón của chuyến: YYYY-MM-DD */
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
