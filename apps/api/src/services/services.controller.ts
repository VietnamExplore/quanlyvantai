import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { PricingMode, Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Matches } from 'class-validator';
import { CleanNames } from '../common/doc-language';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

class CreateServiceDto {
  /** Bỏ trống để tự tạo mã từ tên */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsOptional()
  @Matches(/^[A-Z0-9_]+$/, { message: 'Mã chỉ gồm chữ không dấu, số và dấu gạch dưới' })
  code?: string;

  @IsString()
  @IsNotEmpty({ message: 'Tên dịch vụ không được để trống' })
  name: string;

  @IsOptional() @IsEnum(PricingMode) pricingMode?: PricingMode;
  @IsOptional() @IsBoolean() hasFlight?: boolean;
  @IsOptional() @IsString() color?: string | null;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;

  /** Tên trên giấy tờ gửi khách nước ngoài */
  @CleanNames()
  @IsOptional()
  @IsObject()
  names?: Record<string, string>;
}

class UpdateServiceDto extends PartialType(CreateServiceDto) {}

/** "Đưa đón Sân bay Đà Nẵng" -> "DUA_DON_SAN_BAY_DA_NANG" */
function codeFromName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

@Controller('services')
@Roles(...OFFICE_ROLES)
export class ServicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.service.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { trips: true, routes: true } } },
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  async create(@Body() dto: CreateServiceDto) {
    let code = dto.code || codeFromName(dto.name);
    if (!code) throw new BadRequestException('Không tạo được mã từ tên dịch vụ, hãy nhập mã');
    // Trùng mã thì thêm số phía sau
    for (let i = 2; await this.prisma.service.findUnique({ where: { code } }); i++) code = `${(dto.code || codeFromName(dto.name)).slice(0, 36)}_${i}`;
    const maxOrder = await this.prisma.service.aggregate({ _max: { sortOrder: true } });
    return this.prisma.service.create({
      data: { ...dto, code, sortOrder: dto.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1 },
    });
  }

  /** Mã dịch vụ không đổi được (đang dùng để liên kết dữ liệu); ngừng dùng bằng isActive = false */
  @Patch(':code')
  @Roles(Role.ADMIN)
  update(@Param('code') code: string, @Body() { code: _ignored, ...dto }: UpdateServiceDto) {
    return this.prisma.service.update({ where: { code }, data: dto });
  }
}
