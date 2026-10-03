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
} from '@nestjs/common';
import { BookingStatus, Prisma, Role, TripStatus } from '@prisma/client';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { CreateTripCostDto } from '../finance/finance.dto';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../prisma/prisma.service';

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
}

class RejectDto {
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập lý do' })
  reason: string;
}

class PushTokenDto {
  @IsOptional()
  @IsString()
  token?: string | null;
}

/** Thông tin chuyến cho lái xe: không gồm giá bán, chi phí */
const driverTripSelect = {
  id: true,
  serviceType: true,
  status: true,
  pickupTime: true,
  endTime: true,
  pickupAddress: true,
  dropoffAddress: true,
  flightNumber: true,
  passengers: true,
  days: true,
  itinerary: true,
  notes: true,
  dispatchNote: true,
  vehicleType: { select: { name: true } },
  service: { select: { name: true } },
  vehicle: { select: { plateNumber: true } },
  booking: { select: { code: true, contactName: true, contactPhone: true, customer: { select: { name: true } } } },
} satisfies Prisma.BookingTripSelect;

@Controller('driver')
@Roles(Role.LAI_XE)
export class DriverAppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
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
    return trip;
  }

  @Post('trips/:id/status')
  @HttpCode(200)
  async status(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: DriverStatusDto) {
    const trip = await this.prisma.bookingTrip.findFirst({ where: { id, driverId: this.driverId(user) } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến, có thể chuyến đã được giao cho xe khác');
    if (NEXT[trip.status] !== dto.status) throw new BadRequestException('Trạng thái chuyến đã thay đổi, vui lòng tải lại');

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

  /** Lái xe từ chối chuyến vừa được gán: chuyến quay về chờ điều xe */
  @Post('trips/:id/reject')
  @HttpCode(200)
  async reject(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RejectDto) {
    const trip = await this.prisma.bookingTrip.findFirst({ where: { id, driverId: this.driverId(user) } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến');
    if (trip.status !== TripStatus.DA_GAN) throw new BadRequestException('Chỉ từ chối được chuyến chưa nhận');
    await this.prisma.$transaction([
      this.prisma.bookingTrip.update({
        where: { id },
        data: { status: TripStatus.CHO_DIEU, vehicleId: null, driverId: null, assignedAt: null, assignedById: null },
      }),
      this.prisma.tripEvent.create({ data: { tripId: id, status: TripStatus.CHO_DIEU, note: `Lái xe từ chối: ${dto.reason.trim()}`, userId: user.id } }),
    ]);
    return { message: 'Đã từ chối chuyến, văn phòng sẽ điều xe khác' };
  }

  // ───── Chi phí chuyến do lái xe nhập ─────

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
    return this.finance.tripCosts(cost.tripId);
  }

  @Post('push-token')
  @HttpCode(200)
  async pushToken(@CurrentUser() user: AuthUser, @Body() dto: PushTokenDto) {
    await this.prisma.user.update({ where: { id: user.id }, data: { pushToken: dto.token || null } });
    return { ok: true };
  }
}
