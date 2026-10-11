import { orderPath } from '../contracts/contracts.service';
import { assertPreCheck, lastPreCheck, preCheckRequired } from '../field/field.service';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { existsSync } from 'fs';
import { BookingStatus, PaymentMethod, Prisma, Role, TripStatus, VoucherType } from '@prisma/client';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { AdvancesService } from '../advances/advances.service';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { CreateTripCostDto } from '../finance/finance.dto';
import { FinanceService } from '../finance/finance.service';
import { OdometerService } from '../finance/odometer.service';
import { receiptUpload, removeReceipt, sendReceipt } from '../finance/receipts';
import { SIGN_DIR, signImage } from '../bookings/sign-file.controller';
import { PayrollService, vnDate } from '../reports/payroll.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

/** Bước kế tiếp hợp lệ mà lái xe được bấm */
const NEXT: Partial<Record<TripStatus, TripStatus>> = {
  DA_GAN: TripStatus.TAI_XE_NHAN,
  TAI_XE_NHAN: TripStatus.DANG_DEN_DON,
  DANG_DEN_DON: TripStatus.DA_DON_KHACH,
  DA_DON_KHACH: TripStatus.HOAN_THANH,
};
const ACTIVE: TripStatus[] = [TripStatus.DA_GAN, TripStatus.TAI_XE_NHAN, TripStatus.DANG_DEN_DON, TripStatus.DA_DON_KHACH];

class DriverStatusDto {
  @IsIn(Object.values(NEXT))
  status: TripStatus;

  /** Km đồng hồ: bắt đầu (chỉ khi xe chưa có km kết thúc chuyến trước) / kết thúc (khi hoàn thành) */
  @IsOptional() @IsInt({ message: 'Số km không hợp lệ' }) @Min(0) startKm?: number;
  @IsOptional() @IsInt({ message: 'Số km không hợp lệ' }) @Min(0) endKm?: number;
}

class OdometerDto {
  @IsOptional() @IsInt({ message: 'Số km không hợp lệ' }) @Min(0) startKm?: number;
  @IsInt({ message: 'Số km không hợp lệ' }) @Min(0) endKm: number;
}

class RejectDto {
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập lý do' })
  reason: string;
}

class CollectDto {
  @IsNumber({}, { message: 'Số tiền không hợp lệ' })
  @Min(1, { message: 'Số tiền phải lớn hơn 0' })
  amount: number;

  @IsIn([PaymentMethod.TIEN_MAT, PaymentMethod.CHUYEN_KHOAN], { message: 'Hình thức không hợp lệ' })
  method: PaymentMethod;
}

class AdvanceDto {
  @IsNumber({}, { message: 'Số tiền không hợp lệ' })
  @Min(10000, { message: 'Số tiền tạm ứng tối thiểu 10.000đ' })
  amount: number;

  @IsString()
  @IsNotEmpty({ message: 'Nhập lý do tạm ứng' })
  reason: string;
}

class FuelDto {
  @IsDateString({}, { message: 'Ngày không hợp lệ' }) date: string;
  @IsInt({ message: 'Chưa chọn xe' }) vehicleId: number;
  @IsNumber({}, { message: 'Số tiền không hợp lệ' })
  @Min(1, { message: 'Số tiền phải lớn hơn 0' })
  amount: number;
  @IsOptional() @IsNumber({}, { message: 'Số lít không hợp lệ' }) liters?: number | null;
  @IsOptional() @IsInt({ message: 'Số km không hợp lệ' }) odometerKm?: number | null;
  /** Lái xe tự trả tiền → văn phòng hoàn lại trong lương */
  @IsOptional() @IsBoolean() driverPaid?: boolean;
  @IsOptional() @IsString() note?: string | null;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

class PushTokenDto {
  @IsOptional()
  @IsString()
  token?: string | null;
}

/** Thông tin chuyến cho lái xe: không gồm giá bán, chi phí */
const driverTripSelect = {
  id: true,
  shuttleRunId: true,
  // Ký nhận điện tử của khách
  signoffName: true,
  signoffAt: true,
  serviceType: true,
  status: true,
  pickupTime: true,
  endTime: true,
  pickupAddress: true,
  dropoffAddress: true,
  flightNumber: true,
  departureFlight: true,
  passengers: true,
  days: true,
  itinerary: true,
  notes: true,
  dispatchNote: true,
  collectAmount: true,
  collectNote: true,
  collectedAt: true,
  collectedAmount: true,
  collectMethod: true,
  startKm: true,
  endKm: true,
  vehicleId: true,
  vehicleType: { select: { name: true } },
  service: { select: { name: true } },
  vehicle: { select: { plateNumber: true, ownership: true } },
  booking: {
    select: {
      code: true,
      contactName: true,
      contactPhone: true,
      customer: { select: { name: true } },
      // Người liên hệ trong chuyến (HDV / trưởng đoàn) và danh sách khách (không gửi số giấy tờ tùy thân)
      leaderRole: true,
      leaderName: true,
      leaderPhone: true,
      leaderApp: true,
      leaderAppId: true,
      passengers: { select: { id: true, seq: true, fullName: true, gender: true, birthYear: true, nationality: true, phone: true, note: true, addedByDriverId: true }, orderBy: { seq: 'asc' } },
      // Hợp đồng vận chuyển điện tử: lái xe xuất trình khi kiểm tra (NĐ 158/2024 Điều 7)
      contract: { select: { number: true, token: true } },
      // Bảng đón khách
      signTitle: true,
      // Ngôn ngữ giấy tờ của booking: dòng Chào mừng trên bảng đón
      docLanguage: true,
      signSubtitle: true,
      signFileType: true,
    },
  },
} satisfies Prisma.BookingTripSelect;

@Controller('driver')
@Roles(Role.LAI_XE)
export class DriverAppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly payroll: PayrollService,
    private readonly advances: AdvancesService,
    private readonly odometer: OdometerService,
    private readonly push: PushService,
  ) {}

  private driverId(user: AuthUser) {
    if (!user.driverId) throw new ForbiddenException('Tài khoản chưa được liên kết với hồ sơ lái xe. Liên hệ văn phòng.');
    return user.driverId;
  }

  /** scope=active: chuyến đang/ sắp chạy; scope=history: chuyến đã xong 30 ngày gần đây */
  @Get('trips')
  trips(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    const driverId = this.driverId(user);
    const history = scope === 'history';
    return this.prisma.bookingTrip.findMany({
      where: {
        driverId,
        booking: { status: { in: [BookingStatus.XAC_NHAN, BookingStatus.HOAN_THANH] } },
        ...(history
          ? { status: TripStatus.HOAN_THANH, pickupTime: { gte: new Date(Date.now() - 30 * 86_400_000) } }
          : { status: { in: ACTIVE } }),
      },
      select: driverTripSelect,
      orderBy: { pickupTime: history ? 'desc' : 'asc' },
    });
  }

  @Get('trips/:id')
  async trip(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    const trip = await this.prisma.bookingTrip.findFirst({ where: { id, driverId: this.driverId(user) }, select: driverTripSelect });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến, có thể chuyến đã được giao cho xe khác');
    // Xe công ty: km bắt đầu tự lấy từ km kết thúc chuyến trước của xe
    const companyCar = trip.vehicle?.ownership === 'CONG_TY';
    return {
      ...trip,
      // Giấy tờ chuyến: lệnh vận chuyển điện tử (chuyến xe ghép: lệnh của cả chuyến ghép)
      orderPath: trip.shuttleRunId ? orderPath('run', trip.shuttleRunId) : orderPath('trip', trip.id),
      trackKm: companyCar,
      suggestStartKm: companyCar && trip.startKm === null ? await this.odometer.previousEndKm({ id: trip.id, vehicleId: trip.vehicleId, pickupTime: trip.pickupTime }) : null,
      // Kiểm tra xe và lái xe trước chuyến (xe công ty)
      preCheckRequired: companyCar && (await preCheckRequired(this.prisma)),
      preCheck: companyCar ? await lastPreCheck(this.prisma, trip.id) : null,
    };
  }

  @Post('trips/:id/status')
  @HttpCode(200)
  async status(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: DriverStatusDto) {
    const trip = await this.prisma.bookingTrip.findFirst({ where: { id, driverId: this.driverId(user) } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến, có thể chuyến đã được giao cho xe khác');
    if (NEXT[trip.status] !== dto.status) throw new BadRequestException('Trạng thái chuyến đã thay đổi, vui lòng tải lại');

    // Xe công ty: ghi km đồng hồ lúc bắt đầu đi đón và lúc hoàn thành
    const vehicle = trip.vehicleId ? await this.prisma.vehicle.findUnique({ where: { id: trip.vehicleId }, select: { ownership: true } }) : null;
    // Xe công ty: phải kiểm tra xe và lái xe trước chuyến (đạt) mới được bắt đầu chuyến
    const pre = vehicle?.ownership === 'CONG_TY' && dto.status === TripStatus.DANG_DEN_DON ? await assertPreCheck(this.prisma, id) : null;
    if (vehicle?.ownership === 'CONG_TY') {
      if (dto.status === TripStatus.DANG_DEN_DON && trip.startKm === null) {
        // Km bắt đầu: lái xe nhập > km lúc kiểm tra trước chuyến > km kết thúc chuyến trước của xe
        const startKm = dto.startKm ?? pre?.odometerKm ?? (await this.odometer.previousEndKm(trip));
        if (startKm === null) throw new BadRequestException('Nhập số km trên đồng hồ xe lúc bắt đầu chuyến');
        await this.odometer.record(id, { startKm });
      }
      if (dto.status === TripStatus.HOAN_THANH) {
        if (dto.endKm === undefined) throw new BadRequestException('Nhập số km trên đồng hồ xe lúc kết thúc chuyến');
        await this.odometer.record(id, { endKm: dto.endKm, ...(trip.startKm === null && dto.startKm !== undefined && { startKm: dto.startKm }) });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bookingTrip.update({ where: { id }, data: { status: dto.status } });
      await tx.tripEvent.create({ data: { tripId: id, status: dto.status, note: 'Lái xe cập nhật trên app', userId: user.id } });
      if (dto.status === TripStatus.HOAN_THANH) {
        const open = await tx.bookingTrip.count({ where: { bookingId: trip.bookingId, status: { notIn: [TripStatus.HOAN_THANH, TripStatus.HUY] } } });
        if (open === 0) {
          await tx.booking.updateMany({ where: { id: trip.bookingId, status: BookingStatus.XAC_NHAN }, data: { status: BookingStatus.HOAN_THANH } });
        }
      }
    });
    return this.trip(user, id);
  }

  /** Lái xe sửa km kết thúc (trong 7 ngày); km bắt đầu chỉ nhập được khi xe chưa có km chuyến trước */
  @Post('trips/:id/odometer')
  @HttpCode(200)
  async odometerFix(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: OdometerDto) {
    const trip = await this.prisma.bookingTrip.findFirst({ where: { id, driverId: this.driverId(user) } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến');
    if (trip.status !== TripStatus.HOAN_THANH) throw new BadRequestException('Chỉ sửa km của chuyến đã hoàn thành');
    if (Date.now() - trip.pickupTime.getTime() > 7 * 86_400_000) throw new BadRequestException('Chuyến đã quá 7 ngày, liên hệ văn phòng để sửa km');
    await this.odometer.record(id, { endKm: dto.endKm, ...(trip.startKm === null && dto.startKm !== undefined && { startKm: dto.startKm }) });
    return this.trip(user, id);
  }

  /** Lái xe từ chối chuyến vừa được gán: chuyến quay về chờ điều xe */
  @Post('trips/:id/reject')
  @HttpCode(200)
  async reject(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RejectDto) {
    const trip = await this.prisma.bookingTrip.findFirst({ where: { id, driverId: this.driverId(user) }, include: { booking: { select: { id: true, code: true } } } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến');
    if (trip.status !== TripStatus.DA_GAN) throw new BadRequestException('Chỉ từ chối được chuyến chưa nhận');
    await this.prisma.$transaction([
      this.prisma.bookingTrip.update({
        where: { id },
        data: { status: TripStatus.CHO_DIEU, vehicleId: null, driverId: null, assignedAt: null, assignedById: null },
      }),
      this.prisma.tripEvent.create({ data: { tripId: id, status: TripStatus.CHO_DIEU, note: `Lái xe từ chối: ${dto.reason.trim()}`, userId: user.id } }),
    ]);
    await this.push.notifyRoles([Role.ADMIN, Role.DIEU_HANH], {
      type: 'TRIP_REJECTED',
      title: `Lái xe từ chối chuyến · ${trip.booking.code}`,
      body: `${user.fullName}: ${dto.reason.trim()} · chuyến ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hour12: false }).format(trip.pickupTime).replace(',', '')} cần điều lại`,
      link: `/bookings/${trip.booking.id}`,
      tripId: id,
    });
    return { message: 'Đã từ chối chuyến, văn phòng sẽ điều xe khác' };
  }

  /** Bảng đón khách gửi của booking có chuyến này, dạng ảnh (PDF tự chuyển trang đầu thành ảnh) */
  @Get('trips/:id/sign-file')
  async signFile(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const trip = await this.prisma.bookingTrip.findFirst({
      where: { id, driverId: this.driverId(user) },
      select: { booking: { select: { signFile: true, signFileType: true } } },
    });
    const b = trip?.booking;
    if (!b?.signFile || !existsSync(`${SIGN_DIR}/${b.signFile}`)) throw new NotFoundException('Booking chưa có file bảng đón');
    // Điện thoại chỉ hiện ảnh: file PDF được chuyển trang đầu thành ảnh
    const img = await signImage(b.signFile, b.signFileType);
    res.setHeader('Content-Type', img.type);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(img.file, { root: SIGN_DIR });
  }

  // ───── Chi phí chuyến do lái xe nhập ─────

  /** Loại chi phí lái xe được chọn trên app (không có lương, tạm ứng…), kể cả khi tài khoản có thêm vai trò văn phòng */
  @Get('cost-categories')
  costCategories() {
    return this.prisma.costCategory.findMany({
      where: { isActive: true, driverVisible: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { code: true, name: true, isActive: true },
    });
  }

  private async ownTrip(user: AuthUser, id: number) {
    const trip = await this.prisma.bookingTrip.findFirst({ where: { id, driverId: this.driverId(user) } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến');
    return trip;
  }

  @Get('trips/:id/costs')
  async costs(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.ownTrip(user, id);
    return this.finance.tripCosts(id);
  }

  @Post('trips/:id/costs')
  async addCost(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateTripCostDto) {
    const trip = await this.ownTrip(user, id);
    if (trip.status === TripStatus.DA_GAN) throw new BadRequestException('Hãy nhận chuyến trước khi nhập chi phí');
    return this.finance.addTripCost(id, dto, user, true);
  }

  /** Lái xe chỉ xóa được chi phí do chính mình nhập */
  @Post('trip-costs/:id/delete')
  @HttpCode(200)
  async removeCost(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    const cost = await this.prisma.tripCost.findUnique({ where: { id }, include: { trip: true } });
    if (!cost || cost.trip.driverId !== this.driverId(user) || cost.createdById !== user.id) throw new NotFoundException('Không tìm thấy chi phí');
    await this.prisma.tripCost.delete({ where: { id } });
    removeReceipt(cost.receiptFile);
    return this.finance.tripCosts(cost.tripId);
  }

  /** Ảnh hóa đơn / vé cho khoản chi phí lái xe vừa nhập (chụp hoặc chọn từ máy) */
  @Post('trip-costs/:id/receipt')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', receiptUpload))
  async uploadReceipt(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Chưa chọn ảnh');
    const cost = await this.prisma.tripCost.findUnique({ where: { id }, include: { trip: true } });
    if (!cost || cost.trip.driverId !== this.driverId(user) || cost.createdById !== user.id) {
      removeReceipt(file.filename);
      throw new NotFoundException('Không tìm thấy chi phí');
    }
    await this.prisma.tripCost.update({ where: { id }, data: { receiptFile: file.filename, receiptType: file.mimetype } });
    removeReceipt(cost.receiptFile);
    return this.finance.tripCosts(cost.tripId);
  }

  @Get('trip-costs/:id/receipt')
  async receipt(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const cost = await this.prisma.tripCost.findUnique({ where: { id }, include: { trip: true } });
    if (!cost || cost.trip.driverId !== this.driverId(user)) throw new NotFoundException('Không tìm thấy chi phí');
    sendReceipt(res, cost);
  }

  // ───── Thu tiền khách giúp công ty ─────

  /** Lái xe xác nhận đã thu tiền khách: tự tạo phiếu thu cho booking (văn phòng nhận lại tiền sau) */
  @Post('trips/:id/collect')
  @HttpCode(200)
  async collect(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CollectDto) {
    const trip = await this.prisma.bookingTrip.findFirst({
      where: { id, driverId: this.driverId(user) },
      include: { driver: { select: { fullName: true } }, booking: { select: { id: true, code: true, salesUserId: true, createdById: true } } },
    });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến');
    if (!trip.collectAmount) throw new BadRequestException('Chuyến này văn phòng không nhờ thu tiền');
    if (trip.collectedAt) throw new BadRequestException('Chuyến này đã xác nhận thu tiền rồi');
    if (trip.status === TripStatus.DA_GAN || trip.status === TripStatus.HUY) throw new BadRequestException('Hãy nhận chuyến trước khi xác nhận thu tiền');
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          bookingId: trip.bookingId,
          amount: dto.amount,
          method: dto.method,
          paidAt: new Date(`${vnDate(new Date())}T00:00:00Z`),
          note: `Lái xe ${trip.driver?.fullName ?? ''} thu hộ – chuyến ${trip.seq}`,
          createdById: user.id,
        },
      });
      await tx.bookingTrip.update({
        where: { id },
        data: { collectedAt: new Date(), collectedAmount: dto.amount, collectMethod: dto.method, collectPaymentId: payment.id },
      });
      await tx.tripEvent.create({ data: { tripId: id, status: trip.status, note: `Lái xe đã thu tiền khách: ${dto.amount.toLocaleString('vi-VN')} đ`, userId: user.id } });
    });
    await this.push.notifyRoles(
      [Role.ADMIN, Role.KE_TOAN],
      {
        type: 'COLLECTED',
        title: `Lái xe đã thu tiền · ${trip.booking.code}`,
        body: `${trip.driver?.fullName ?? user.fullName} thu ${dto.amount.toLocaleString('vi-VN')}đ (${dto.method === PaymentMethod.CHUYEN_KHOAN ? 'chuyển khoản' : 'tiền mặt'})${dto.amount !== Number(trip.collectAmount) ? ` · văn phòng nhờ thu ${Number(trip.collectAmount).toLocaleString('vi-VN')}đ` : ''}`,
        link: `/bookings/${trip.booking.id}`,
        tripId: id,
      },
      { extra: [trip.booking.salesUserId, trip.booking.createdById], exclude: user.id },
    );
    return this.trip(user, id);
  }

  // ───── Thu nhập (lương + doanh số) ─────

  /** Thu nhập của lái xe trong tháng: lương cứng, tổng hoa hồng, hoàn ứng + tiền thu hộ chưa nộp (không lộ giá chuyến / doanh số) */
  @Get('earnings')
  async earnings(@CurrentUser() user: AuthUser, @Query('month') monthQ?: string) {
    const driverId = this.driverId(user);
    const today = vnDate(new Date());
    const month = monthQ && MONTH_RE.test(monthQ) ? monthQ : today.slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const res = await this.payroll.compute(`${month}-01`, `${month}-${String(last).padStart(2, '0')}`, driverId);
    const row = res.drivers[0];
    const holding = await this.prisma.bookingTrip.findMany({
      where: { driverId, collectedAt: { not: null }, collectSettledAt: null },
      select: { id: true, collectedAmount: true, collectedAt: true, collectMethod: true, pickupTime: true, booking: { select: { code: true } } },
      orderBy: { collectedAt: 'asc' },
    });
    const holdingCash = holding.filter((h) => h.collectMethod === PaymentMethod.TIEN_MAT);
    return {
      month,
      partner: !row,
      ...(row && {
        hasRate: !row.missingRate,
        baseSalary: row.baseSalary,
        // Lái xe chỉ biết lương và tổng hoa hồng: không gửi doanh số, % hoa hồng, giá / hoa hồng từng chuyến
        commissionPercent: null,
        baseAmount: row.baseAmount,
        trips: row.trips,
        revenue: null,
        commission: row.commission,
        total: row.total,
        reimbursement: row.reimbursement,
        advanceTaken: row.advanceTaken,
        loans: row.loans,
        netPay: row.netPay,
        pendingTrips: row.pendingTrips.map((t) => ({ id: t.id, pickupTime: t.pickupTime, status: t.status, booking: { code: t.booking.code } })),
        advances: row.advances.map((a) => ({ category: a.category, amount: a.amount, date: a.spentAt, note: a.note, bookingCode: a.booking?.code ?? null })),
      }),
      // Tiền mặt thu hộ khách, lái xe đang giữ, chưa nộp lại văn phòng
      holding: holdingCash.map((h) => ({ tripId: h.id, amount: Number(h.collectedAmount), collectedAt: h.collectedAt, pickupTime: h.pickupTime, bookingCode: h.booking.code })),
      holdingTotal: holdingCash.reduce((s, h) => s + Number(h.collectedAmount), 0),
    };
  }

  // ───── Đề nghị tạm ứng ─────

  @Get('advances')
  myAdvances(@CurrentUser() user: AuthUser) {
    return this.advances.listMine(this.driverId(user));
  }

  @Post('advances')
  createAdvance(@CurrentUser() user: AuthUser, @Body() dto: AdvanceDto) {
    return this.advances.create(this.driverId(user), dto.amount, dto.reason);
  }

  @Post('advances/:id/cancel')
  @HttpCode(200)
  cancelAdvance(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.advances.cancel(this.driverId(user), id);
  }

  // ───── Xăng dầu (phiếu chi riêng, không gắn chuyến) ─────

  /** Nhật ký đổ xăng của lái xe trong tháng + danh sách xe chọn được */
  @Get('fuel')
  async fuel(@CurrentUser() user: AuthUser, @Query('month') monthQ?: string) {
    const driverId = this.driverId(user);
    const month = monthQ && MONTH_RE.test(monthQ) ? monthQ : vnDate(new Date()).slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const [items, vehicles, me] = await Promise.all([
      this.prisma.cashVoucher.findMany({
        where: { driverId, advanceRequest: { is: null }, date: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) } },
        select: { id: true, code: true, date: true, amount: true, liters: true, odometerKm: true, driverPaid: true, note: true, receiptFile: true, vehicle: { select: { id: true, plateNumber: true } } },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.vehicle.findMany({ where: { ownership: 'CONG_TY', status: { not: 'NGUNG_HOAT_DONG' } }, select: { id: true, plateNumber: true }, orderBy: { plateNumber: 'asc' } }),
      this.prisma.driver.findUnique({ where: { id: driverId }, select: { defaultVehicles: { select: { id: true } } } }),
    ]);
    // Xe được phân công: xe mặc định của lái xe + xe của các chuyến đang chạy / hôm qua – ngày mai
    const now = Date.now();
    const recent = await this.prisma.bookingTrip.findMany({
      where: {
        driverId,
        vehicleId: { not: null },
        vehicle: { ownership: 'CONG_TY' },
        OR: [{ status: { in: ACTIVE } }, { pickupTime: { gte: new Date(now - 36 * 3600_000), lte: new Date(now + 36 * 3600_000) } }],
        status: { not: TripStatus.HUY },
      },
      select: { vehicleId: true, status: true, pickupTime: true },
    });
    // Ưu tiên: xe của chuyến đang chạy → chuyến gần giờ hiện tại nhất → xe mặc định
    const running = recent.find((t) => t.status === TripStatus.DANG_DEN_DON || t.status === TripStatus.DA_DON_KHACH);
    const nearest = [...recent].sort((a, b) => Math.abs(a.pickupTime.getTime() - now) - Math.abs(b.pickupTime.getTime() - now))[0];
    const assignedIds = [...new Set([running?.vehicleId, nearest?.vehicleId, ...(me?.defaultVehicles.map((v) => v.id) ?? []), ...recent.map((t) => t.vehicleId)].filter((x): x is number => !!x))];
    const assigned = assignedIds.map((id) => vehicles.find((v) => v.id === id)).filter((v): v is (typeof vehicles)[number] => !!v);
    return {
      month,
      items: items.map((v) => ({ ...v, amount: Number(v.amount), liters: v.liters === null ? null : Number(v.liters), hasReceipt: !!v.receiptFile, receiptFile: undefined })),
      // Có xe được phân công thì chỉ cho chọn các xe đó; chưa có thì chọn trong toàn bộ xe công ty
      vehicles: assigned.length ? assigned : vehicles,
      assigned: assigned.length > 0,
      defaultVehicleId: assigned[0]?.id ?? null,
    };
  }

  @Post('fuel')
  async addFuel(@CurrentUser() user: AuthUser, @Body() dto: FuelDto) {
    const driverId = this.driverId(user);
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle || vehicle.ownership !== 'CONG_TY') throw new BadRequestException('Chỉ ghi xăng cho xe của công ty');
    const v = await this.finance.createVoucher(
      {
        type: VoucherType.CHI,
        date: dto.date,
        amount: dto.amount,
        categoryCode: (await this.prisma.costCategory.findUnique({ where: { code: 'XANG_DAU' } })) ? 'XANG_DAU' : null,
        title: 'Xăng dầu',
        vehicleId: dto.vehicleId,
        counterparty: user.fullName,
        method: dto.driverPaid ? PaymentMethod.TIEN_MAT : PaymentMethod.KHAC,
        note: dto.note?.trim() || null,
      },
      user,
      { driverId, liters: dto.liters ?? null, odometerKm: dto.odometerKm ?? null, driverPaid: !!dto.driverPaid },
    );
    return { id: v.id, code: v.code };
  }

  private async ownFuel(user: AuthUser, id: number) {
    const v = await this.prisma.cashVoucher.findUnique({ where: { id }, include: { advanceRequest: { select: { id: true } } } });
    if (!v || v.driverId !== this.driverId(user) || v.advanceRequest) throw new NotFoundException('Không tìm thấy phiếu xăng');
    return v;
  }

  /** Lái xe chỉ xóa phiếu xăng do mình nhập, trong vòng 3 ngày */
  @Post('fuel/:id/delete')
  @HttpCode(200)
  async removeFuel(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    const v = await this.ownFuel(user, id);
    if (v.createdById !== user.id) throw new BadRequestException('Phiếu này do văn phòng nhập, không xóa được');
    if (Date.now() - v.createdAt.getTime() > 3 * 86_400_000) throw new BadRequestException('Phiếu đã quá 3 ngày, liên hệ văn phòng để sửa');
    await this.prisma.cashVoucher.delete({ where: { id } });
    removeReceipt(v.receiptFile);
    return { ok: true };
  }

  @Post('fuel/:id/receipt')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', receiptUpload))
  async fuelReceipt(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Chưa chọn ảnh');
    let v;
    try {
      v = await this.ownFuel(user, id);
    } catch (e) {
      removeReceipt(file.filename);
      throw e;
    }
    await this.prisma.cashVoucher.update({ where: { id }, data: { receiptFile: file.filename, receiptType: file.mimetype } });
    removeReceipt(v.receiptFile);
    return { ok: true };
  }

  @Get('fuel/:id/receipt')
  async fuelReceiptFile(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    sendReceipt(res, await this.ownFuel(user, id));
  }

  @Post('push-token')
  @HttpCode(200)
  async pushToken(@CurrentUser() user: AuthUser, @Body() dto: PushTokenDto) {
    await this.prisma.user.update({ where: { id: user.id }, data: { pushToken: dto.token || null } });
    return { ok: true };
  }
}
