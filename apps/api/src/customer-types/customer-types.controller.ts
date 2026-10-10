import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { codeFromName } from '../finance/finance.service';
import { PrismaService } from '../prisma/prisma.service';

class CreateCustomerTypeDto {
  /** Bỏ trống để tự tạo mã từ tên */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsOptional()
  @Matches(/^[A-Z0-9_]+$/, { message: 'Mã chỉ gồm chữ không dấu, số và dấu gạch dưới' })
  code?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Tên loại khách hàng không được để trống' })
  name: string;

  @IsOptional() @IsString() color?: string | null;
  /** Hưởng giá đại lý (xe ghép), booking mặc định nguồn Đại lý */
  @IsOptional() @IsBoolean() isAgent?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateCustomerTypeDto extends PartialType(CreateCustomerTypeDto) {}

/** Danh mục loại khách hàng (Khách lẻ, Doanh nghiệp, Đại lý, Khách sạn…) */
@Controller('customer-types')
@Roles(...OFFICE_ROLES)
export class CustomerTypesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.customerKind.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { customers: true } } },
    });
  }

  /** Người được tạo khách hàng cũng thêm nhanh được loại mới ngay trong form khách hàng */
  @Post()
  @Roles(Role.ADMIN, Role.KINH_DOANH)
  async create(@Body() dto: CreateCustomerTypeDto) {
    const base = dto.code || codeFromName(dto.name);
    if (!base) throw new BadRequestException('Không tạo được mã từ tên loại, hãy nhập mã');
    let code = base;
    // Trùng mã thì thêm số phía sau
    for (let i = 2; await this.prisma.customerKind.findUnique({ where: { code } }); i++) code = `${base.slice(0, 36)}_${i}`;
    const maxOrder = await this.prisma.customerKind.aggregate({ _max: { sortOrder: true } });
    return this.prisma.customerKind.create({
      data: { ...dto, code, sortOrder: dto.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1 },
    });
  }

  /** Mã không đổi được (đang liên kết khách hàng); ngừng dùng bằng isActive = false */
  @Patch(':code')
  @Roles(Role.ADMIN)
  update(@Param('code') code: string, @Body() { code: _c, ...dto }: UpdateCustomerTypeDto) {
    return this.prisma.customerKind.update({ where: { code }, data: dto });
  }
}
