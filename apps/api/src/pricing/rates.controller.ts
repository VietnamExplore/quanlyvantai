import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { withDates } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import {
  CalculatePriceDto,
  CreateHolidayDto,
  CreateRentalRateDto,
  CreateSurchargeDto,
  UpdateHolidayDto,
  UpdateRentalRateDto,
  UpdateSurchargeDto,
} from './pricing.dto';
import { PricingService } from './pricing.service';

const PRICE_EDITORS = [Role.ADMIN, Role.KE_TOAN];

@Controller()
@Roles(...OFFICE_ROLES)
export class RatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  // ───── Tính giá ─────

  @Post('pricing/calculate')
  @HttpCode(200)
  calculate(@Body() dto: CalculatePriceDto) {
    return this.pricing.calculate(dto);
  }

  // ───── Giá thuê theo ngày ─────

  /** Tất cả loại xe kèm các gói giá thuê theo ngày (mảng rỗng nếu chưa khai báo) */
  @Get('rental-rates')
  rentalRates() {
    return this.prisma.vehicleType.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        seats: true,
        rentalRates: { orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }], include: { _count: { select: { trips: true } } } },
      },
      orderBy: { seats: 'asc' },
    });
  }

  @Post('rental-rates')
  @Roles(...PRICE_EDITORS)
  createRentalRate(@Body() dto: CreateRentalRateDto) {
    return this.prisma.rentalRate.create({ data: { ...dto, name: dto.name.trim() } });
  }

  @Patch('rental-rates/:id')
  @Roles(...PRICE_EDITORS)
  updateRentalRate(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRentalRateDto) {
    return this.prisma.rentalRate.update({ where: { id }, data: { ...dto, ...(dto.name !== undefined && { name: dto.name.trim() }) } });
  }

  /** Xóa gói giá: các chuyến đã dùng gói này giữ nguyên giá đã tính, chỉ bỏ liên kết tới gói */
  @Delete('rental-rates/:id')
  @Roles(...PRICE_EDITORS)
  removeRentalRate(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.rentalRate.delete({ where: { id } });
  }

  // ───── Phụ thu ─────

  @Get('surcharges')
  surcharges() {
    return this.prisma.surcharge.findMany({ orderBy: [{ isActive: 'desc' }, { rule: 'asc' }, { name: 'asc' }] });
  }

  @Post('surcharges')
  @Roles(...PRICE_EDITORS)
  createSurcharge(@Body() dto: CreateSurchargeDto) {
    return this.prisma.surcharge.create({ data: dto });
  }

  @Patch('surcharges/:id')
  @Roles(...PRICE_EDITORS)
  updateSurcharge(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSurchargeDto) {
    return this.prisma.surcharge.update({ where: { id }, data: dto });
  }

  @Delete('surcharges/:id')
  @Roles(...PRICE_EDITORS)
  removeSurcharge(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.surcharge.delete({ where: { id } });
  }

  // ───── Ngày lễ ─────

  @Get('holidays')
  holidays() {
    return this.prisma.holiday.findMany({ orderBy: { startDate: 'desc' } });
  }

  @Post('holidays')
  @Roles(...PRICE_EDITORS)
  createHoliday(@Body() dto: CreateHolidayDto) {
    return this.prisma.holiday.create({ data: withDates(dto, ['startDate', 'endDate']) as any });
  }

  @Patch('holidays/:id')
  @Roles(...PRICE_EDITORS)
  updateHoliday(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateHolidayDto) {
    return this.prisma.holiday.update({ where: { id }, data: withDates(dto, ['startDate', 'endDate']) as any });
  }

  @Delete('holidays/:id')
  @Roles(...PRICE_EDITORS)
  removeHoliday(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.holiday.delete({ where: { id } });
  }
}
