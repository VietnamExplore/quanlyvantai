import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma, TripStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { isAirport, ParsedInvoice, parseInvoicePdf, parseInvoiceXml, plateKey, TollLine } from './toll-invoice';

const HOUR = 3_600_000;
/** Khoản mục chi phí */
const CAT_TOLL = 'CAU_DUONG';
const CAT_AIRPORT = 'PHI_SAN_BAY';
/** Ngày giờ Việt Nam */
const vnYmd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
/** "16:14 17/09" giờ Việt Nam */
const vnHm = (d: Date) => {
  const v = new Date(d.getTime() + 7 * HOUR).toISOString();
  return `${v.slice(11, 16)} ${v.slice(8, 10)}/${v.slice(5, 7)}`;
};

/**
 * Phí đường bộ / phí sân bay trừ tự động qua ePass: nhập hóa đơn điện tử ePass (PDF hoặc XML, mỗi tuần),
 * mỗi lượt xe công ty qua trạm thành một khoản chi phí của chuyến:
 * - chuyến của xe đó đang chạy lúc qua trạm (giờ đón − 2 giờ … giờ kết thúc + 2 giờ);
 * - không có thì chuyến gần nhất cùng ngày của xe;
 * - xe không có chuyến trong ngày: để "chưa gắn chuyến" (chi phí xe), khớp lại được sau khi thêm chuyến.
 * Mã giao dịch không nhập trùng; công ty trả nên không tính vào hoàn ứng của lái xe.
 */
@Injectable()
export class TollsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Chuyến của xe khớp với thời điểm qua trạm */
  private async matchTrip(vehicleId: number, at: Date) {
    const ymd = vnYmd(at);
    const dayStart = new Date(`${ymd}T00:00:00+07:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * HOUR);
    const trips = await this.prisma.bookingTrip.findMany({
      where: { vehicleId, status: { not: TripStatus.HUY }, booking: { status: { not: BookingStatus.HUY } }, pickupTime: { lt: dayEnd }, endTime: { gt: dayStart } },
      select: { id: true, pickupTime: true, endTime: true },
    });
    if (!trips.length) return null;
    const t = at.getTime();
    const dist = (x: { pickupTime: Date; endTime: Date }) => (t < x.pickupTime.getTime() ? x.pickupTime.getTime() - t : t > x.endTime.getTime() ? t - x.endTime.getTime() : 0);
    return [...trips].sort((a, b) => dist(a) - dist(b))[0].id;
  }

  private costNote(l: { station: string; passedAt: Date; txId: string; invoiceNo: string | null }) {
    return [`ePass · ${l.station || 'trạm thu phí'} · ${vnHm(l.passedAt)}`, `mã GD ${l.txId}`, l.invoiceNo && `HĐ ${l.invoiceNo}`].filter(Boolean).join(' · ');
  }

  /** Gắn lượt qua trạm vào chuyến: tạo khoản chi phí của chuyến */
  private async attach(tx: Prisma.TransactionClient, id: number, tripId: number, userId: number | null) {
    const row = await tx.tollTransaction.findUniqueOrThrow({ where: { id } });
    if (row.tripCostId) await tx.tripCost.delete({ where: { id: row.tripCostId } }).catch(() => undefined);
    const cost = await tx.tripCost.create({
      data: {
        tripId,
        categoryCode: row.categoryCode,
        amount: row.amount,
        spentAt: new Date(`${vnYmd(row.passedAt)}T00:00:00Z`),
        note: this.costNote(row),
        byDriver: false,
        createdById: userId,
      },
    });
    await tx.tollTransaction.update({ where: { id }, data: { tripId, tripCostId: cost.id } });
  }

  /** Nhập các file hóa đơn ePass (PDF / XML) */
  async import(files: Express.Multer.File[], user: AuthUser) {
    if (!files?.length) throw new BadRequestException('Chưa chọn file hóa đơn');
    const vehicles = await this.prisma.vehicle.findMany({ select: { id: true, plateNumber: true } });
    const byPlate = new Map(vehicles.map((v) => [plateKey(v.plateNumber), v.id]));
    const result = { files: [] as { name: string; invoiceNo: string | null; lines: number; total: number | null; error?: string }[], lines: 0, added: 0, duplicates: 0, matched: 0, unmatched: 0, unknownVehicle: [] as string[], amount: 0 };
    for (const f of files) {
      const name = Buffer.from(f.originalname, 'latin1').toString('utf8');
      let inv: ParsedInvoice;
      try {
        const isXml = /\.xml$/i.test(name) || f.mimetype.includes('xml');
        inv = isXml ? parseInvoiceXml(f.buffer.toString('utf8')) : await parseInvoicePdf(new Uint8Array(f.buffer));
        if (!inv.lines.length) throw new Error('Không thấy lượt xe qua trạm nào – có phải hóa đơn ePass không?');
      } catch (e) {
        result.files.push({ name, invoiceNo: null, lines: 0, total: null, error: (e as Error).message });
        continue;
      }
      result.files.push({ name, invoiceNo: inv.invoiceNo, lines: inv.lines.length, total: inv.total });
      for (const l of inv.lines) {
        result.lines++;
        if (await this.prisma.tollTransaction.findUnique({ where: { txId: l.txId }, select: { id: true } })) {
          result.duplicates++;
          continue;
        }
        const vehicleId = byPlate.get(plateKey(l.plate)) ?? null;
        if (!vehicleId && !result.unknownVehicle.includes(l.plate)) result.unknownVehicle.push(l.plate);
        const tripId = vehicleId ? await this.matchTrip(vehicleId, l.passedAt) : null;
        await this.prisma.$transaction(async (tx) => {
          const row = await tx.tollTransaction.create({ data: this.rowData(l, vehicleId, user.id) });
          if (tripId) await this.attach(tx, row.id, tripId, user.id);
        });
        result.added++;
        result.amount += l.amount;
        if (tripId) result.matched++;
        else result.unmatched++;
      }
    }
    return result;
  }

  private rowData(l: TollLine, vehicleId: number | null, userId: number) {
    return {
      txId: l.txId,
      plate: l.plate,
      vehicleId,
      station: l.station,
      vehicleClass: l.vehicleClass,
      passedAt: l.passedAt,
      amount: l.amount,
      amountNet: l.amountNet,
      vatPercent: l.vatPercent,
      categoryCode: isAirport(l.station) ? CAT_AIRPORT : CAT_TOLL,
      invoiceNo: l.invoiceNo,
      invoiceDate: l.invoiceDate,
      importedById: userId,
    };
  }

  /** Khớp lại các lượt chưa gắn chuyến (sau khi điều hành thêm / gán xe cho chuyến) */
  async rematch(user: AuthUser) {
    const rows = await this.prisma.tollTransaction.findMany({ where: { tripCostId: null, vehicleId: { not: null } }, select: { id: true, vehicleId: true, passedAt: true } });
    let matched = 0;
    for (const r of rows) {
      const tripId = await this.matchTrip(r.vehicleId!, r.passedAt);
      if (!tripId) continue;
      await this.prisma.$transaction((tx) => this.attach(tx, r.id, tripId, user.id));
      matched++;
    }
    return { checked: rows.length, matched };
  }

  /** Gắn tay vào chuyến khác / bỏ gắn (tripId = null: thành chi phí xe) */
  async assign(id: number, tripId: number | null, user: AuthUser) {
    const row = await this.prisma.tollTransaction.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không có lượt qua trạm này');
    if (tripId) {
      const trip = await this.prisma.bookingTrip.findUnique({ where: { id: tripId }, select: { id: true } });
      if (!trip) throw new NotFoundException('Không có chuyến này');
      await this.prisma.$transaction((tx) => this.attach(tx, id, tripId, user.id));
    } else {
      await this.prisma.$transaction(async (tx) => {
        if (row.tripCostId) await tx.tripCost.delete({ where: { id: row.tripCostId } }).catch(() => undefined);
        await tx.tollTransaction.update({ where: { id }, data: { tripId: null, tripCostId: null } });
      });
    }
    return this.one(id);
  }

  private one(id: number) {
    return this.prisma.tollTransaction.findUniqueOrThrow({ where: { id }, include: this.include });
  }

  private readonly include = {
    vehicle: { select: { id: true, plateNumber: true } },
    trip: { select: { id: true, pickupTime: true, pickupAddress: true, dropoffAddress: true, booking: { select: { id: true, code: true } } } },
  } satisfies Prisma.TollTransactionInclude;

  async list(q: { from?: string; to?: string; vehicleId?: number; unmatched?: boolean }) {
    const where: Prisma.TollTransactionWhereInput = {
      ...(q.vehicleId && { vehicleId: q.vehicleId }),
      ...(q.unmatched && { tripCostId: null }),
      ...((q.from || q.to) && {
        passedAt: { ...(q.from && { gte: new Date(`${q.from}T00:00:00+07:00`) }), ...(q.to && { lt: new Date(new Date(`${q.to}T00:00:00+07:00`).getTime() + 24 * HOUR) }) },
      }),
    };
    const rows = await this.prisma.tollTransaction.findMany({ where, include: this.include, orderBy: { passedAt: 'desc' }, take: 2000 });
    const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((s, r) => s + Number(r.amount), 0);
    return {
      rows: rows.map((r) => ({ ...r, amount: Number(r.amount), amountNet: Number(r.amountNet), vatPercent: Number(r.vatPercent), matched: !!r.tripCostId })),
      totals: {
        amount: sum(() => true),
        toll: sum((r) => r.categoryCode === CAT_TOLL),
        airport: sum((r) => r.categoryCode === CAT_AIRPORT),
        unmatched: sum((r) => !r.tripCostId),
        count: rows.length,
      },
    };
  }
}
