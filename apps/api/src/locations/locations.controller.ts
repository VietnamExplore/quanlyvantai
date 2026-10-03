import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { LocationType, Role } from '@prisma/client';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto, UpdateLocationDto } from './locations.dto';

@Controller('locations')
@Roles(...OFFICE_ROLES)
export class LocationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll(@Query('q') q?: string, @Query('type') type?: LocationType) {
    return this.prisma.location.findMany({
      where: {
        type,
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { address: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.location.findUniqueOrThrow({ where: { id } });
  }

  @Post()
  @Roles(Role.ADMIN, Role.DIEU_HANH, Role.KINH_DOANH)
  create(@Body() dto: CreateLocationDto) {
    return this.prisma.location.create({ data: dto });
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.DIEU_HANH, Role.KINH_DOANH)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLocationDto) {
    return this.prisma.location.update({ where: { id }, data: dto });
  }
}
