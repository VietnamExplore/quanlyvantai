import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, PaymentMethod, Role, TripStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

const vnYmd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
const vnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;

/** Bước xác nhận: ops = điều hành đã nhận tiền từ lái xe, acct = kế toán đã nhận vào quỹ / tài khoản */
export type CollectStep = 'ops' | 'acct';
const STEP_ROLES: Record<CollectStep, Role[]> = { ops: [Role.ADMIN, Role.DIEU_HANH], acct: [Role.ADMIN, Role.KE_TOAN] };

const SELECT = {
  id: true,
  seq: true,
  status: true,
  pickupTime: true,
  pickupAddress: true,
  collectAmount: true,
  collectNote: true,
  collectedAt: true,
  collectedAmount: true,
  collectMethod: true,
  collectSettledAt: true,
  collectPaymentId: true,
  collectOpsAt: true,
  collectAcctAt: true,
  collectOpsBy: { select: { id: true, fullName: true } },
  collectAcctBy: { select: { id: true, fullName: true } },
  driver: { select: { id: true, fullName: true, phone: true } },
  booking: { select: { id: true, code: true, contactName: true, customer: { select: { name: true } } } },
} as const;

/**
 * Tiền nhờ lái xe thu khách: theo dõi riêng ở bảng nhờ thu; lái xe bấm "đã thu" chưa phải là công ty đã thu.
 * Chỉ khi điều hành xác nhận đã nhận tiền từ lái xe VÀ kế toán xác nhận đã nhận vào quỹ (khách chuyển khoản thẳng cho công ty:
 * chỉ cần kế toán) mới ghi phiếu thu vào booking / sổ thu chi, khoản đó rời bảng nhờ thu.
 */
@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /** Bảng nhờ thu: open = còn theo dõi (chưa thu / lái xe đang giữ / chờ xác nhận); done = đã nộp đủ (lịch sử) */
  async list(q: { state?: 'open' | 'done'; from?: string; to?: string; driverId?: number }) {
    const done = q.state === 'done';
    const rows = await this.prisma.bookingTrip.findMany({
      where: {
        collectAmount: { gt: 0 },
        status: { not: TripStatus.HUY },
        booking: { status: { not: BookingStatus.HUY } },
        collectSettledAt: done ? { not: null } : null,
        ...(q.driverId && { driverId: q.driverId }),
        ...((q.from || q.to) && {
          pickupTime: { ...(q.from && { gte: new Date(`${q.from}T00:00:00+07:00`) }), ...(q.to && { lte: new Date(`${q.to}T23:59:59.999+07:00`) }) },
        }),
      },
      select: SELECT,
      orderBy: done ? { collectSettledAt: 'desc' } : { pickupTime: 'asc' },
      take: done ? 300 : 1000,
    });
    const list = rows.map((r) => ({ ...r, collectAmount: Number(r.collectAmount), collectedAmount: r.collectedAmount === null ? null : Number(r.collectedAmount), stage: this.stage(r) }));
    const sum = (f: (x: (typeof list)[number]) => boolean, v: (x: (typeof list)[number]) => number) => list.filter(f).reduce((s, x) => s + v(x), 0);
    return {
      rows: list,
      totals: {
        notCollected: sum((x) => x.stage === 'CHUA_THU', (x) => x.collectAmount),
        driverHolding: sum((x) => x.stage === 'LAI_XE_GIU', (x) => x.collectedAmount ?? 0),
        waitAcct: sum((x) => x.stage === 'CHO_KE_TOAN', (x) => x.collectedAmount ?? 0),
        settled: sum((x) => x.stage === 'DA_NOP', (x) => x.collectedAmount ?? 0),
      },
    };
  }

  /** Giai đoạn của một khoản nhờ thu */
  private stage(r: { collectedAt: Date | null; collectSettledAt: Date | null; collectOpsAt: Date | null; collectAcctAt: Date | null; collectMethod: PaymentMethod | null }) {
    if (r.collectSettledAt) return 'DA_NOP' as const;
    if (!r.collectedAt) return 'CHUA_THU' as const;
    const opsOk = !!r.collectOpsAt || r.collectMethod === PaymentMethod.CHUYEN_KHOAN;
    if (!opsOk) return 'LAI_XE_GIU' as const;
    return 'CHO_KE_TOAN' as const;
  }

  /** Xác nhận / hủy xác nhận một bước; đủ điều kiện thì ghi phiếu thu */
  async confirm(tripId: number, step: CollectStep, undo: boolean, user: AuthUser) {
    if (!STEP_ROLES[step].some((r) => user.roles.includes(r))) {
      throw new ForbiddenException(step === 'ops' ? 'Chỉ điều hành xác nhận đã nhận tiền từ lái xe' : 'Chỉ kế toán xác nhận đã nhận tiền vào quỹ');
    }
    const trip = await this.prisma.bookingTrip.findUnique({ where: { id: tripId }, select: { ...SELECT, bookingId: true } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến');
    if (!trip.collectedAt) throw new BadRequestException('Lái xe chưa xác nhận đã thu tiền khách');
    if (step === 'ops' && trip.collectMethod === PaymentMethod.CHUYEN_KHOAN && !undo) {
      throw new BadRequestException('Khách chuyển khoản thẳng cho công ty: chỉ cần kế toán xác nhận đã nhận tiền');
    }
    const field = step === 'ops' ? { at: 'collectOpsAt', by: 'collectOpsById' } : { at: 'collectAcctAt', by: 'collectAcctById' };

    if (undo) {
      await this.prisma.$transaction(async (tx) => {
        // Đã ghi phiếu thu: hủy xác nhận thì bỏ phiếu thu, khoản quay lại bảng nhờ thu
        if (trip.collectPaymentId) await tx.payment.delete({ where: { id: trip.collectPaymentId } }).catch(() => undefined);
        await tx.bookingTrip.update({ where: { id: tripId }, data: { [field.at]: null, [field.by]: null, collectSettledAt: null, collectPaymentId: null } });
        await tx.tripEvent.create({ data: { tripId, status: trip.status, note: `Hủy xác nhận ${step === 'ops' ? 'điều hành' : 'kế toán'} nhận tiền thu hộ`, userId: user.id } });
      });
      return this.one(tripId);
    }

    const now = new Date();
    const after = { ...trip, [field.at]: now };
    const opsOk = !!after.collectOpsAt || trip.collectMethod === PaymentMethod.CHUYEN_KHOAN;
    const finalize = opsOk && !!after.collectAcctAt && !trip.collectSettledAt;
    const amount = Number(trip.collectedAmount ?? 0);
    await this.prisma.$transaction(async (tx) => {
      await tx.bookingTrip.update({ where: { id: tripId }, data: { [field.at]: now, [field.by]: user.id } });
      await tx.tripEvent.create({
        data: { tripId, status: trip.status, note: step === 'ops' ? `Điều hành nhận tiền thu hộ từ lái xe: ${vnd(amount)}` : `Kế toán nhận tiền thu hộ vào quỹ: ${vnd(amount)}`, userId: user.id },
      });
      if (finalize && amount > 0) {
        const ops = step === 'ops' ? user.fullName : trip.collectOpsBy?.fullName;
        const acct = step === 'acct' ? user.fullName : trip.collectAcctBy?.fullName;
        const payment = await tx.payment.create({
          data: {
            bookingId: trip.bookingId,
            amount,
            method: trip.collectMethod ?? PaymentMethod.TIEN_MAT,
            paidAt: new Date(`${vnYmd(now)}T00:00:00Z`),
            reference: `Thu hộ chuyến ${trip.seq}`,
            note: [`Lái xe ${trip.driver?.fullName ?? ''} thu hộ, nộp về công ty`, ops && `ĐH: ${ops}`, acct && `KT: ${acct}`].filter(Boolean).join(' · '),
            createdById: user.id,
          },
        });
        await tx.bookingTrip.update({ where: { id: tripId }, data: { collectSettledAt: now, collectPaymentId: payment.id } });
      }
    });
    if (finalize) {
      await this.push.notifyDriver(trip.driver?.id ?? null, 'Công ty đã nhận tiền thu hộ', `${vnd(amount)} · ${trip.booking.code}`, { tripId }, 'COLLECT_SETTLED');
    } else if (step === 'ops') {
      // Điều hành đã nhận: báo kế toán vào quỹ
      await this.push.notifyRoles([Role.KE_TOAN], {
        type: 'COLLECT_WAIT_ACCT',
        title: `Chờ kế toán nhận tiền thu hộ · ${trip.booking.code}`,
        body: `${user.fullName} đã nhận ${vnd(amount)} từ lái xe ${trip.driver?.fullName ?? ''}`,
        link: '/finance/ledger?tab=collect',
      }, { exclude: user.id });
    }
    return this.one(tripId);
  }

  private async one(id: number) {
    const r = await this.prisma.bookingTrip.findUniqueOrThrow({ where: { id }, select: SELECT });
    return { ...r, collectAmount: Number(r.collectAmount), collectedAmount: r.collectedAmount === null ? null : Number(r.collectedAmount), stage: this.stage(r) };
  }
}
