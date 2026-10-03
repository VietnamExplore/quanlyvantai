import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleTypeDto, UpdateVehicleTypeDto } from './vehicle-types.dto';

@Controller('vehicle-types')
@Roles(...OFFICE_ROLES)
export class VehicleTypesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.vehicleType.findMany({
      orderBy: { seats: 'asc' },
      include: { _count: { select: { vehicles: true } } },
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateVehicleTypeDto) {
    return this.prisma.vehicleType.create({ data: dto });
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVehicleTypeDto) {
    return this.prisma.vehicleType.update({ where: { id }, data: dto });
  }
}
