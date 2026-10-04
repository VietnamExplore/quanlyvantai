import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { BookingQueryDto, ChangeStatusDto, CreateBookingDto, UpdateBookingDto } from './bookings.dto';
import { BookingsService } from './bookings.service';

const BOOKING_EDITORS = [Role.ADMIN, Role.DIEU_HANH, Role.KINH_DOANH];

@Controller('bookings')
@Roles(...OFFICE_ROLES)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  findAll(@Query() query: BookingQueryDto) {
    return this.bookings.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.bookings.findOne(id);
  }

  @Post()
  @Roles(...BOOKING_EDITORS)
  create(@Body() dto: CreateBookingDto, @CurrentUser() user: AuthUser) {
    return this.bookings.create(dto, user);
  }

  /** Tạo nhanh lệnh điều xe khi chưa có booking: hệ thống tạo booking đã xác nhận chứa chuyến đó */
  @Post('quick-dispatch')
  @Roles(...BOOKING_EDITORS)
  quickDispatch(@Body() dto: CreateBookingDto, @CurrentUser() user: AuthUser) {
    return this.bookings.createQuickDispatch(dto, user);
  }

  @Patch(':id')
  @Roles(...BOOKING_EDITORS)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBookingDto) {
    return this.bookings.update(id, dto);
  }

  @Post(':id/status')
  @HttpCode(200)
  @Roles(...BOOKING_EDITORS)
  changeStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: ChangeStatusDto) {
    return this.bookings.changeStatus(id, dto);
  }
}
