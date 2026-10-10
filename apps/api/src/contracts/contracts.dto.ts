import { Transform, Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

const trimOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

class TripKmDto {
  @IsInt() id: number;
  @IsOptional() @IsInt() @Min(0) distanceKm?: number | null;
}

export class SaveContractDto {
  @IsDateString({}, { message: 'Ngày ký không hợp lệ' }) signedDate: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Nhập tên bên thuê vận tải' })
  hirerName: string;

  @Transform(trimOrNull) @IsOptional() @IsString() hirerIdNumber?: string | null;
  @Transform(trimOrNull) @IsOptional() @IsString() hirerTaxCode?: string | null;
  @Transform(trimOrNull) @IsOptional() @IsString() hirerAddress?: string | null;
  @Transform(trimOrNull) @IsOptional() @IsString() hirerPhone?: string | null;
  @Transform(trimOrNull) @IsOptional() @IsString() hirerRepresentative?: string | null;
  @Transform(trimOrNull) @IsOptional() @IsString() hirerPosition?: string | null;
  @Transform(trimOrNull) @IsOptional() @IsString() hirerRepIdNumber?: string | null;
  @Transform(trimOrNull) @IsOptional() @IsString() paymentMethod?: string | null;
  @Transform(trimOrNull) @IsOptional() @IsString() @MaxLength(5000) extraTerms?: string | null;

  /** Cự ly (km) từng chuyến */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TripKmDto) trips?: TripKmDto[];
}

export class AcceptContractDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Nhập họ tên người xác nhận' })
  @MaxLength(120)
  name: string;
}
