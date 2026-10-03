import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { CreateVehicleDto, UpdateVehicleDto, VehicleQueryDto } from './vehicles.dto';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
@Roles(...OFFICE_ROLES)
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  findAll(@Query() query: VehicleQueryDto) {
    return this.vehicles.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.vehicles.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.DIEU_HANH)
  create(@Body() dto: CreateVehicleDto) {
    return this.vehicles.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.DIEU_HANH)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVehicleDto) {
    return this.vehicles.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.DIEU_HANH)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.vehicles.remove(id);
  }
}
