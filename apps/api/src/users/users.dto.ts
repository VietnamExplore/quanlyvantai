import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Tên đăng nhập: bỏ khoảng trắng hai đầu; không chứa dấu cách */
const USERNAME_RULES = [
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)),
  IsString(),
  IsNotEmpty({ message: 'Tên đăng nhập không được để trống' }),
  MinLength(3, { message: 'Tên đăng nhập tối thiểu 3 ký tự' }),
  MaxLength(50, { message: 'Tên đăng nhập tối đa 50 ký tự' }),
  Matches(/^\S+$/, { message: 'Tên đăng nhập không được có dấu cách' }),
];
const Username = (): PropertyDecorator => (target, key) => USERNAME_RULES.forEach((d) => d(target, key));

export class CreateUserDto {
  @Username()
  username: string;

  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Phải chọn ít nhất một vai trò' })
  @IsEnum(Role, { each: true })
  roles: Role[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Liên kết với hồ sơ lái xe (chỉ dùng cho tài khoản vai trò LAI_XE); null để bỏ liên kết. */
  @IsOptional()
  @IsInt()
  driverId?: number | null;
}

export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['username', 'password'] as const)) {
  /** Admin đổi tên đăng nhập (người dùng đăng nhập bằng tên mới, phiên đang mở không bị đăng xuất) */
  @IsOptional()
  @Username()
  username?: string;

  /** Admin đặt lại mật khẩu cho người dùng. */
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password?: string;
}
