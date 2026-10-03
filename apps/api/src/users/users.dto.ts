import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Role } from '@prisma/client';
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
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
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
  /** Admin đặt lại mật khẩu cho người dùng. */
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password?: string;
}
