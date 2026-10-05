import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { from, Observable, switchMap, tap } from 'rxjs';
import type { AuthUser } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_RULES, AuditRule, FIELD_LABEL } from './audit.rules';

const TZ = 'Asia/Ho_Chi_Minh';
const MUTATING = ['POST', 'PATCH', 'PUT', 'DELETE'];
/** Không đưa vào phần so sánh thay đổi */
const IGNORE = new Set(['id', 'createdAt', 'updatedAt', 'translations', 'pushToken', 'receiptFile', 'receiptType', 'signFile', 'signFileType', 'names', 'seq', 'amount__']);
/** Không bao giờ ghi giá trị (chỉ ghi "đã đổi") */
const SECRET = new Set(['passwordHash', 'password', 'apiKey', 'token', 'accessToken']);

const STATUS_LABEL: Record<string, string> = {
  NHAP: 'Nháp',
  BAO_GIA: 'Đã báo giá',
  XAC_NHAN: 'Đã xác nhận',
  HOAN_THANH: 'Hoàn thành',
  HUY: 'Đã hủy',
  CHO_DIEU: 'Chờ điều xe',
  DA_GAN: 'Đã gán xe',
  TAI_XE_NHAN: 'Lái xe đã nhận',
  DANG_DEN_DON: 'Đang đến đón',
  DA_DON_KHACH: 'Đã đón khách',
  CHO_DUYET: 'Chờ duyệt',
  DA_CHI: 'Đã chi',
  TU_CHOI: 'Từ chối',
  DA_HUY: 'Đã hủy',
  TIEN_MAT: 'Tiền mặt',
  CHUYEN_KHOAN: 'Chuyển khoản',
  CONG_TY: 'Công ty',
  DOI_TAC: 'Đối tác',
};

type Rec = Record<string, unknown>;
type Change = { field: string; from: string; to: string };

const pad = (n: number) => String(n).padStart(2, '0');
function fmtDate(d: Date) {
  // Ngày lưu dạng Date-only (00:00 UTC): chỉ hiện ngày
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.hour}:${p.minute} ${p.day}/${p.month}/${p.year}`;
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (v instanceof Date) return fmtDate(v);
  if (Prisma.Decimal.isDecimal(v)) return Number(v).toLocaleString('vi-VN');
  if (typeof v === 'number') return v.toLocaleString('vi-VN');
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  if (Array.isArray(v)) return v.map((x) => STATUS_LABEL[String(x)] ?? String(x)).join(', ') || '—';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 200);
  return STATUS_LABEL[String(v)] ?? String(v);
}
const same = (a: unknown, b: unknown) => show(a) === show(b);

const labelOf = (r?: Rec | null): string | null => {
  if (!r) return null;
  for (const k of ['code', 'plateNumber', 'fullName', 'name', 'username', 'title']) if (typeof r[k] === 'string' && r[k]) return r[k] as string;
  return null;
};

/**
 * Ghi nhật ký mọi thao tác thêm / sửa / xóa / đổi trạng thái (và đăng nhập).
 * Chụp dữ liệu trước & sau để ghi chi tiết thay đổi; lỗi ghi nhật ký không ảnh hưởng thao tác chính.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditLog');

  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!MUTATING.includes(req.method)) return next.handle();
    const path = String((req.route as { path?: string } | undefined)?.path ?? req.path).replace(/^\/api/, '') || '/';
    const rule = AUDIT_RULES.find((x) => x.method === req.method && x.path === path);
    if (rule?.skip) return next.handle();

    return from(this.snapshot(rule, req).catch(() => null)).pipe(
      switchMap((before) =>
        next.handle().pipe(
          tap({
            next: (res) => void this.write(rule, req, path, before, res, null),
            error: (err: Error) => {
              // Chỉ ghi thao tác lỗi với đăng nhập (theo dõi đăng nhập sai)
              if (path === '/auth/login') void this.write(rule, req, path, before, null, err);
            },
          }),
        ),
      ),
    );
  }

  private idOf(rule: AuditRule | undefined, req: Request): string | undefined {
    const p = (req.params ?? {}) as Record<string, string | undefined>;
    return rule?.idField === 'code' ? p.code : (p.id ?? p.vehicleTypeId ?? p.salaryId);
  }

  /** Dữ liệu của đối tượng (booking kèm danh sách chuyến) */
  private async load(model: string, key: string | number, idField: 'id' | 'code' = 'id'): Promise<Rec | null> {
    const where = { [idField]: idField === 'id' ? Number(key) : String(key) };
    if (idField === 'id' && !Number.isFinite(where.id as number)) return null;
    if (model === 'booking') {
      return this.prisma.booking.findUnique({
        where: where as unknown as Prisma.BookingWhereUniqueInput,
        include: {
          trips: { select: { id: true, seq: true, pickupTime: true, pickupAddress: true, dropoffAddress: true, amount: true, status: true, collectAmount: true }, orderBy: { seq: 'asc' } },
          _count: { select: { passengers: true } },
        },
      }) as Promise<Rec | null>;
    }
    if (model === 'bookingTrip') {
      return this.prisma.bookingTrip.findUnique({ where: where as unknown as Prisma.BookingTripWhereUniqueInput, include: { booking: { select: { id: true, code: true } } } }) as Promise<Rec | null>;
    }
    if (model === 'tripCost') {
      return this.prisma.tripCost.findUnique({ where: where as unknown as Prisma.TripCostWhereUniqueInput, include: { trip: { select: { seq: true, bookingId: true, booking: { select: { code: true } } } } } }) as Promise<Rec | null>;
    }
    const delegate = (this.prisma as unknown as Record<string, { findUnique: (a: unknown) => Promise<Rec | null> }>)[model];
    return delegate?.findUnique ? delegate.findUnique({ where }) : null;
  }

  private async snapshot(rule: AuditRule | undefined, req: Request) {
    const id = this.idOf(rule, req);
    if (!rule?.model || !id) return null;
    return this.load(rule.model, id, rule.idField);
  }

  /** Tên hiển thị của khóa ngoại (NV, lái xe, xe, khách…) */
  private async refName(field: string, id: unknown): Promise<string | null> {
    if (id === null || id === undefined) return null;
    const n = Number(id);
    try {
      if (field === 'salesUserId' || field === 'createdById' || field === 'decidedById') return (await this.prisma.user.findUnique({ where: { id: n }, select: { fullName: true } }))?.fullName ?? null;
      if (field === 'driverId' || field === 'defaultDriverId') return (await this.prisma.driver.findUnique({ where: { id: n }, select: { fullName: true } }))?.fullName ?? null;
      if (field === 'vehicleId') return (await this.prisma.vehicle.findUnique({ where: { id: n }, select: { plateNumber: true } }))?.plateNumber ?? null;
      if (field === 'customerId') return (await this.prisma.customer.findUnique({ where: { id: n }, select: { name: true } }))?.name ?? null;
      if (field === 'partnerId') return (await this.prisma.partner.findUnique({ where: { id: n }, select: { name: true } }))?.name ?? null;
      if (field === 'vehicleTypeId') return (await this.prisma.vehicleType.findUnique({ where: { id: n }, select: { name: true } }))?.name ?? null;
    } catch {
      /* bỏ qua */
    }
    return null;
  }

  private async diff(before: Rec | null, after: Rec | null): Promise<Change[]> {
    if (!before || !after) return [];
    const out: Change[] = [];
    for (const key of Object.keys(after)) {
      if (IGNORE.has(key) || key === 'trips' || key === '_count' || key === 'booking' || key === 'trip') continue;
      const a = before[key];
      const b = after[key];
      if (SECRET.has(key)) {
        if (a !== b) out.push({ field: key === 'passwordHash' ? 'Mật khẩu' : key, from: '', to: 'đã thay đổi' });
        continue;
      }
      if (b !== null && typeof b === 'object' && !(b instanceof Date) && !Prisma.Decimal.isDecimal(b) && !Array.isArray(b)) {
        if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: FIELD_LABEL[key] ?? key, from: '', to: 'đã thay đổi' });
        continue;
      }
      if (same(a, b)) continue;
      const isRef = key.endsWith('Id');
      out.push({
        field: FIELD_LABEL[key] ?? key,
        from: isRef ? ((await this.refName(key, a)) ?? show(a)) : show(a),
        to: isRef ? ((await this.refName(key, b)) ?? show(b)) : show(b),
      });
    }
    // Booking: thay đổi từng chuyến và số hành khách
    const tb = before.trips as Rec[] | undefined;
    const ta = after.trips as Rec[] | undefined;
    if (tb && ta) {
      const brief = (t: Rec) => `${show(t.pickupTime)} · ${t.pickupAddress}${t.dropoffAddress ? ` → ${t.dropoffAddress}` : ''} · ${show(t.amount)}đ`;
      for (const t of ta) {
        const old = tb.find((x) => x.id === t.id);
        if (!old) {
          out.push({ field: `Thêm chuyến ${t.seq}`, from: '', to: brief(t) });
          continue;
        }
        const parts: string[] = [];
        if (!same(old.pickupTime, t.pickupTime)) parts.push(`giờ đón ${show(old.pickupTime)} → ${show(t.pickupTime)}`);
        if (old.pickupAddress !== t.pickupAddress) parts.push(`điểm đón ${old.pickupAddress} → ${t.pickupAddress}`);
        if ((old.dropoffAddress ?? '') !== (t.dropoffAddress ?? '')) parts.push(`điểm trả ${show(old.dropoffAddress)} → ${show(t.dropoffAddress)}`);
        if (!same(old.amount, t.amount)) parts.push(`thành tiền ${show(old.amount)} → ${show(t.amount)}`);
        if (!same(old.collectAmount, t.collectAmount)) parts.push(`nhờ thu ${show(old.collectAmount)} → ${show(t.collectAmount)}`);
        if (old.status !== t.status) parts.push(`trạng thái ${show(old.status)} → ${show(t.status)}`);
        if (parts.length) out.push({ field: `Chuyến ${t.seq}`, from: '', to: parts.join('; ') });
      }
      for (const old of tb) if (!ta.some((x) => x.id === old.id)) out.push({ field: `Xóa chuyến ${old.seq}`, from: brief(old), to: '' });
      const pb = (before._count as Rec | undefined)?.passengers;
      const pa = (after._count as Rec | undefined)?.passengers;
      if (pb !== pa) out.push({ field: 'Số hành khách trong danh sách', from: show(pb), to: show(pa) });
    }
    return out;
  }

  /** Thông tin thêm theo từng thao tác (trạng thái mới, số tiền, lý do…) */
  private detailOf(path: string, body: Rec, res: Rec | null, err: Error | null): string | null {
    if (err) return err.message;
    const money = (v: unknown) => `${Number(v).toLocaleString('vi-VN')}đ`;
    if (path.endsWith('/status')) return `→ ${show(body.status)}${body.cancelReason ? ` · lý do: ${body.cancelReason}` : ''}`;
    if (path === '/bookings/:id/payments' || path === '/partners/:id/payments') return [body.amount && money(body.amount), body.method && show(body.method), body.note].filter(Boolean).join(' · ') || null;
    if (path.endsWith('/collect')) return `${money(body.amount)} · ${show(body.method)}`;
    if (path.endsWith('/reject')) return body.reason ? `Lý do: ${body.reason}` : null;
    if (path === '/dispatch/trips/:id/assign') return body.mode === 'PARTNER' ? 'Giao nhà xe đối tác' : 'Xe công ty';
    if (path === '/driver/fuel' || path === '/driver/advances' || path === '/vouchers') return [body.amount && money(body.amount), (body.reason ?? body.note ?? body.title) as string].filter(Boolean).join(' · ') || null;
    if (path.endsWith('/approve')) return body.amount ? `Chi ${money(body.amount)}` : null;
    if (path === '/auth/login') return res ? null : 'Sai tên đăng nhập hoặc mật khẩu';
    return null;
  }

  private async write(rule: AuditRule | undefined, req: Request & { user?: AuthUser }, path: string, before: Rec | null, res: unknown, err: Error | null) {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Rec;
      const result = res && typeof res === 'object' ? (res as Rec) : null;
      const login = path === '/auth/login';
      const loginUser = login ? (result?.user as Rec | undefined) : undefined;
      const user = req.user;

      // Đối tượng sau thao tác: tải lại (sửa) hoặc theo kết quả trả về (tạo mới)
      let id = this.idOf(rule, req);
      if (!id && result?.id && rule?.model) id = String(result.id);
      let after: Rec | null = null;
      if (rule?.model && id && req.method !== 'DELETE') after = await this.load(rule.model, id, rule.idField).catch(() => null);
      const rec = after ?? before;

      let bookingId: number | null = null;
      if (rule?.model === 'booking' && rec) bookingId = rec.id as number;
      else if (rec && typeof rec.bookingId === 'number') bookingId = rec.bookingId;
      else if (rec?.trip && typeof (rec.trip as Rec).bookingId === 'number') bookingId = (rec.trip as Rec).bookingId as number;

      let entityLabel = labelOf(rec);
      if (rule?.model === 'bookingTrip' && rec) entityLabel = `${(rec.booking as Rec | undefined)?.code ?? ''} · chuyến ${rec.seq}`;
      if (rule?.model === 'tripCost' && rec) entityLabel = `${((rec.trip as Rec)?.booking as Rec | undefined)?.code ?? ''} · chuyến ${(rec.trip as Rec)?.seq}`;
      if (login) entityLabel = String(body.username ?? '');

      const changes = req.method === 'PATCH' || req.method === 'PUT' || (req.method === 'POST' && before) ? await this.diff(before, after) : [];

      await this.prisma.auditLog.create({
        data: {
          userId: user?.id ?? (loginUser?.id as number | undefined) ?? null,
          userName: user?.fullName ?? (loginUser?.fullName as string | undefined) ?? (login ? String(body.username ?? '') : null),
          action: rule?.action ?? `${req.method} ${path}`,
          method: req.method,
          path: req.originalUrl.split('?')[0].slice(0, 300),
          entity: rule?.entity ?? null,
          entityId: id ? String(id) : null,
          entityLabel,
          bookingId,
          detail: this.detailOf(path, body, result, err)?.slice(0, 500) ?? null,
          changes: changes.length ? (changes as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          ip: (String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.ip || null)?.slice(0, 64) ?? null,
          success: !err,
        },
      });
      // Dọn nhật ký quá 2 năm (thỉnh thoảng)
      if (Math.random() < 0.005) await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 730 * 86_400_000) } } });
    } catch (e) {
      this.logger.warn(`Không ghi được nhật ký: ${(e as Error).message}`);
    }
  }
}
