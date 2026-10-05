import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
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
import { OdometerService } from './odometer.service';
import { removeReceipt, sendReceipt } from './receipts';

const ACCOUNTING = [Role.ADMIN, Role.KE_TOAN];

@Controller()
@Roles(...OFFICE_ROLES)
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly prisma: PrismaService,
    private readonly odometer: OdometerService,
    private readonly push: PushService,
  ) {}

  // ───── Loại chi phí ─────

  @Get('cost-categories')
  @Roles(...OFFICE_ROLES, Role.LAI_XE)
  categories(@CurrentUser() user: AuthUser) {
    // Tài khoản chỉ là lái xe: chỉ thấy loại đang dùng và được phép chọn trên app (không có lương, tạm ứng…)
    const driverOnly = !user.roles.some((r) => OFFICE_ROLES.includes(r));
    return this.prisma.costCategory.findMany({
      ...(driverOnly && { where: { isActive: true, driverVisible: true } }),
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { costs: true } } },
    });
  }

  @Post('cost-categories')
  @Roles(...ACCOUNTING)
  createCategory(@Body() dto: CreateCostCategoryDto) {
    return this.finance.createCategory(dto.name, dto.code, dto.sortOrder, dto.driverVisible);
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
    removeReceipt(cost.receiptFile);
    return this.finance.tripCosts(cost.tripId);
  }

  /** Ảnh hóa đơn / vé lái xe chụp kèm khoản chi phí */
  @Get('trip-costs/:id/receipt')
  async receipt(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    sendReceipt(res, await this.prisma.tripCost.findUnique({ where: { id }, select: { receiptFile: true, receiptType: true } }));
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

  @Get('vouchers/:id/receipt')
  @Roles(Role.ADMIN, Role.KE_TOAN, Role.DIEU_HANH)
  async voucherReceipt(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    sendReceipt(res, await this.prisma.cashVoucher.findUnique({ where: { id }, select: { receiptFile: true, receiptType: true } }));
  }

  /** Văn phòng đã nhận lại tiền lái xe thu hộ khách (settled = false để hủy xác nhận) */
  @Post('trips/:id/collect-settle')
  @Roles(Role.ADMIN, Role.KE_TOAN, Role.DIEU_HANH)
  async settleCollect(@Param('id', ParseIntPipe) id: number, @Body() body: { settled?: boolean }) {
    const trip = await this.prisma.bookingTrip.findUniqueOrThrow({ where: { id }, include: { booking: { select: { code: true } } } });
    if (!trip.collectedAt) throw new BadRequestException('Lái xe chưa xác nhận thu tiền');
    const updated = await this.prisma.bookingTrip.update({
      where: { id },
      data: { collectSettledAt: body.settled === false ? null : new Date() },
      select: { id: true, collectSettledAt: true },
    });
    if (body.settled !== false && !trip.collectSettledAt) {
      await this.push.notifyDriver(
        trip.driverId,
        'Văn phòng đã nhận tiền thu hộ',
        `${Number(trip.collectedAmount).toLocaleString('vi-VN')}đ · ${trip.booking.code}`,
        { tripId: id },
        'COLLECT_SETTLED',
      );
    }
    return updated;
  }

  /** Văn phòng sửa km bắt đầu / kết thúc, định mức xăng của chuyến (null = xóa) */
  @Post('trips/:id/odometer')
  @Roles(Role.ADMIN, Role.KE_TOAN, Role.DIEU_HANH)
  async tripOdometer(@Param('id', ParseIntPipe) id: number, @Body() body: { startKm?: unknown; endKm?: unknown; fuelNorm?: unknown }) {
    const num = (v: unknown, name: string, max: number) => {
      if (v === undefined) return undefined;
      if (v === null || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > max) throw new BadRequestException(`${name} không hợp lệ`);
      return n;
    };
    const km = (v: number | null | undefined) => (v === null || v === undefined ? v : Math.round(v));
    await this.odometer.record(id, {
      startKm: km(num(body.startKm, 'Km bắt đầu', 9_999_999)),
      endKm: km(num(body.endKm, 'Km kết thúc', 9_999_999)),
      fuelNorm: num(body.fuelNorm, 'Định mức', 100),
    });
    return this.prisma.bookingTrip.findUnique({ where: { id }, select: { id: true, startKm: true, endKm: true, fuelNorm: true, fuelPrice: true, fuelLiters: true, fuelCost: true } });
  }

  /** Định mức chung + giá xăng đang áp dụng */
  @Get('fuel-config')
  fuelConfig() {
    return this.odometer.config();
  }

  @Delete('vouchers/:id')
  @Roles(...ACCOUNTING)
  removeVoucher(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.cashVoucher.delete({ where: { id } });
  }
}
