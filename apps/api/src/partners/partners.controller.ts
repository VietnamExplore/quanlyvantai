import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto, UpdatePartnerDto } from './partners.dto';

@Controller('partners')
@Roles(...OFFICE_ROLES)
export class PartnersController {
  constructor(private readonly prisma: PrismaService) {}

  /** ?vehicleType=XE29 để lọc nhà xe cung cấp được loại xe đó */
  @Get()
  findAll(@Query('q') q?: string, @Query('vehicleType') vehicleType?: string) {
    return this.prisma.partner.findMany({
      where: {
        ...(vehicleType && { vehicleTypeCodes: { has: vehicleType } }),
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { contactName: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
        }),
      },
      include: { _count: { select: { vehicles: true, drivers: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.partner.findUniqueOrThrow({
      where: { id },
      include: {
        vehicles: { include: { vehicleType: { select: { code: true, name: true } } } },
        drivers: true,
      },
    });
  }

  @Post()
  @Roles(Role.ADMIN, Role.DIEU_HANH)
  create(@Body() dto: CreatePartnerDto) {
    return this.prisma.partner.create({ data: dto });
  }

  // Không xóa nhà xe: ngừng hợp tác bằng isActive = false để giữ lịch sử chuyến và công nợ
  @Patch(':id')
  @Roles(Role.ADMIN, Role.DIEU_HANH)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePartnerDto) {
    return this.prisma.partner.update({ where: { id }, data: dto });
  }
}
