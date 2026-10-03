import { Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { CreateDriverDto, DriverQueryDto, UpdateDriverDto } from './drivers.dto';
import { DriversService } from './drivers.service';

@Controller('drivers')
@Roles(...OFFICE_ROLES)
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  /** App lái xe: xem hồ sơ của chính mình. Khai báo trước ':id' để không bị nhầm route. */
  @Get('me')
  @Roles(Role.LAI_XE)
  me(@CurrentUser() user: AuthUser) {
    if (!user.driverId) throw new NotFoundException('Tài khoản chưa được liên kết với hồ sơ lái xe');
    return this.drivers.findOne(user.driverId);
  }

  @Get()
  findAll(@Query() query: DriverQueryDto) {
    return this.drivers.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.drivers.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.DIEU_HANH)
  create(@Body() dto: CreateDriverDto) {
    return this.drivers.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.DIEU_HANH)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDriverDto) {
    return this.drivers.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.DIEU_HANH)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.drivers.remove(id);
  }
}
