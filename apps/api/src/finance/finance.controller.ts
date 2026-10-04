import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCostCategoryDto,
  CreatePartnerPaymentDto,
  CreatePaymentDto,
  CreateTripCostDto,
  CreateVoucherDto,
  RangeQueryDto,
  UpdateCostCategoryDto,
  UpdateVoucherDto,
} from './finance.dto';
import { FinanceService } from './finance.service';

const ACCOUNTING = [Role.ADMIN, Role.KE_TOAN];

@Controller()
@Roles(...OFFICE_ROLES)
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly prisma: PrismaService,
  ) {}

  // ───── Loại chi phí ─────

  @Get('cost-categories')
  @Roles(...OFFICE_ROLES, Role.LAI_XE)
  categories() {
    return this.prisma.costCategory.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { costs: true } } },
    });
  }

  @Post('cost-categories')
  @Roles(...ACCOUNTING)
  createCategory(@Body() dto: CreateCostCategoryDto) {
    return this.finance.createCategory(dto.name, dto.code, dto.sortOrder);
  }

  /** Mã không đổi được; ngừng dùng bằng isActive = false */
  @Patch('cost-categories/:code')
  @Roles(...ACCOUNTING)
  updateCategory(@Param('code') code: string, @Body() { code: _c, ...dto }: UpdateCostCategoryDto) {
    return this.prisma.costCategory.update({ where: { code }, data: dto });
  }

  // ───── Chi phí chuyến ─────

  @Get('trips/:id/costs')
  tripCosts(@Param('id', ParseIntPipe) id: number) {
    return this.finance.tripCosts(id);
  }

  @Post('trips/:id/costs')
  @Roles(Role.ADMIN, Role.DIEU_HANH, Role.KE_TOAN)
  addTripCost(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateTripCostDto, @CurrentUser() user: AuthUser) {
    return this.finance.addTripCost(id, dto, user);
  }

  @Delete('trip-costs/:id')
  @Roles(...ACCOUNTING)
  async removeTripCost(@Param('id', ParseIntPipe) id: number) {
    const cost = await this.prisma.tripCost.delete({ where: { id } });
    return this.finance.tripCosts(cost.tripId);
  }

  // ───── Thu tiền khách ─────

  @Post('bookings/:id/payments')
  @Roles(Role.ADMIN, Role.KE_TOAN, Role.KINH_DOANH)
  addPayment(@Param('id', ParseIntPipe) id: number, @Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.finance.addPayment(id, dto, user);
  }

  @Delete('payments/:id')
  @Roles(...ACCOUNTING)
  removePayment(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.payment.delete({ where: { id } });
  }

  // ───── Thanh toán nhà xe ─────

  @Post('partners/:id/payments')
  @Roles(...ACCOUNTING)
  addPartnerPayment(@Param('id', ParseIntPipe) id: number, @Body() dto: CreatePartnerPaymentDto, @CurrentUser() user: AuthUser) {
    return this.finance.addPartnerPayment(id, dto, user);
  }

  @Delete('partner-payments/:id')
  @Roles(...ACCOUNTING)
  removePartnerPayment(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.partnerPayment.delete({ where: { id } });
  }

  // ───── Công nợ & sổ thu chi ─────

  /** Kinh doanh (không kiêm vai trò khác) chỉ thấy công nợ booking của mình */
  @Get('finance/receivables')
  receivables(@CurrentUser() user: AuthUser) {
    const ownOnly = !user.roles.some((r) => r === Role.ADMIN || r === Role.KE_TOAN || r === Role.DIEU_HANH);
    return this.finance.receivables(ownOnly ? user.id : undefined);
  }

  @Get('finance/payables')
  @Roles(Role.ADMIN, Role.KE_TOAN, Role.DIEU_HANH)
  payables() {
    return this.finance.payables();
  }

  @Get('finance/ledger')
  @Roles(Role.ADMIN, Role.KE_TOAN, Role.DIEU_HANH)
  ledger(@Query() q: RangeQueryDto) {
    return this.finance.ledger(q.from, q.to);
  }

  // ───── Phiếu thu / phiếu chi (gắn xe công ty hoặc đối tác) ─────

  @Get('vouchers/:id')
  @Roles(Role.ADMIN, Role.KE_TOAN, Role.DIEU_HANH)
  voucher(@Param('id', ParseIntPipe) id: number) {
    return this.finance.voucher(id);
  }

  @Post('vouchers')
  @Roles(Role.ADMIN, Role.KE_TOAN, Role.DIEU_HANH)
  createVoucher(@Body() dto: CreateVoucherDto, @CurrentUser() user: AuthUser) {
    return this.finance.createVoucher(dto, user);
  }

  @Patch('vouchers/:id')
  @Roles(...ACCOUNTING)
  updateVoucher(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVoucherDto) {
    return this.finance.updateVoucher(id, dto);
  }

  @Delete('vouchers/:id')
  @Roles(...ACCOUNTING)
  removeVoucher(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.cashVoucher.delete({ where: { id } });
  }
}
