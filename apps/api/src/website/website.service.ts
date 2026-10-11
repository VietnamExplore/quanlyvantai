import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BookingStatus, Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AuthUser } from '../auth/auth.decorators';
import { BookingsService } from '../bookings/bookings.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

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
      select: { orderId: true, number: true, status: true, total: true, currency: true, customer: true, createdAt: true, booking: { select: { id: true, code: true } } },
    });
    return {
      url: c.url,
      enabled: c.enabled,
      since: c.since || null,
      keyHint: c.key ? `…${c.key.slice(-4)}` : null,
      hasSecret: !!c.secret,
      state: c.state,
      orders: orders.map((o) => ({ ...o, total: Number(o.total), statusLabel: WOO_STATUS[o.status] ?? o.status })),
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
      state.lastOkAt = new Date().toISOString();
      state.lastError = null;
      state.imported = (state.imported ?? 0) + created;
      return { ok: true, fetched: orders.length, created };
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

    const bot = await this.botUser();
    const booking = await this.bookings.create(
      {
        customerRef: `WEB-${o.number}`,
        contactName: customer,
        contactPhone: (o.billing.phone ?? '').trim(),
        source: 'WEBSITE',
        docLanguage: this.language(o),
        internalNotes: this.notes(o, siteUrl),
        trips: [],
      } as unknown as Parameters<BookingsService['create']>[0],
      bot,
      BookingStatus.NHAP,
    );
    await this.prisma.websiteOrder.update({ where: { id: rec.id }, data: { bookingId: booking.id } });
    return true;
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
      return [`• ${i.name} × ${i.quantity} — ${money(i.total, o.currency)}`, ...meta.map((m) => `   ${m}`)].join('\n');
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
      'Việc cần làm: thêm chuyến (ngày giờ đón, điểm đón / trả, loại xe), ghi nhận thanh toán, rồi xác nhận booking.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async botUser(): Promise<AuthUser> {
    const u = await this.prisma.user.upsert({
      where: { username: BOT_USERNAME },
      create: { username: BOT_USERNAME, fullName: 'Website công ty', roles: [], isActive: false, passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10) },
      update: {},
    });
    return { id: u.id, username: u.username, fullName: u.fullName, roles: [], driverId: null };
  }
}
