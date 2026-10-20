import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BookingStatus, PaymentMethod, Prisma, Role, TripStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AuthUser } from '../auth/auth.decorators';
import { BookingsService, bookingTotals } from '../bookings/bookings.service';
import { nationalityFromPhone } from '../common/nationality';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { ShuttleService } from '../shuttle/shuttle.service';

/** Cài đặt kết nối website (tiền tố "sys." – không trả về trang Thông tin công ty) */
const K = {
  url: 'sys.website.url',
  key: 'sys.website.wooKey',
  secret: 'sys.website.wooSecret',
  enabled: 'sys.website.enabled',
  since: 'sys.website.since',
  state: 'sys.website.state',
};

/** Đơn WooCommerce được nhận thành booking: đã thanh toán / chờ chuyển khoản / hoàn tất */
const IMPORT_STATUSES = ['processing', 'on-hold', 'completed'];
/** Đơn đã nhận mà sau đó bị hủy / hoàn tiền / lỗi: báo điều hành */
const DROP_STATUSES = ['cancelled', 'refunded', 'failed'];
export const WOO_STATUS: Record<string, string> = {
  pending: 'Chờ thanh toán',
  processing: 'Đang xử lý (đã thanh toán)',
  'on-hold': 'Tạm giữ (chờ chuyển khoản)',
  completed: 'Hoàn tất',
  cancelled: 'Đã hủy',
  refunded: 'Đã hoàn tiền',
  failed: 'Thanh toán lỗi',
  'checkout-draft': 'Nháp',
};

/** Bỏ dấu, chữ thường để so khớp tên sản phẩm / trường */
const norm = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/** Địa danh thường gặp: khóa so khớp + tên hiển thị (tên khác ngoài danh sách vẫn so khớp theo chữ) */
const PLACES: [string, RegExp, string][] = [
  ['danang', /da ?nang/, 'Đà Nẵng'],
  ['hoian', /hoi ?an/, 'Hội An'],
  ['hue', /\bhue\b/, 'Huế'],
  ['bana', /ba ?na/, 'Bà Nà'],
  ['dalat', /da ?lat/, 'Đà Lạt'],
  ['nhatrang', /nha ?trang/, 'Nha Trang'],
  ['hanoi', /ha ?noi/, 'Hà Nội'],
  ['halong', /ha ?long/, 'Hạ Long'],
  ['hochiminh', /ho ?chi ?minh|sai ?gon|\bhcm\b/, 'Hồ Chí Minh'],
  ['phongnha', /phong ?nha/, 'Phong Nha'],
  ['dongha', /dong ?ha/, 'Đông Hà'],
  ['quangbinh', /quang ?binh|dong ?hoi/, 'Quảng Bình'],
  ['ninhbinh', /ninh ?binh/, 'Ninh Bình'],
  ['sapa', /sa ?pa/, 'Sa Pa'],
  ['quynhon', /quy ?nhon/, 'Quy Nhơn'],
  ['muine', /mui ?ne/, 'Mũi Né'],
  ['chulai', /chu ?lai/, 'Chu Lai'],
  ['tamky', /tam ?ky/, 'Tam Kỳ'],
];
/** Loại xe / hạng xe trong tên (để chọn đúng tuyến khi cùng chặng có nhiều loại) */
const BUS_HINTS = ['limousine', 'sleeper', 'vip'];
/** Chữ không phải địa danh trong tên sản phẩm / tên tuyến */
const NOISE =
  /\b(xe ?bus|bus|xe|limousine|sleeper|giuong nam|vip|car|luxury|shuttle|xe ghep|one ?way|round ?trip|1 ?chieu|khu hoi|hills?|tickets?|ve|tour|nguoi lon|tre em|adult|child|\d+ ?(s|seats?|cho))\b/g;

export interface Place {
  key: string;
  label: string;
}
/** Địa danh có trong danh mục (không phải tên đường / khách sạn đoán ra) */
export const isKnownPlace = (p: Place) => PLACES.some(([key]) => key === p.key);
const titleCase = (v: string) => v.replace(/\b\w/g, (c) => c.toUpperCase());
function placeOf(seg: string): Place | null {
  const s = seg.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const known = PLACES.find(([, re]) => re.test(s));
  return known ? { key: known[0], label: known[2] } : { key: s.replace(/\s/g, ''), label: titleCase(s) };
}

/** Điểm đi – điểm đến trong tên sản phẩm / tên tuyến ("Bus Da Nang To Hoi An", "BUS HUẾ - HỘI AN", "Xe Bus Đà Nẵng Hội An") */
export function routeEnds(name: string): { from: Place; to: Place; hints: string[] } | null {
  const n = norm(name.replace(/\([^)]*\)/g, ' ')).replace(/<[^>]+>/g, ' ');
  const hints = BUS_HINTS.filter((h) => norm(name).includes(h));
  const segs = n
    .split(/\s(?:to|den|di|->|→|–|—|-|~)\s|\s*[–—→]\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (segs.length >= 2) {
    const from = placeOf(segs[0]);
    const to = placeOf(segs[1]);
    if (from && to && from.key !== to.key) return { from, to, hints };
  }
  // Không có chữ "to / đến / -": lấy 2 địa danh đầu tiên theo thứ tự xuất hiện
  const hits = PLACES.map(([key, re, label]) => ({ key, label, at: n.search(re) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at);
  return hits.length >= 2 ? { from: hits[0], to: hits[1], hints } : null;
}

/** Sản phẩm xe ghép / bus (không phải xe riêng, tour, vé) */
export function isBusProduct(name: string) {
  const n = norm(name);
  // "bus", "xe bus", mã sản phẩm cũ dạng "[BUS101] HỘI AN"
  return /\bbus\d*\b|xe ghep|shuttle/.test(n) && !/private|xe rieng|tour\b|tickets?|\bve\b/.test(n);
}

/** Không phải dịch vụ vận chuyển: tour, vé tham quan / show / cáp treo, khách sạn… */
const NOT_TRANSPORT = /\btour\b|tickets?|\bve\b|\bshow\b|cable car|cap treo|jeep|du lich|kham pha|hang dong|\bcave\b|khach san|hotel|\bspa\b|massage|cruise|du thuyen/;
/** Xe riêng / đưa đón (có chọn loại xe, hoặc tên là private car, xe riêng, đưa đón sân bay, thuê xe…) */
export function isCarProduct(name: string, vehicleLabel = '') {
  const n = norm(name);
  if (NOT_TRANSPORT.test(n)) return false;
  return !!vehicleLabel || /private car|xe rieng|luxury car|car to|car from|\btransfer\b|dua don|don tien|san bay|airport|thue xe|car rental/.test(n);
}

/** Sản phẩm vận chuyển (bus / xe ghép, xe riêng, đưa đón) – chỉ đơn có sản phẩm loại này mới tạo booking */
export function isTransportProduct(name: string, vehicleLabel = '') {
  return isBusProduct(name) || isCarProduct(name, vehicleLabel);
}

/** Đơn có ít nhất một sản phẩm vận chuyển */
export function isTransportOrder(o: { line_items?: { name: string; meta_data?: WooMeta[] }[] }) {
  return (o.line_items ?? []).some((i) => {
    const vLabel = (i.meta_data ?? []).find((m) => norm(m.display_key ?? m.key) === 'loai xe');
    return isTransportProduct(i.name.replace(/<[^>]+>/g, ' '), vLabel ? String(vLabel.display_value ?? vLabel.value ?? '') : '');
  });
}

const sameKey = (a: string, b: string) => a === b || a.includes(b) || b.includes(a);

/** Tuyến xe ghép cùng điểm đi – điểm đến, ưu tiên cùng loại xe (Limousine / VIP / Sleeper) */
function matchRoutes<R extends { name: string }>(routes: R[], ends: NonNullable<ReturnType<typeof routeEnds>>) {
  return routes
    .map((r) => ({ r, e: routeEnds(r.name) }))
    .filter(({ e }) => e && sameKey(e.from.key, ends.from.key) && sameKey(e.to.key, ends.to.key))
    .map(({ r, e }) => ({ r, score: ends.hints.filter((h) => e!.hints.includes(h)).length - e!.hints.filter((h) => !ends.hints.includes(h)).length * 0.1 }))
    .sort((a, b) => b.score - a.score);
}

/** Loại xe khách chọn ("Xe 7 chỗ", "Kia Carnival"…) → mã loại xe */
export function vehicleCode(label: string) {
  const n = norm(label);
  if (/carnival/.test(n)) return 'VIP7';
  if (/limousine/.test(n)) return /11|12/.test(n) ? 'LIMO11' : 'LIMO9';
  const m = n.match(/(\d+)\s*(cho|seat)/);
  return m ? `XE${m[1]}` : null;
}

/** "03-10-2026" + "10:30 AM" / "16:00" → ISO giờ Việt Nam */
export function vnTime(date: string, time: string) {
  const d = date.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  const t = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM|SA|CH)?$/i);
  if (!d || !t) return null;
  let h = Number(t[1]);
  const ap = t[3]?.toUpperCase();
  if ((ap === 'PM' || ap === 'CH') && h < 12) h += 12;
  if ((ap === 'AM' || ap === 'SA') && h === 12) h = 0;
  if (h > 23 || Number(t[2]) > 59) return null;
  return `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}T${String(h).padStart(2, '0')}:${t[2]}:00+07:00`;
}

type TripPlan = Record<string, unknown> & { passengers: number; unitPrice: number };

/** Tài khoản hệ thống đứng tên các booking lấy từ website (không đăng nhập được) */
const BOT_USERNAME = '__website__';

export interface WebsiteState {
  restRoot?: string;
  lastRunAt?: string;
  lastOkAt?: string;
  lastError?: string | null;
  /** Mốc "đơn sửa đổi sau thời điểm" cho lần lấy kế tiếp */
  cursor?: string;
  imported?: number;
}

interface WooMeta {
  key: string;
  value: unknown;
  display_key?: string;
  display_value?: unknown;
}
interface WooOrder {
  id: number;
  number: string;
  status: string;
  currency: string;
  total: string;
  date_created_gmt?: string;
  date_modified_gmt?: string;
  date_paid_gmt?: string | null;
  date_completed_gmt?: string | null;
  payment_method_title?: string;
  transaction_id?: string;
  customer_note?: string;
  billing: { first_name?: string; last_name?: string; company?: string; email?: string; phone?: string; country?: string; address_1?: string; city?: string };
  meta_data?: WooMeta[];
  line_items: { name: string; quantity: number; total: string; meta_data?: WooMeta[] }[];
}

const COUNTRY_LANG: Record<string, string> = { VN: 'vi', KR: 'ko', CN: 'zh', TW: 'zh', HK: 'zh', SG: 'en', JP: 'ja' };
const money = (v: string | number, cur: string) => `${Number(v).toLocaleString('vi-VN')} ${cur === 'VND' ? 'đ' : cur}`;
const metaText = (m: WooMeta) => {
  const v = m.display_value ?? m.value;
  if (v == null || typeof v === 'object') return null;
  const text = String(v).replace(/<[^>]+>/g, '').trim();
  return text ? `${m.display_key ?? m.key}: ${text}` : null;
};

/**
 * Nhận booking từ website công ty (WordPress + WooCommerce): mỗi 2 phút lấy các đơn mới / vừa sửa qua WooCommerce REST API
 * (khóa chỉ đọc do Admin tạo trên website), đơn đã thanh toán / chờ chuyển khoản / hoàn tất tạo booking nguồn "Website"
 * ở trạng thái Nháp và báo Admin, Điều hành. Website không cần cài thêm gì.
 */
@Injectable()
export class WebsiteService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebsiteService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly push: PushService,
    private readonly shuttle: ShuttleService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.sync().catch(() => undefined), 120_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async get() {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: Object.values(K) } } });
    const v = (k: string) => rows.find((r) => r.key === k)?.value ?? '';
    let state: WebsiteState = {};
    try {
      state = JSON.parse(v(K.state) || '{}');
    } catch {
      state = {};
    }
    return { url: v(K.url), key: v(K.key), secret: v(K.secret), enabled: v(K.enabled) === '1', since: v(K.since), state };
  }

  private set(key: string, value: string) {
    return this.prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  private saveState(state: WebsiteState) {
    return this.set(K.state, JSON.stringify(state));
  }

  /** Trạng thái kết nối cho trang Cài đặt (không trả khóa, chỉ 4 ký tự cuối) */
  async status() {
    const c = await this.get();
    const orders = await this.prisma.websiteOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { orderId: true, number: true, status: true, total: true, currency: true, customer: true, createdAt: true, raw: true, booking: { select: { id: true, code: true } } },
    });
    return {
      url: c.url,
      enabled: c.enabled,
      since: c.since || null,
      keyHint: c.key ? `…${c.key.slice(-4)}` : null,
      hasSecret: !!c.secret,
      state: c.state,
      orders: orders.map(({ raw, ...o }) => ({ ...o, total: Number(o.total), statusLabel: WOO_STATUS[o.status] ?? o.status, transport: isTransportOrder(raw as unknown as WooOrder) })),
    };
  }

  async saveConfig(dto: { url?: string; key?: string; secret?: string; enabled?: boolean; since?: string }) {
    if (dto.url !== undefined) await this.set(K.url, dto.url.trim().replace(/\/+$/, ''));
    if (dto.key) await this.set(K.key, dto.key.trim());
    if (dto.secret) await this.set(K.secret, dto.secret.trim());
    if (dto.since !== undefined) await this.set(K.since, dto.since);
    if (dto.enabled !== undefined) {
      await this.set(K.enabled, dto.enabled ? '1' : '0');
      // Bật lần đầu: chỉ lấy đơn từ ngày đã chọn (mặc định hôm nay) để không nhận lại đơn cũ đã nhập tay
      const c = await this.get();
      if (dto.enabled && !c.since) await this.set(K.since, new Date().toISOString().slice(0, 10));
    }
    // Đổi địa chỉ / khóa: tìm lại địa chỉ API
    const c = await this.get();
    await this.saveState({ ...c.state, restRoot: undefined, lastError: null, cursor: undefined });
    return this.status();
  }

  /** Địa chỉ REST API của WordPress (website có thể đổi tiền tố, ví dụ /vi/api/ thay cho /wp-json/) */
  private async restRoot(url: string) {
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'VietnamExplore-Transfer/1.0' }, signal: AbortSignal.timeout(20_000) });
      const link = res.headers.get('link') ?? '';
      const m = link.match(/<([^>]+)>;\s*rel="https:\/\/api\.w\.org\/"/);
      if (m) return m[1].endsWith('/') ? m[1] : `${m[1]}/`;
    } catch {
      // thử đường dẫn mặc định bên dưới
    }
    return new URL('/wp-json/', url).toString();
  }

  private async fetchOrders(root: string, key: string, secret: string, after: string, perPage = 50, order: 'asc' | 'desc' = 'asc') {
    const out: WooOrder[] = [];
    for (let page = 1; page <= 10; page++) {
      const q = new URLSearchParams({ per_page: String(perPage), page: String(page), orderby: 'modified', order, modified_after: after, dates_are_gmt: 'true' });
      const res = await fetch(`${root}wc/v3/orders?${q}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`, Accept: 'application/json', 'User-Agent': 'VietnamExplore-Transfer/1.0' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let msg = body.slice(0, 200);
        try {
          msg = (JSON.parse(body) as { message?: string }).message ?? msg;
        } catch {
          // giữ nguyên
        }
        throw new Error(res.status === 401 || res.status === 403 ? `Website từ chối khóa API (${res.status}): ${msg}` : `Website trả lỗi ${res.status}: ${msg}`);
      }
      const list = (await res.json()) as WooOrder[];
      out.push(...list);
      if (list.length < perPage || order === 'desc') break;
    }
    return out;
  }

  /** Kiểm tra kết nối: lấy thử 1 đơn gần nhất */
  async test() {
    const c = await this.get();
    if (!c.url || !c.key || !c.secret) return { ok: false, message: 'Chưa nhập địa chỉ website và khóa API' };
    try {
      const root = await this.restRoot(c.url);
      const list = await this.fetchOrders(root, c.key, c.secret, '2000-01-01T00:00:00', 1, 'desc');
      return { ok: true, message: list.length ? `Kết nối được. Đơn gần nhất trên website: #${list[0].number}` : 'Kết nối được (chưa có đơn nào)', restRoot: root };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }

  /** Lấy đơn mới / vừa sửa và tạo booking. force = bấm "Đồng bộ ngay" (chạy cả khi đang tắt tự động) */
  async sync(force = false) {
    if (this.running) return { skipped: true };
    const c = await this.get();
    if ((!c.enabled && !force) || !c.url || !c.key || !c.secret) return { skipped: true };
    this.running = true;
    const state: WebsiteState = { ...c.state, lastRunAt: new Date().toISOString() };
    let created = 0;
    try {
      state.restRoot ??= await this.restRoot(c.url);
      // Mốc ngày (giờ Việt Nam) đổi sang giờ GMT của WooCommerce; chưa chọn ngày = từ 0 giờ hôm nay
      const sinceDay = c.since || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
      const since = new Date(`${sinceDay}T00:00:00+07:00`).toISOString().slice(0, 19);
      // Lùi 10 phút để không sót đơn sửa cùng lúc với lần lấy trước
      const cursor = state.cursor && state.cursor > since ? new Date(new Date(`${state.cursor}Z`).getTime() - 600_000).toISOString().slice(0, 19) : since;
      const orders = await this.fetchOrders(state.restRoot, c.key, c.secret, cursor);
      for (const o of orders) {
        if ((o.date_created_gmt ?? '') < since) continue;
        if (await this.handle(o, c.url)) created++;
        if (o.date_modified_gmt && (!state.cursor || o.date_modified_gmt > state.cursor)) state.cursor = o.date_modified_gmt;
      }
      const completed = await this.reconcileCompleted();
      await this.fillPassengers();
      const finished = await this.autoComplete();
      state.lastOkAt = new Date().toISOString();
      state.lastError = null;
      state.imported = (state.imported ?? 0) + created;
      return { ok: true, fetched: orders.length, created, completed, finished };
    } catch (e) {
      state.lastError = (e as Error).message;
      this.logger.warn(`Không lấy được đơn website: ${state.lastError}`);
      return { ok: false, message: state.lastError };
    } finally {
      await this.saveState(state);
      this.running = false;
    }
  }

  /** Xử lý một đơn: lưu / cập nhật, tạo booking nếu đủ điều kiện; trả về true khi vừa tạo booking */
  private async handle(o: WooOrder, siteUrl: string) {
    const customer = [o.billing.first_name, o.billing.last_name].filter(Boolean).join(' ').trim() || o.billing.company || o.billing.email || 'Khách website';
    const prev = await this.prisma.websiteOrder.findUnique({ where: { orderId: o.id }, include: { booking: { select: { id: true, code: true, internalNotes: true } } } });
    const data = { number: String(o.number), status: o.status, total: Number(o.total) || 0, currency: o.currency, customer, raw: o as unknown as Prisma.InputJsonValue };
    const rec = prev ? await this.prisma.websiteOrder.update({ where: { id: prev.id }, data }) : await this.prisma.websiteOrder.create({ data: { orderId: o.id, ...data } });

    // Đơn đã có booking mà bị hủy / hoàn tiền: ghi chú vào booking và báo điều hành (không tự hủy booking)
    if (prev?.booking && prev.status !== o.status && DROP_STATUSES.includes(o.status)) {
      const line = `⚠ ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}: đơn website #${o.number} chuyển sang "${WOO_STATUS[o.status] ?? o.status}".`;
      await this.prisma.booking.update({ where: { id: prev.booking.id }, data: { internalNotes: [line, prev.booking.internalNotes].filter(Boolean).join('\n') } });
      await this.push.notifyRoles([Role.ADMIN, Role.DIEU_HANH], {
        type: 'WEBSITE_ORDER',
        title: `🌐 Đơn website #${o.number} ${WOO_STATUS[o.status]?.toLowerCase() ?? o.status}`,
        body: `${customer} · booking ${prev.booking.code} – kiểm tra và hủy booking nếu cần`,
        link: `/bookings/${prev.booking.id}`,
      });
      return false;
    }
    if (rec.bookingId || !IMPORT_STATUSES.includes(o.status)) return false;
    // Đơn chỉ có tour / vé / khách sạn…: không tạo booking vận chuyển
    if (!isTransportOrder(o)) return false;

    const bot = await this.botUser();
    const plan = await this.planTrips(o);
    const base = {
      customerRef: `WEB-${o.number}`,
      contactName: customer,
      contactPhone: (o.billing.phone ?? '').trim(),
      source: 'WEBSITE',
      docLanguage: this.language(o),
      ...(this.passengerOf(o) && { passengers: [this.passengerOf(o)] }),
    };
    const create = (trips: TripPlan[], extra: string[]) =>
      this.bookings.create(
        { ...base, internalNotes: [this.notes(o, siteUrl), ...extra].join('\n'), trips } as unknown as Parameters<BookingsService['create']>[0],
        bot,
        BookingStatus.NHAP,
      );
    const summary = [
      plan.trips.length ? `Đã tự tạo ${plan.trips.length} chuyến từ đơn – kiểm tra rồi gán xe.` : null,
      ...plan.skipped.map((x) => `Chưa tự tạo chuyến: ${x}`),
      plan.others.length ? `Sản phẩm khác trong đơn (không phải vận chuyển, không xử lý ở booking này): ${plan.others.join('; ')}` : null,
    ].filter((x): x is string => !!x);
    let booking: Awaited<ReturnType<BookingsService['create']>>;
    try {
      booking = await create(plan.trips, summary);
    } catch (e) {
      // Không tạo được chuyến (hết ghế, chuyến ghép đã hủy…): vẫn nhận booking, điều hành thêm chuyến tay
      booking = await create([], [`Không tự tạo được chuyến: ${(e as Error).message}`, ...plan.skipped.map((x) => `Chưa tự tạo chuyến: ${x}`)]);
    }
    await this.prisma.websiteOrder.update({ where: { id: rec.id }, data: { bookingId: booking.id } });
    return true;
  }

  /** Chuyến xe ghép đúng tuyến + giờ: lấy chuyến theo lịch, chưa có thì tạo thêm (website bán cả giờ lẻ) */
  async runFor(routeId: number, iso: string, note = 'Tạo thêm theo đơn đặt trên website') {
    const departAt = new Date(iso);
    const find = () => this.prisma.shuttleRun.findFirst({ where: { routeId, departAt, status: { not: 'HUY' } }, select: { id: true } });
    let run = await find();
    if (!run) {
      const ymd = iso.slice(0, 10);
      await this.shuttle.ensureRuns(ymd, ymd).catch(() => undefined);
      run = await find();
    }
    if (!run) {
      await this.shuttle.createRun({ routeId, departAt: departAt.toISOString(), note }).catch(() => undefined);
      run = await find();
    }
    return run?.id ?? null;
  }

  /**
   * Tuyến xe ghép chưa có trong phần mềm: tự tạo theo điểm đi – điểm đến của sản phẩm (2 khu vực "Trung tâm …",
   * giá = giá khách trả / người, chưa có giờ chạy cố định – chuyến tạo theo từng đơn) và báo Admin / Điều hành kiểm tra lại.
   */
  private async createRouteFor(
    ends: NonNullable<ReturnType<typeof routeEnds>>,
    product: string,
    price: number,
    /** Nguồn đơn để ghi chú, vd "đơn website #123", "GetYourGuide GYG…" */
    origin: string,
    types: { id: number; code: string }[],
  ) {
    try {
      const codes = await this.prisma.shuttleRoute.findMany({ where: { code: { startsWith: 'VNEBUS' } }, select: { code: true } });
      const next = Math.max(0, ...codes.map((c) => Number(c.code.match(/^VNEBUS(\d+)$/)?.[1] ?? 0))) + 1;
      const type = types.find((t) => t.code === (ends.hints.includes('limousine') ? 'LIMO11' : 'XE16')) ?? types[0];
      const vt = await this.prisma.vehicleType.findUniqueOrThrow({ where: { id: type.id }, select: { maxPassengers: true } });
      const hint = ends.hints.map((h) => (h === 'vip' ? 'VIP' : titleCase(h))).join(' ');
      const name = `BUS ${ends.from.label.toUpperCase()} - ${ends.to.label.toUpperCase()}${hint ? ` (${hint})` : ''}`;
      const duration = 120;
      const created = await this.shuttle.createRoute({
        code: `VNEBUS${String(next).padStart(2, '0')}`,
        name,
        vehicleTypeId: type.id,
        capacity: vt.maxPassengers,
        durationMinutes: duration,
        adultPrice: price,
        childPrice: price,
        notes: `Tự tạo từ ${origin} (${product}). Kiểm tra lại: giá, loại xe, số ghế, điểm đón / trả, thời gian chạy, giờ chạy cố định.`,
        isActive: true,
        stops: [
          { name: `Trung tâm ${ends.from.label}`, kind: 'KHU_VUC', offsetMinutes: 0, canPickup: true, canDropoff: false },
          { name: `Trung tâm ${ends.to.label}`, kind: 'KHU_VUC', offsetMinutes: duration, canPickup: false, canDropoff: true },
        ],
        schedules: [],
      } as unknown as Parameters<ShuttleService['createRoute']>[0]);
      await this.push.notifyRoles([Role.ADMIN, Role.DIEU_HANH], {
        type: 'SHUTTLE_ROUTE_NEW',
        title: `🚌 Tự tạo tuyến xe ghép ${name}`,
        body: `Từ ${origin} (${product}) · giá ${price.toLocaleString('vi-VN')} đ/khách – kiểm tra giá, loại xe, điểm đón / trả, giờ chạy`,
        link: '/shuttle-routes',
      });
      return this.prisma.shuttleRoute.findUnique({ where: { id: (created as { id: number }).id }, include: { stops: { where: { isActive: true }, orderBy: { seq: 'asc' } } } });
    } catch (e) {
      this.logger.warn(`Không tự tạo được tuyến xe ghép: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Tuyến xe ghép (chưa có thì tự tạo), điểm đón / trả và chuyến đúng giờ cho sản phẩm bus / xe ghép.
   * Dùng chung cho đơn website và đơn OTA (email). Không được thì trả lý do.
   */
  async shuttleFor(
    ends: NonNullable<ReturnType<typeof routeEnds>>,
    product: string,
    iso: string,
    unitPrice: number,
    origin: string,
    ctx?: {
      /** Chưa có tuyến: không tự tạo (vd điểm đi / đến chỉ là địa chỉ, không rõ địa danh) */
      noCreate?: boolean;
      routes: Awaited<ReturnType<WebsiteService['shuttleRoutes']>>;
      types: { id: number; code: string }[];
      matches?: { r: Awaited<ReturnType<WebsiteService['shuttleRoutes']>>[number] }[];
    },
  ) {
    const routes = ctx?.routes ?? (await this.shuttleRoutes());
    const types = ctx?.types ?? (await this.prisma.vehicleType.findMany({ where: { isActive: true }, select: { id: true, code: true } }));
    const matches = ctx?.matches ?? matchRoutes(routes, ends);
    let route = matches[0]?.r;
    if (!route && !ctx?.noCreate) {
      const made = await this.createRouteFor(ends, product, unitPrice, origin, types);
      if (made) {
        routes.push(made);
        route = made;
      }
    }
    const pick = route?.stops.find((x) => x.canPickup);
    const drop = route && pick ? [...route.stops].reverse().find((x) => x.canDropoff && x.seq > pick.seq) : undefined;
    if (!route || !pick || !drop) return `không tìm / tạo được tuyến xe ghép ${ends.from.label} – ${ends.to.label}`;
    const runId = await this.runFor(route.id, iso, `Tạo thêm theo ${origin}`);
    if (!runId) return `không tạo được chuyến xe ghép ${iso.slice(11, 16)}`;
    return { route, pick, drop, runId };
  }

  shuttleRoutes() {
    return this.prisma.shuttleRoute.findMany({ where: { isActive: true }, include: { stops: { where: { isActive: true }, orderBy: { seq: 'asc' } } }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  }

  /**
   * Lập chuyến từ các sản phẩm của đơn: bus / xe ghép → chuyến xe ghép đúng tuyến (dò theo điểm đi – điểm đến, chưa có tuyến
   * thì tự tạo), ngày, giờ; xe riêng có "Loại xe" → chuyến đưa đón theo tuyến. Tour, vé → để điều hành xử lý.
   */
  private async planTrips(o: WooOrder) {
    const trips: TripPlan[] = [];
    const skipped: string[] = [];
    const others: string[] = [];
    const [routes, types, services] = await Promise.all([
      this.shuttleRoutes(),
      this.prisma.vehicleType.findMany({ where: { isActive: true }, select: { id: true, code: true } }),
      this.prisma.service.findMany({ where: { isActive: true }, select: { code: true } }),
    ]);
    const hasService = (c: string) => services.some((x) => x.code === c);
    const shuttleGroups = new Map<string, TripPlan>();
    for (const item of o.line_items) {
      const name = item.name.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const short = name.split(' - ')[0].trim();
      const meta = (label: string) => {
        const m = (item.meta_data ?? []).find((x) => norm(x.display_key ?? x.key) === label);
        const v = m ? (m.display_value ?? m.value) : null;
        return v == null || typeof v === 'object' ? '' : String(v).replace(/<[^>]+>/g, '').trim();
      };
      const iso = vnTime(meta('ngay di'), meta('gio di'));
      const pickup = meta('noi don') || meta('khu vuc don');
      const dropoff = meta('noi tra');
      const child = /tre em|child|kid/.test(norm(meta('nguoi')));
      const total = Math.round(Number(item.total) || 0);
      const qty = Math.max(1, Math.round(item.quantity || 1));
      // Tour, vé, khách sạn… trong cùng đơn: không thuộc vận chuyển
      if (!isTransportProduct(name, meta('loai xe'))) {
        others.push(short);
        continue;
      }
      if (!iso) {
        skipped.push(`${short} (không đọc được ngày / giờ đi)`);
        continue;
      }
      const ends = isBusProduct(name) ? routeEnds(name) : null;
      if (ends && hasService('XE_GHEP')) {
        // Tuyến cùng điểm đi – điểm đến (cùng loại xe nếu tên có Limousine / VIP / Sleeper); chưa có thì tự tạo tuyến
        const matches = matchRoutes(routes, ends);
        const found = await this.shuttleFor(ends, short, iso, Math.round(total / qty), `đơn website #${o.number}`, { routes, types, matches });
        if (typeof found === 'string') {
          skipped.push(`${short} (${found})`);
          continue;
        }
        const { route, pick, drop, runId } = found;
        const key = `${runId}`;
        const g = shuttleGroups.get(key);
        if (g) {
          g.passengers += qty;
          g.childCount = Number(g.childCount ?? 0) + (child ? qty : 0);
          g.unitPrice += total;
        } else {
          shuttleGroups.set(key, {
            serviceType: 'XE_GHEP',
            pickupTime: iso,
            pickupAddress: pickup || pick.name,
            dropoffAddress: dropoff || drop.name,
            passengers: qty,
            childCount: child ? qty : 0,
            vehicleTypeId: route.vehicleTypeId,
            unitPrice: total,
            shuttleRunId: runId,
            shuttlePickupStopId: pick.id,
            shuttleDropoffStopId: drop.id,
            notes: `Đơn website #${o.number}: ${short}${pickup ? ` · khách đón tại ${pickup}` : ''}`,
          });
        }
        continue;
      }
      const vLabel = meta('loai xe');
      const isCar = isCarProduct(name, vLabel);
      if (isCar) {
        const code = vehicleCode(vLabel);
        const type = types.find((t) => t.code === code);
        const service = /san bay|airport/.test(norm(name)) && hasService('DON_TIEN_SAN_BAY') ? 'DON_TIEN_SAN_BAY' : 'THEO_TUYEN';
        if (!type || !hasService(service)) {
          skipped.push(`${short} (loại xe "${vLabel || 'chưa chọn'}" chưa khớp danh mục loại xe)`);
          continue;
        }
        trips.push({
          serviceType: service,
          pickupTime: iso,
          pickupAddress: pickup || short,
          dropoffAddress: dropoff || null,
          passengers: 1,
          vehicleTypeId: type.id,
          unitPrice: total,
          itinerary: [short, meta('khu vuc don')].filter(Boolean).join(' · '),
          notes: `Đơn website #${o.number}${qty > 1 ? ` · ${qty} xe` : ''} · số khách chưa rõ, xác nhận với khách`,
        });
        continue;
      }
      others.push(short);
    }
    trips.unshift(...shuttleGroups.values());
    return { trips, skipped, others };
  }

/**
   * Đơn website "Hoàn tất": booking tự chuyển Đã xác nhận (đang Nháp / Báo giá, đã có chuyến) và ghi nhận khách đã trả
   * (phiếu thu "Website #số đơn", số tiền = số còn phải thu, tối đa bằng số tiền đơn website). Chạy sau mỗi lần lấy đơn,
   * nên đơn chuyển Hoàn tất sau khi đã nhận booking cũng được cập nhật. Booking có chuyến sắp chạy thì báo điều hành xếp xe.
   * Trả về số booking vừa cập nhật.
   */
  private async reconcileCompleted() {
    const rows = await this.prisma.websiteOrder.findMany({
      where: { status: 'completed', bookingId: { not: null }, booking: { status: { not: BookingStatus.HUY } } },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            discountAmount: true,
            vatPercent: true,
            depositAmount: true,
            trips: { select: { amount: true, status: true, pickupTime: true, shuttleRunId: true } },
            payments: { select: { amount: true, reference: true } },
          },
        },
      },
    });
    let bot: AuthUser | null = null;
    let changed = 0;
    for (const w of rows) {
      const b = w.booking!;
      const raw = w.raw as unknown as WooOrder;
      const ref = `Website #${w.number}`;
      let touched = false;
      bot ??= await this.botUser();
      // 1. Đã xác nhận
      const live = b.trips.filter((t) => t.status !== TripStatus.HUY);
      if ((b.status === BookingStatus.NHAP || b.status === BookingStatus.BAO_GIA) && live.length) {
        const upcoming = live.some((t) => t.pickupTime.getTime() > Date.now());
        if (upcoming) {
          // Chuyến sắp chạy: đi đúng quy trình (báo điều hành xếp xe)
          await this.bookings.changeStatus(b.id, { status: BookingStatus.XAC_NHAN }, bot);
        } else {
          // Chuyến đã qua (đơn cũ): chỉ đổi trạng thái, không báo điều hành
          await this.prisma.booking.update({ where: { id: b.id }, data: { status: BookingStatus.XAC_NHAN } });
          await this.shuttle.syncRuns(b.trips.map((t) => t.shuttleRunId));
        }
        touched = true;
      }
      // 2. Đã thu đủ: một phiếu thu cho đơn website (không ghi trùng)
      if (!b.payments.some((x) => x.reference === ref)) {
        const { balance } = bookingTotals(b);
        const amount = Math.min(balance, Math.round(Number(w.total) || 0));
        if (amount > 0) {
          const bank = /chuyen khoan|bank|bacs/.test(norm(raw.payment_method_title ?? ''));
          const paidAt = raw.date_paid_gmt || raw.date_completed_gmt || raw.date_created_gmt;
          await this.prisma.payment.create({
            data: {
              bookingId: b.id,
              amount,
              method: bank ? PaymentMethod.CHUYEN_KHOAN : PaymentMethod.KHAC,
              paidAt: new Date(`${new Date(paidAt ? `${paidAt}Z` : Date.now()).toISOString().slice(0, 10)}T00:00:00Z`),
              reference: ref,
              note: [`Khách thanh toán online trên website`, raw.payment_method_title, raw.transaction_id && `mã GD ${raw.transaction_id}`].filter(Boolean).join(' · '),
              createdById: bot.id,
            },
          });
          touched = true;
        }
      }
      if (touched) changed++;
    }
    return changed;
  }

/**
   * Hành khách từ thông tin người đặt trên website: họ tên, số điện thoại, năm sinh, CCCD / hộ chiếu;
   * quốc tịch theo mã nước của số điện thoại (không xác định được thì theo quốc gia khách chọn).
   * Website chỉ có thông tin người đặt: các khách đi cùng do điều hành / lái xe bổ sung.
   */
  private passengerOf(o: WooOrder) {
    const fullName = [o.billing.first_name, o.billing.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (!fullName) return null;
    const meta = (...keys: string[]) => {
      const m = (o.meta_data ?? []).find((x) => keys.includes(x.key));
      return m?.value == null || typeof m.value === 'object' ? '' : String(m.value).trim();
    };
    const year = Number(meta('_billing_birth_date', 'billing_birth_date').match(/\b(19|20)\d{2}\b/)?.[0] ?? 0);
    const idNumber = meta('_cccd_passport', 'cccd_passport', '_billing_passport');
    return {
      fullName,
      birthYear: year >= 1900 && year < new Date().getFullYear() ? year : null,
      idNumber: idNumber.replace(/\s/g, '').length >= 5 ? idNumber : null,
      nationality: nationalityFromPhone(o.billing.phone, o.billing.country),
      phone: o.billing.phone?.trim() || null,
      note: 'Người đặt trên website',
    };
  }

  /**
   * Booking website đã xác nhận (đơn web Hoàn tất – khách đã trả), mọi chuyến kết thúc quá 1 ngày mà chưa bấm Hoàn thành:
   * tự hoàn thành chuyến và booking (đơn cũ đã chạy thực tế trước khi dùng phần mềm, chuyến quên bấm).
   * Booking còn chuyến đang chạy (đang đến đón / đã đón khách) thì để lái xe tự bấm. Trả về số booking vừa hoàn thành.
   */
  private async autoComplete() {
    const cutoff = new Date(Date.now() - 24 * 3600_000);
    const closed: TripStatus[] = [TripStatus.HOAN_THANH, TripStatus.HUY];
    const list = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.XAC_NHAN,
        websiteOrder: { status: 'completed' },
        trips: { some: {}, none: { status: { in: [TripStatus.DANG_DEN_DON, TripStatus.DA_DON_KHACH] } } },
      },
      select: { id: true, trips: { select: { id: true, status: true, endTime: true, shuttleRunId: true } } },
    });
    let done = 0;
    for (const b of list) {
      const open = b.trips.filter((t) => !closed.includes(t.status));
      if (open.some((t) => t.endTime > cutoff)) continue;
      const bot = await this.botUser();
      await this.prisma.$transaction([
        this.prisma.bookingTrip.updateMany({ where: { id: { in: open.map((t) => t.id) } }, data: { status: TripStatus.HOAN_THANH } }),
        this.prisma.tripEvent.createMany({
          data: open.map((t) => ({ tripId: t.id, status: TripStatus.HOAN_THANH, note: 'Tự hoàn thành: đơn website đã hoàn tất, chuyến đã qua', userId: bot.id })),
        }),
        this.prisma.booking.update({ where: { id: b.id }, data: { status: BookingStatus.HOAN_THANH } }),
      ]);
      await this.shuttle.syncRuns(b.trips.map((t) => t.shuttleRunId));
      done++;
    }
    return done;
  }

  /** Booking website chưa có hành khách nào: thêm người đặt (booking nhận trước khi có tính năng này) */
  private async fillPassengers() {
    const rows = await this.prisma.websiteOrder.findMany({ where: { booking: { passengers: { none: {} } } }, select: { raw: true, bookingId: true } });
    for (const w of rows) {
      const pax = this.passengerOf(w.raw as unknown as WooOrder);
      if (pax && w.bookingId) await this.prisma.bookingPassenger.create({ data: { bookingId: w.bookingId, seq: 1, ...pax } });
    }
    return rows.length;
  }

  /** Ngôn ngữ giấy tờ: theo ngôn ngữ trang khách đặt (TranslatePress / WPML), không có thì theo quốc gia */
  private language(o: WooOrder) {
    const lang = String(o.meta_data?.find((m) => /trp_language|wpml_language|_lang/i.test(m.key))?.value ?? '').slice(0, 2).toLowerCase();
    if (['vi', 'en', 'ko', 'zh', 'ja'].includes(lang)) return lang;
    const country = (o.billing.country ?? '').toUpperCase();
    return COUNTRY_LANG[country] ?? (country ? 'en' : 'vi');
  }

  /** Ghi chú nội bộ: toàn bộ thông tin đơn để điều hành thêm chuyến */
  private notes(o: WooOrder, siteUrl: string) {
    const items = o.line_items.map((i) => {
      const meta = (i.meta_data ?? []).filter((m) => !m.key.startsWith('_')).map(metaText).filter(Boolean);
      return [`• ${i.name.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()} × ${i.quantity} — ${money(i.total, o.currency)}`, ...meta.map((m) => `   ${m}`)].join('\n');
    });
    const paid = o.date_paid_gmt ? `đã thanh toán ${money(o.total, o.currency)}` : `tổng ${money(o.total, o.currency)}`;
    const admin = (() => {
      try {
        return new URL(`/wp-admin/post.php?post=${o.id}&action=edit`, siteUrl).toString();
      } catch {
        return null;
      }
    })();
    return [
      `🌐 Đơn website #${o.number} – ${WOO_STATUS[o.status] ?? o.status} · ${paid}${o.payment_method_title ? ` · ${o.payment_method_title}` : ''}${o.transaction_id ? ` (mã GD ${o.transaction_id})` : ''}`,
      'Dịch vụ đặt:',
      ...items,
      o.customer_note?.trim() ? `Khách ghi chú: ${o.customer_note.trim()}` : null,
      [o.billing.email && `Email: ${o.billing.email}`, o.billing.country && `Quốc gia: ${o.billing.country}`, [o.billing.address_1, o.billing.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || null,
      admin ? `Xem đơn trên website: ${admin}` : null,
      'Việc cần làm: kiểm tra chuyến (thêm chuyến còn thiếu), ghi nhận thanh toán, xác nhận booking rồi gán xe.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  async botUser(): Promise<AuthUser> {
    const u = await this.prisma.user.upsert({
      where: { username: BOT_USERNAME },
      create: { username: BOT_USERNAME, fullName: 'Website công ty', roles: [], isActive: false, passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10) },
      update: {},
    });
    return { id: u.id, username: u.username, fullName: u.fullName, roles: [], driverId: null };
  }
}
