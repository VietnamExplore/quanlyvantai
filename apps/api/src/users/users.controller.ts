import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Delete } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll(@Query('q') q?: string, @Query('role') role?: Role) {
    return this.users.findAll(q, role);
  }

  /** Danh sách nhân viên kinh doanh để chọn người phụ trách khách hàng. */
  @Get('sales-staff')
  @Roles(...OFFICE_ROLES)
  salesStaff() {
    return this.users.salesStaff();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.users.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  // Không xóa người dùng: khóa tài khoản bằng isActive = false để giữ lịch sử thao tác
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto, @CurrentUser() me: AuthUser) {
    return this.users.update(id, dto, me.id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() me: AuthUser) {
    return this.users.remove(id, me.id);
  }
}
