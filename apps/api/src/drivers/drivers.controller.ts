import { Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { CreateDriverDto, DriverQueryDto, DriverSalaryDto, UpdateDriverDto } from './drivers.dto';
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

  // ───── Lương lái xe công ty: chỉ Admin, Kế toán ─────

  /** Mức lương đang áp dụng (tháng hiện tại) của tất cả lái xe công ty */
  @Get('salaries/current')
  @Roles(Role.ADMIN, Role.KE_TOAN)
  currentSalaries() {
    return this.drivers.currentSalaries();
  }

  @Get(':id/salaries')
  @Roles(Role.ADMIN, Role.KE_TOAN)
  salaries(@Param('id', ParseIntPipe) id: number) {
    return this.drivers.salaries(id);
  }

  /** Thêm / sửa mức lương áp dụng từ một tháng */
  @Put(':id/salaries')
  @Roles(Role.ADMIN, Role.KE_TOAN)
  setSalary(@Param('id', ParseIntPipe) id: number, @Body() dto: DriverSalaryDto, @CurrentUser() user: AuthUser) {
    return this.drivers.setSalary(id, dto, user.id);
  }

  @Delete('salaries/:salaryId')
  @Roles(Role.ADMIN, Role.KE_TOAN)
  removeSalary(@Param('salaryId', ParseIntPipe) salaryId: number) {
    return this.drivers.removeSalary(salaryId);
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
