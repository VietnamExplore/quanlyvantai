import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { existsSync } from 'fs';
import { SIGN_DIR, signImage } from '../bookings/sign-file.controller';
import { BookingStatus, Prisma, Role, TripStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, IsNumber, Min } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { partnerPayable } from '../finance/cost.util';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

/** Bước kế tiếp hợp lệ nhà xe được bấm (giống app lái xe) */
const NEXT: Partial<Record<TripStatus, TripStatus>> = {
  TAI_XE_NHAN: TripStatus.DANG_DEN_DON,
  DANG_DEN_DON: TripStatus.DA_DON_KHACH,
  DA_DON_KHACH: TripStatus.HOAN_THANH,
};
const ACTIVE: TripStatus[] = [TripStatus.DA_GAN, TripStatus.TAI_XE_NHAN, TripStatus.DANG_DEN_DON, TripStatus.DA_DON_KHACH];
/** Booking tính công nợ nhà xe (giống trang Công nợ nhà xe của văn phòng) */
const BILLABLE: BookingStatus[] = [BookingStatus.XAC_NHAN, BookingStatus.HOAN_THANH];

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

class RejectDto {
  @IsString() @IsNotEmpty({ message: 'Vui lòng nhập lý do từ chối' }) reason: string;
}

class VehicleDto {
  @trim() @IsOptional() @IsString() @MaxLength(20) partnerPlate?: string;
  @trim() @IsOptional() @IsString() @MaxLength(100) partnerDriverName?: string;
  @trim() @IsOptional() @IsString() @MaxLength(30) partnerDriverPhone?: string;
}

class StatusDto {
  @IsIn(Object.values(NEXT)) status: TripStatus;

  /** Khi hoàn thành: giá phát sinh tăng / giảm (trước thuế) và lý do */
  @IsOptional() @IsNumber({}, { message: 'Số tiền phát sinh không hợp lệ' }) @Min(0) extraUp?: number;
  @IsOptional() @IsNumber({}, { message: 'Số tiền phát sinh không hợp lệ' }) @Min(0) extraDown?: number;
  @IsOptional() @IsString() extraNote?: string;
}

/** Thông tin chuyến nhà xe được xem: không có giá bán cho khách, tài chính công ty, giấy tờ tùy thân khách */
const tripSelect = {
  id: true,
  seq: true,
  status: true,
  serviceType: true,
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
  partnerPlate: true,
  partnerDriverName: true,
  partnerDriverPhone: true,
  partnerCost: true,
  partnerInvoice: true,
  partnerInvoiceNote: true,
  partnerVatPercent: true,
  partnerAdjustNote: true,
  partnerExtraUp: true,
  partnerExtraDown: true,
  partnerExtraNote: true,
  partnerExtraStatus: true,
  partnerExtraReviewNote: true,
  assignedAt: true,
  vehicleType: { select: { name: true, seats: true } },
  service: { select: { name: true } },
  booking: {
    select: {
      code: true,
      status: true,
      leaderRole: true,
      leaderName: true,
      leaderPhone: true,
      leaderApp: true,
      // Hợp đồng vận chuyển điện tử: lái xe xuất trình khi kiểm tra (NĐ 158/2024 Điều 7)
      contract: { select: { number: true, token: true } },
      leaderAppId: true,
      signTitle: true,
      // Ngôn ngữ giấy tờ của booking: dòng Chào mừng trên bảng đón
      docLanguage: true,
      signSubtitle: true,
      signFileType: true,
      // Đoàn khách: chỉ họ tên, quốc tịch (không SĐT, giấy tờ của từng khách)
      passengers: { select: { seq: true, fullName: true, gender: true, nationality: true }, orderBy: { seq: 'asc' } },
      // Tên trên bảng đón khi chưa nhập dòng chính: tên khách hàng / người liên hệ
      customer: { select: { name: true } },
      contactName: true,
    },
  },
} satisfies Prisma.BookingTripSelect;

type RawTrip = Prisma.BookingTripGetPayload<{ select: typeof tripSelect }>;

/**
 * Bỏ thông tin khách hàng (công ty / đại lý / người đặt) trước khi gửi cho nhà xe.
 * Bảng đón chưa nhập dòng chính: dùng tên trưởng đoàn / HDV, không thì tên khách đầu tiên (không dùng tên khách hàng / đại lý).
 */
function clean(t: RawTrip) {
  const { customer: _c, contactName: _n, ...booking } = t.booking;
  return { ...t, booking: { ...booking, signTitle: booking.signTitle || booking.leaderName || booking.passengers[0]?.fullName || null } };
}

const fmt = (d: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.hour}:${p.minute} ${p.day}/${p.month}`;
};

/** Cổng nhà xe đối tác: xem / nhận / từ chối chuyến được giao, nhập xe & tài xế, cập nhật trạng thái, xem công nợ */
@Controller('partner')
@Roles(Role.NHA_XE)
export class PartnerPortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  private partnerId(user: AuthUser) {
    if (!user.partnerId) throw new ForbiddenException('Tài khoản chưa được liên kết với nhà xe đối tác. Liên hệ văn phòng.');
    return user.partnerId;
  }

  private async own(user: AuthUser, id: number) {
    const trip = await this.prisma.bookingTrip.findFirst({ where: { id, partnerId: this.partnerId(user) }, include: { booking: { select: { id: true, code: true } } } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến, có thể chuyến đã được chuyển cho nhà xe khác');
    return trip;
  }

  /** Báo Điều hành khi nhà xe thao tác trên chuyến */
  private notifyOffice(type: string, title: string, body: string, trip: { id: number; booking: { id: number } }) {
    return this.push.notifyRoles([Role.ADMIN, Role.DIEU_HANH], { type, title, body, link: `/bookings/${trip.booking.id}`, tripId: trip.id });
  }

  /** Thông tin công ty để nhà xe xuất hóa đơn (tên, MST, địa chỉ, email nhận hóa đơn) */
  @Get('invoice-info')
  async invoiceInfo(@CurrentUser() user: AuthUser) {
    this.partnerId(user);
    const rows = await this.prisma.setting.findMany({ where: { key: { in: ['companyName', 'companyTaxCode', 'companyAddress', 'companyEmail', 'companyPhone', 'invoiceEmail'] } } });
    const get = (k: string) => rows.find((r) => r.key === k)?.value?.trim() || null;
    return {
      companyName: get('companyName'),
      taxCode: get('companyTaxCode'),
      address: get('companyAddress'),
      email: get('invoiceEmail') ?? get('companyEmail'),
      phone: get('companyPhone'),
    };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.prisma.partner.findUniqueOrThrow({ where: { id: this.partnerId(user) }, select: { id: true, name: true, phone: true, bankName: true, bankAccount: true } });
  }

  /** scope=new: chờ nhận; active: đã nhận, đang chạy; history: đã xong / hủy 60 ngày gần đây */
  @Get('trips')
  async trips(@CurrentUser() user: AuthUser, @Query('scope') scope = 'active') {
    const partnerId = this.partnerId(user);
    const where: Prisma.BookingTripWhereInput =
      scope === 'history'
        ? { partnerId, status: { in: [TripStatus.HOAN_THANH, TripStatus.HUY] }, pickupTime: { gte: new Date(Date.now() - 60 * 86_400_000) } }
        : scope === 'new'
          ? { partnerId, status: TripStatus.DA_GAN }
          : { partnerId, status: { in: ACTIVE.filter((s) => s !== TripStatus.DA_GAN) } };
    const [items, counts] = await Promise.all([
      this.prisma.bookingTrip.findMany({ where, select: tripSelect, orderBy: { pickupTime: scope === 'history' ? 'desc' : 'asc' }, take: 300 }),
      this.prisma.bookingTrip.groupBy({ by: ['status'], where: { partnerId, status: { in: ACTIVE } }, _count: true }),
    ]);
    const n = (s: TripStatus) => counts.find((c) => c.status === s)?._count ?? 0;
    return { items: items.map(clean), counts: { new: n(TripStatus.DA_GAN), active: ACTIVE.filter((s) => s !== TripStatus.DA_GAN).reduce((t, s) => t + n(s), 0) } };
  }

  /** Ảnh bảng đón khách gửi (PDF tự chuyển trang đầu thành ảnh) */
  @Get('trips/:id/sign-file')
  async signFile(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const trip = await this.prisma.bookingTrip.findFirst({ where: { id, partnerId: this.partnerId(user) }, select: { booking: { select: { signFile: true, signFileType: true } } } });
    const b = trip?.booking;
    if (!b?.signFile || !existsSync(`${SIGN_DIR}/${b.signFile}`)) throw new NotFoundException('Booking chưa có file bảng đón');
    const img = await signImage(b.signFile, b.signFileType);
    res.setHeader('Content-Type', img.type);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(img.file, { root: SIGN_DIR });
  }

  @Get('trips/:id')
  async trip(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    const trip = await this.prisma.bookingTrip.findFirst({ where: { id, partnerId: this.partnerId(user) }, select: tripSelect });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến');
    return clean(trip);
  }

  /** Nhận chuyến (có thể nhập luôn xe & tài xế) */
  @Post('trips/:id/accept')
  @HttpCode(200)
  async accept(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: VehicleDto) {
    const trip = await this.own(user, id);
    if (trip.status !== TripStatus.DA_GAN) throw new BadRequestException('Chuyến không ở trạng thái chờ nhận');
    await this.prisma.$transaction([
      this.prisma.bookingTrip.update({ where: { id }, data: { status: TripStatus.TAI_XE_NHAN, ...this.vehicleData(dto) } }),
      this.prisma.tripEvent.create({ data: { tripId: id, status: TripStatus.TAI_XE_NHAN, note: `Nhà xe nhận chuyến (${user.fullName})`, userId: user.id } }),
    ]);
    await this.notifyOffice('PARTNER_ACCEPTED', `Nhà xe đã nhận chuyến · ${trip.booking.code}`, `${await this.partnerName(trip.partnerId)} · chuyến ${fmt(trip.pickupTime)}`, trip);
    return this.trip(user, id);
  }

  @Post('trips/:id/reject')
  @HttpCode(200)
  async reject(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RejectDto) {
    const trip = await this.own(user, id);
    if (trip.status !== TripStatus.DA_GAN) throw new BadRequestException('Chỉ từ chối được chuyến chưa nhận. Chuyến đã nhận thì liên hệ văn phòng.');
    const name = await this.partnerName(trip.partnerId);
    await this.prisma.$transaction([
      this.prisma.bookingTrip.update({
        where: { id },
        data: { status: TripStatus.CHO_DIEU, partnerId: null, partnerPlate: null, partnerDriverName: null, partnerDriverPhone: null, partnerCost: null, estimatedCost: null, assignedAt: null, assignedById: null },
      }),
      this.prisma.tripEvent.create({ data: { tripId: id, status: TripStatus.CHO_DIEU, note: `Nhà xe ${name} từ chối: ${dto.reason.trim()}`, userId: user.id } }),
    ]);
    await this.notifyOffice('PARTNER_REJECTED', `Nhà xe từ chối chuyến · ${trip.booking.code}`, `${name}: ${dto.reason.trim()} · chuyến ${fmt(trip.pickupTime)} cần điều lại`, trip);
    return { message: 'Đã từ chối chuyến, văn phòng sẽ điều xe khác' };
  }

  private vehicleData(dto: VehicleDto) {
    return {
      ...(dto.partnerPlate !== undefined && { partnerPlate: dto.partnerPlate ? dto.partnerPlate.toUpperCase() : null }),
      ...(dto.partnerDriverName !== undefined && { partnerDriverName: dto.partnerDriverName || null }),
      ...(dto.partnerDriverPhone !== undefined && { partnerDriverPhone: dto.partnerDriverPhone || null }),
    };
  }

  private async partnerName(id: number | null) {
    return id ? ((await this.prisma.partner.findUnique({ where: { id }, select: { name: true } }))?.name ?? '') : '';
  }

  /** Nhập / đổi biển số xe, tài xế */
  @Post('trips/:id/vehicle')
  @HttpCode(200)
  async vehicle(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: VehicleDto) {
    const trip = await this.own(user, id);
    if (trip.status === TripStatus.HOAN_THANH || trip.status === TripStatus.HUY) throw new BadRequestException('Chuyến đã kết thúc');
    const data = this.vehicleData(dto);
    await this.prisma.bookingTrip.update({ where: { id }, data });
    const after = await this.prisma.bookingTrip.findUniqueOrThrow({ where: { id } });
    const changed =
      after.partnerPlate !== trip.partnerPlate || after.partnerDriverName !== trip.partnerDriverName || after.partnerDriverPhone !== trip.partnerDriverPhone;
    if (changed) {
      await this.prisma.tripEvent.create({
        data: { tripId: id, status: trip.status, note: `Nhà xe cập nhật xe / tài xế: ${[after.partnerPlate, after.partnerDriverName, after.partnerDriverPhone].filter(Boolean).join(' · ')}`, userId: user.id },
      });
      await this.notifyOffice(
        'PARTNER_VEHICLE',
        `Nhà xe cập nhật xe / tài xế · ${trip.booking.code}`,
        `${[after.partnerPlate, after.partnerDriverName, after.partnerDriverPhone].filter(Boolean).join(' · ') || 'đã xóa thông tin'} · chuyến ${fmt(trip.pickupTime)}`,
        trip,
      );
    }
    return this.trip(user, id);
  }

  @Post('trips/:id/status')
  @HttpCode(200)
  async status(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: StatusDto) {
    const trip = await this.own(user, id);
    if (NEXT[trip.status] !== dto.status) throw new BadRequestException('Trạng thái chuyến đã thay đổi, vui lòng tải lại');
    if (dto.status === TripStatus.DANG_DEN_DON && (!trip.partnerPlate || !trip.partnerDriverName)) {
      throw new BadRequestException('Nhập biển số xe và tên tài xế trước khi bắt đầu chuyến');
    }
    const up = dto.status === TripStatus.HOAN_THANH ? Math.round(dto.extraUp ?? 0) : 0;
    const down = dto.status === TripStatus.HOAN_THANH ? Math.round(dto.extraDown ?? 0) : 0;
    const extraNote = dto.extraNote?.trim() || null;
    if ((up || down) && !extraNote) throw new BadRequestException('Nhập lý do phát sinh');
    if (down > Number(trip.partnerCost ?? 0) + up) throw new BadRequestException('Phát sinh giảm lớn hơn giá thuê');
    await this.prisma.$transaction(async (tx) => {
      await tx.bookingTrip.update({
        where: { id },
        data: { status: dto.status, ...(dto.status === TripStatus.HOAN_THANH && { partnerExtraUp: up, partnerExtraDown: down, partnerExtraNote: up || down ? extraNote : null, partnerExtraStatus: up || down ? 'CHO_DUYET' : null, partnerExtraReviewNote: null, partnerExtraReviewedBy: null, partnerExtraReviewedAt: null }) },
      });
      const extraText = up || down ? ` · phát sinh${up ? ` +${up.toLocaleString('vi-VN')}đ` : ''}${down ? ` −${down.toLocaleString('vi-VN')}đ` : ''} (${extraNote}) – chờ điều hành duyệt` : '';
      await tx.tripEvent.create({ data: { tripId: id, status: dto.status, note: `Nhà xe cập nhật (${user.fullName})${extraText}`, userId: user.id } });
      if (dto.status === TripStatus.HOAN_THANH) {
        const open = await tx.bookingTrip.count({ where: { bookingId: trip.bookingId, status: { notIn: [TripStatus.HOAN_THANH, TripStatus.HUY] } } });
        if (open === 0) await tx.booking.updateMany({ where: { id: trip.bookingId, status: BookingStatus.XAC_NHAN }, data: { status: BookingStatus.HOAN_THANH } });
      }
    });
    if (dto.status === TripStatus.HOAN_THANH) {
      const ex = [up && `phát sinh tăng ${up.toLocaleString('vi-VN')}đ`, down && `phát sinh giảm ${down.toLocaleString('vi-VN')}đ`].filter(Boolean).join(', ');
      await this.notifyOffice(
        up || down ? 'PARTNER_EXTRA' : 'PARTNER_DONE',
        up || down ? `Phát sinh nhà xe chờ duyệt · ${trip.booking.code}` : `Nhà xe hoàn thành chuyến · ${trip.booking.code}`,
        `${await this.partnerName(trip.partnerId)} · chuyến ${fmt(trip.pickupTime)}${ex ? ` · ${ex} (trước thuế) · ${extraNote} · cần duyệt để tính công nợ` : ''}`,
        trip,
      );
    }
    return this.trip(user, id);
  }

  /** Công nợ: tiền chuyến (giá thuê) – đã thanh toán = còn lại */
  @Get('summary')
  async summary(@CurrentUser() user: AuthUser) {
    const partnerId = this.partnerId(user);
    const [trips, payments] = await Promise.all([
      this.prisma.bookingTrip.findMany({
        where: { partnerId, status: { not: TripStatus.HUY }, booking: { status: { in: BILLABLE } } },
        select: { id: true, pickupTime: true, pickupAddress: true, dropoffAddress: true, partnerPlate: true, partnerCost: true, partnerExtraUp: true, partnerExtraDown: true, partnerExtraNote: true, partnerExtraStatus: true, partnerExtraReviewNote: true, partnerInvoice: true, partnerVatPercent: true, status: true, booking: { select: { code: true } }, vehicleType: { select: { name: true } } },
        orderBy: { pickupTime: 'desc' },
      }),
      this.prisma.partnerPayment.findMany({ where: { partnerId }, orderBy: { paidAt: 'desc' }, select: { id: true, amount: true, paidAt: true, method: true, reference: true, note: true } }),
    ]);
    const rows = trips.map((t) => {
      const x = partnerPayable(t);
      return { ...t, partnerNet: x.net, partnerVat: x.vat, partnerTotal: x.total };
    });
    const totalNet = rows.reduce((s, t) => s + t.partnerNet, 0);
    const totalVat = rows.reduce((s, t) => s + t.partnerVat, 0);
    const totalCost = totalNet + totalVat;
    // Phát sinh đang chờ văn phòng duyệt (chưa tính công nợ)
    const pendingExtra = rows.filter((t) => t.partnerExtraStatus === 'CHO_DUYET').length;
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    return { tripCount: trips.length, pendingExtra, totalNet, totalVat, totalCost, totalPaid, balance: totalCost - totalPaid, trips: rows, payments };
  }
}
