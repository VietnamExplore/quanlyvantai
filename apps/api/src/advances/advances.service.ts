import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdvanceStatus, PaymentMethod, Prisma, Role, VoucherType } from '@prisma/client';
import type { AuthUser } from '../auth/auth.decorators';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { vnDate } from '../reports/payroll.service';

const vnd = (v: number | Prisma.Decimal) => `${Number(v).toLocaleString('vi-VN')}đ`;

export const ADVANCE_SELECT = {
  id: true,
  amount: true,
  reason: true,
  status: true,
  createdAt: true,
  decidedAt: true,
  decisionNote: true,
  decidedBy: { select: { fullName: true } },
  voucher: { select: { id: true, code: true, amount: true, date: true, method: true } },
} satisfies Prisma.AdvanceRequestSelect;

/** Lái xe đề nghị tạm ứng → văn phòng chi (tự lập phiếu chi "Tạm ứng", trừ vào lương) hoặc từ chối */
@Injectable()
export class AdvancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly push: PushService,
  ) {}

  // ───── Lái xe ─────

  listMine(driverId: number) {
    return this.prisma.advanceRequest.findMany({ where: { driverId }, select: ADVANCE_SELECT, orderBy: { id: 'desc' }, take: 30 });
  }

  async create(driverId: number, amount: number, reason: string) {
    const pending = await this.prisma.advanceRequest.count({ where: { driverId, status: AdvanceStatus.CHO_DUYET } });
    if (pending) throw new BadRequestException('Bạn đang có đề nghị tạm ứng chờ duyệt. Hủy đề nghị đó nếu muốn đổi số tiền.');
    const created = await this.prisma.advanceRequest.create({ data: { driverId, amount, reason: reason.trim() }, select: ADVANCE_SELECT });
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { fullName: true, userId: true } });
    await this.push.notifyRoles(
      [Role.ADMIN, Role.KE_TOAN],
      { type: 'ADVANCE_NEW', title: `Đề nghị tạm ứng mới · ${driver?.fullName ?? ''}`, body: `${vnd(amount)} · ${reason.trim()}`, link: '/finance/advances' },
      { exclude: driver?.userId },
    );
    return created;
  }

  async cancel(driverId: number, id: number) {
    const r = await this.prisma.advanceRequest.updateMany({ where: { id, driverId, status: AdvanceStatus.CHO_DUYET }, data: { status: AdvanceStatus.DA_HUY } });
    if (!r.count) throw new BadRequestException('Đề nghị đã được xử lý, không hủy được');
    return { ok: true };
  }

  // ───── Văn phòng ─────

  list(status?: AdvanceStatus) {
    return this.prisma.advanceRequest.findMany({
      where: status ? { status } : {},
      select: { ...ADVANCE_SELECT, driver: { select: { id: true, fullName: true, phone: true } } },
      orderBy: [{ status: 'asc' }, { id: 'desc' }],
      take: 300,
    });
  }

  pendingCount() {
    return this.prisma.advanceRequest.count({ where: { status: AdvanceStatus.CHO_DUYET } });
  }

  private async pending(id: number) {
    const r = await this.prisma.advanceRequest.findUnique({ where: { id }, include: { driver: { select: { fullName: true } } } });
    if (!r) throw new NotFoundException('Không tìm thấy đề nghị tạm ứng');
    if (r.status !== AdvanceStatus.CHO_DUYET) throw new BadRequestException('Đề nghị này đã được xử lý');
    return r;
  }

  /** Duyệt & chi: lập phiếu chi Tạm ứng gắn lái xe (có thể chi ít hơn số đề nghị) */
  async approve(id: number, user: AuthUser, dto: { amount?: number; method?: PaymentMethod; date?: string; note?: string | null }) {
    const r = await this.pending(id);
    const amount = dto.amount ?? Number(r.amount);
    if (amount > Number(r.amount)) throw new BadRequestException(`Không chi quá số tiền lái xe đề nghị (${vnd(r.amount)})`);
    const hasCategory = await this.prisma.costCategory.findUnique({ where: { code: 'TAM_UNG' } });
    const voucher = await this.finance.createVoucher(
      {
        type: VoucherType.CHI,
        date: dto.date ?? vnDate(new Date()),
        amount,
        categoryCode: hasCategory ? 'TAM_UNG' : null,
        title: 'Tạm ứng lương lái xe',
        counterparty: r.driver.fullName,
        method: dto.method ?? PaymentMethod.TIEN_MAT,
        note: [`Đề nghị: ${r.reason}`, dto.note?.trim()].filter(Boolean).join(' · '),
      },
      user,
      { driverId: r.driverId },
    );
    const done = await this.prisma.advanceRequest.updateMany({
      where: { id, status: AdvanceStatus.CHO_DUYET },
      data: { status: AdvanceStatus.DA_CHI, decidedAt: new Date(), decidedById: user.id, decisionNote: dto.note?.trim() || null, voucherId: voucher.id },
    });
    if (!done.count) {
      // Có người khác xử lý cùng lúc: bỏ phiếu chi vừa lập
      await this.prisma.cashVoucher.delete({ where: { id: voucher.id } });
      throw new BadRequestException('Đề nghị này đã được xử lý');
    }
    await this.push.notifyDriver(
      r.driverId,
      'Tạm ứng đã được duyệt',
      `Văn phòng đã chi tạm ứng ${vnd(amount)}${dto.method === PaymentMethod.CHUYEN_KHOAN ? ' (chuyển khoản)' : ''}. Khoản này sẽ trừ vào lương tháng.`,
      { advanceId: id },
      'ADVANCE_DONE',
    );
    return { ok: true, voucherCode: voucher.code };
  }

  async reject(id: number, user: AuthUser, reason: string) {
    const r = await this.pending(id);
    await this.prisma.advanceRequest.update({ where: { id }, data: { status: AdvanceStatus.TU_CHOI, decidedAt: new Date(), decidedById: user.id, decisionNote: reason.trim() } });
    await this.push.notifyDriver(r.driverId, 'Đề nghị tạm ứng chưa được duyệt', `${vnd(r.amount)}: ${reason.trim()}`, { advanceId: id }, 'ADVANCE_DONE');
    return { ok: true };
  }
}
