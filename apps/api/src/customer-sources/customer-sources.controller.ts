import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { codeFromName } from '../finance/finance.service';
import { PrismaService } from '../prisma/prisma.service';

class CreateCustomerSourceDto {
  /** Bỏ trống để tự tạo mã từ tên */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsOptional()
  @Matches(/^[A-Z0-9_]+$/, { message: 'Mã chỉ gồm chữ không dấu, số và dấu gạch dưới' })
  code?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Tên nguồn khách không được để trống' })
  name: string;

  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateCustomerSourceDto extends PartialType(CreateCustomerSourceDto) {}

/** Danh mục nguồn khách của booking (Hotline, Zalo, OTA…) */
@Controller('customer-sources')
@Roles(...OFFICE_ROLES)
export class CustomerSourcesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.customerSource.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { bookings: true } } },
    });
  }

  /** Nhân viên nhận booking cũng thêm nhanh được nguồn mới ngay trong form booking */
  @Post()
  @Roles(Role.ADMIN, Role.DIEU_HANH, Role.KINH_DOANH)
  async create(@Body() dto: CreateCustomerSourceDto) {
    const base = dto.code || codeFromName(dto.name);
    if (!base) throw new BadRequestException('Không tạo được mã từ tên nguồn, hãy nhập mã');
    let code = base;
    // Trùng mã thì thêm số phía sau
    for (let i = 2; await this.prisma.customerSource.findUnique({ where: { code } }); i++) code = `${base.slice(0, 36)}_${i}`;
    const maxOrder = await this.prisma.customerSource.aggregate({ _max: { sortOrder: true }, where: { code: { not: 'KHAC' } } });
    return this.prisma.customerSource.create({
      data: { ...dto, code, sortOrder: dto.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1 },
    });
  }

  /** Mã không đổi được (đang dùng để liên kết booking); ngừng dùng bằng isActive = false */
  @Patch(':code')
  @Roles(Role.ADMIN)
  update(@Param('code') code: string, @Body() { code: _c, ...dto }: UpdateCustomerSourceDto) {
    return this.prisma.customerSource.update({ where: { code }, data: dto });
  }
}
