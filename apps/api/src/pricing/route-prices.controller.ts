import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Prisma, Role, ServiceType } from '@prisma/client';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoutePriceDto, UpdateRoutePriceDto } from './pricing.dto';

const routeInclude = {
  fromLocation: { select: { id: true, name: true } },
  toLocation: { select: { id: true, name: true } },
  items: { include: { vehicleType: { select: { id: true, code: true, name: true, seats: true } } } },
} satisfies Prisma.RoutePriceInclude;

@Controller('route-prices')
@Roles(...OFFICE_ROLES)
export class RoutePricesController {
  constructor(private readonly prisma: PrismaService) {}

  /** ?vehicleTypeId= để chỉ lấy tuyến đã có giá cho loại xe đó */
  @Get()
  findAll(@Query('q') q?: string, @Query('serviceType') serviceType?: ServiceType, @Query('vehicleTypeId') vehicleTypeId?: string) {
    return this.prisma.routePrice.findMany({
      where: {
        serviceType,
        ...(vehicleTypeId && { items: { some: { vehicleTypeId: Number(vehicleTypeId) } } }),
        ...(q && { name: { contains: q, mode: 'insensitive' } }),
      },
      include: routeInclude,
      orderBy: [{ isActive: 'desc' }, { serviceType: 'asc' }, { name: 'asc' }],
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.routePrice.findUniqueOrThrow({ where: { id }, include: routeInclude });
  }

  @Post()
  @Roles(Role.ADMIN, Role.KE_TOAN)
  create(@Body() { items, ...data }: CreateRoutePriceDto) {
    return this.prisma.routePrice.create({
      data: { ...data, items: { create: items } },
      include: routeInclude,
    });
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.KE_TOAN)
  update(@Param('id', ParseIntPipe) id: number, @Body() { items, ...data }: UpdateRoutePriceDto) {
    return this.prisma.routePrice.update({
      where: { id },
      data: {
        ...data,
        // Thay toàn bộ bảng giá theo loại xe của tuyến
        ...(items && { items: { deleteMany: {}, create: items } }),
      },
      include: routeInclude,
    });
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.KE_TOAN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.routePrice.delete({ where: { id } });
  }
}
