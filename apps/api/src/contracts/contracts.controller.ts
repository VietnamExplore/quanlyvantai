import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthUser, CurrentUser, OFFICE_ROLES, Public, Roles } from '../auth/auth.decorators';
import { assertCanEditBooking } from '../bookings/booking-access';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptContractDto, SaveContractDto } from './contracts.dto';
import { ContractsService } from './contracts.service';

/** Hợp đồng vận chuyển + danh sách hành khách (NĐ 158/2024, TT 36/2024) và lệnh vận chuyển */
@Controller()
@Roles(...OFFICE_ROLES)
export class ContractsController {
  constructor(
    private readonly contracts: ContractsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('contracts/booking/:id')
  forBooking(@Param('id', ParseIntPipe) id: number) {
    return this.contracts.forBooking(id);
  }

  /** Lập / sửa hợp đồng: người được sửa booking */
  @Put('contracts/booking/:id')
  @Roles(Role.ADMIN, Role.DIEU_HANH, Role.KINH_DOANH)
  async save(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveContractDto, @CurrentUser() user: AuthUser) {
    await assertCanEditBooking(this.prisma, id, user);
    return this.contracts.save(id, dto, user.id);
  }

  @Get('transport-orders/trip/:id')
  tripOrder(@Param('id', ParseIntPipe) id: number) {
    return this.contracts.tripOrder(id);
  }

  @Get('transport-orders/run/:id')
  runOrder(@Param('id', ParseIntPipe) id: number) {
    return this.contracts.runOrder(id);
  }

  // ── Bản điện tử: mở bằng mã bí mật, không cần đăng nhập ──

  @Get('public/contracts/:token')
  @Public()
  byToken(@Param('token') token: string) {
    return this.contracts.byToken(token);
  }

  @Post('public/contracts/:token/accept')
  @Public()
  accept(@Param('token') token: string, @Body() dto: AcceptContractDto, @Req() req: Request) {
    const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.ip || null;
    return this.contracts.accept(token, dto, ip);
  }
}
