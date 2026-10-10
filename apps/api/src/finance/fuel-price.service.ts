import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Loại nhiên liệu của xe, khớp với mặt hàng trên bảng giá bán lẻ của Petrolimex.
 * match: nhận diện mặt hàng theo tên Petrolimex công bố (tên có thể đổi nhẹ theo từng kỳ).
 */
export const FUEL_TYPES = [
  { code: 'XANG_95_V', name: 'Xăng E10 RON 95 Mức 5', match: (t: string) => /RON\s*95/i.test(t) && /(Mức\s*5|-V\b)/i.test(t) },
  { code: 'XANG_95_III', name: 'Xăng E10 RON 95 Mức 3', match: (t: string) => /RON\s*95/i.test(t) && /(Mức\s*3|-III\b)/i.test(t) },
  { code: 'XANG_92', name: 'Xăng E5 RON 92', match: (t: string) => /RON\s*92/i.test(t) },
  { code: 'DO_0001', name: 'Dầu DO 0,001S', match: (t: string) => /DO\s*0[,.]001S/i.test(t) },
  { code: 'DO_005', name: 'Dầu DO 0,05S', match: (t: string) => /DO\s*0[,.]05S/i.test(t) },
  { code: 'DIEN', name: 'Điện', match: () => false },
] as const;
export const FUEL_CODES = FUEL_TYPES.map((f) => f.code);

/** API công khai của trang petrolimex.com.vn (bảng "Giá bán lẻ xăng dầu" trên trang chủ) */
const PLX_REQUEST = Buffer.from(
  JSON.stringify({
    FilterBy: {
      And: [
        { SystemID: { Equals: '6783dc1271ff449e95b74a9520964169' } },
        { RepositoryID: { Equals: 'a95451e23b474fe5886bfb7cf843f53c' } },
        { RepositoryEntityID: { Equals: '3801378fe1e045b1afa10de7c5776124' } },
        { Status: { Equals: 'Published' } },
      ],
    },
    SortBy: { LastModified: 'Descending' },
    Pagination: { TotalRecords: -1, TotalPages: 0, PageSize: 0, PageNumber: 0 },
  }),
).toString('base64url');
const PLX_URL = process.env.PETROLIMEX_PRICE_URL ?? `https://portals.petrolimex.com.vn/~apis/portals/cms.item/search?x-request=${PLX_REQUEST}`;

/** Petrolimex điều chỉnh giá lúc 15:00; lấy giá từ 15:00 (giờ VN), lỗi thì thử lại mỗi 10 phút trong ngày */
const UPDATE_HOUR = 15;
const RETRY_MS = 10 * 60_000;

export interface FuelPriceItem {
  title: string;
  code: string | null;
  zone1: number;
  zone2: number;
  modified: string;
}

export interface FuelPriceState {
  /** Giá đang áp dụng theo loại nhiên liệu (đ/lít, theo vùng đã chọn) */
  prices: Record<string, number>;
  items: FuelPriceItem[];
  zone: 1 | 2;
  /** Thời điểm Petrolimex cập nhật giá (mới nhất trong bảng) */
  effectiveAt: string | null;
  /** Lần lấy giá thành công gần nhất */
  updatedAt: string | null;
  lastError: string | null;
  auto: boolean;
}

const KEYS = { prices: 'fuelPrices', zone: 'fuelZone', auto: 'fuelAutoUpdate', state: 'sys.fuelPriceState' } as const;

const vnNow = () => new Date(Date.now() + 7 * 3600_000);
const vnDay = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

@Injectable()
export class FuelPriceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('FuelPrice');
  private timer?: NodeJS.Timeout;
  private busy = false;
  private lastTry = 0;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.FUEL_PRICE_DISABLED === '1') return;
    this.timer = setInterval(() => void this.tick(), 60_000);
    setTimeout(() => void this.tick(), 20_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async get(key: string) {
    return (await this.prisma.setting.findUnique({ where: { key } }))?.value ?? null;
  }

  private set(key: string, value: string) {
    return this.prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  async state(): Promise<FuelPriceState> {
    const [prices, zone, auto, raw] = await Promise.all([this.get(KEYS.prices), this.get(KEYS.zone), this.get(KEYS.auto), this.get(KEYS.state)]);
    const st = (raw ? JSON.parse(raw) : {}) as Partial<FuelPriceState>;
    return {
      prices: prices ? (JSON.parse(prices) as Record<string, number>) : {},
      items: st.items ?? [],
      zone: zone === '2' ? 2 : 1,
      effectiveAt: st.effectiveAt ?? null,
      updatedAt: st.updatedAt ?? null,
      lastError: st.lastError ?? null,
      auto: auto !== 'false',
    };
  }

  /** Đổi vùng giá / bật tắt tự cập nhật: tính lại giá đang áp dụng theo vùng */
  async saveConfig(input: { zone?: 1 | 2; auto?: boolean }) {
    if (input.auto !== undefined) await this.set(KEYS.auto, String(input.auto));
    if (input.zone) {
      await this.set(KEYS.zone, String(input.zone));
      const st = await this.state();
      if (st.items.length) await this.set(KEYS.prices, JSON.stringify(this.pricesOf(st.items, input.zone)));
    }
    return this.state();
  }

  private pricesOf(items: FuelPriceItem[], zone: 1 | 2) {
    const out: Record<string, number> = {};
    for (const i of items) if (i.code && !out[i.code]) out[i.code] = zone === 2 ? i.zone2 : i.zone1;
    return out;
  }

  /** Lấy bảng giá Petrolimex và lưu giá đang áp dụng */
  async refresh(): Promise<FuelPriceState> {
    const prev = await this.state();
    try {
      const res = await fetch(PLX_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (transport-app fuel price)', Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`Petrolimex trả lỗi ${res.status}`);
      const body = (await res.json()) as { Objects?: { Title?: string; Zone1Price?: number; Zone2Price?: number; LastModified?: string; DIsplayOrder?: number }[] };
      const items: FuelPriceItem[] = (body.Objects ?? [])
        .filter((o) => o.Title && Number(o.Zone1Price) > 0)
        .sort((a, b) => (a.DIsplayOrder ?? 0) - (b.DIsplayOrder ?? 0))
        .map((o) => ({
          title: o.Title!.trim(),
          code: FUEL_TYPES.find((f) => f.match(o.Title!))?.code ?? null,
          zone1: Math.round(Number(o.Zone1Price)),
          zone2: Math.round(Number(o.Zone2Price) || Number(o.Zone1Price)),
          modified: o.LastModified ?? '',
        }));
      if (!items.some((i) => i.code)) throw new Error('Không đọc được bảng giá (Petrolimex đổi định dạng?)');
      const effectiveAt = items.map((i) => i.modified).sort().pop() || null;
      await this.set(KEYS.prices, JSON.stringify(this.pricesOf(items, prev.zone)));
      await this.set(KEYS.state, JSON.stringify({ items, effectiveAt, updatedAt: new Date().toISOString(), lastError: null }));
      this.logger.log(`Đã cập nhật giá xăng dầu Petrolimex (${items.length} mặt hàng)`);
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.warn(`Không lấy được giá Petrolimex: ${msg}`);
      await this.set(KEYS.state, JSON.stringify({ items: prev.items, effectiveAt: prev.effectiveAt, updatedAt: prev.updatedAt, lastError: `${new Date().toISOString()} · ${msg}` }));
    }
    return this.state();
  }

  /** Mỗi phút: từ 15:00 (giờ VN) nếu hôm nay chưa lấy giá thì lấy; chưa có giá nào thì lấy ngay */
  private async tick() {
    if (this.busy || Date.now() - this.lastTry < RETRY_MS) return;
    try {
      const st = await this.state();
      if (!st.auto) return;
      const now = vnNow();
      const todayDone = st.updatedAt && vnDay(new Date(st.updatedAt)) === now.toISOString().slice(0, 10) && new Date(st.updatedAt).getTime() + 7 * 3600_000 >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), UPDATE_HOUR);
      const due = !st.updatedAt || (now.getUTCHours() >= UPDATE_HOUR && !todayDone);
      if (!due) return;
      this.busy = true;
      this.lastTry = Date.now();
      await this.refresh();
    } catch (e) {
      this.logger.warn((e as Error).message);
    } finally {
      this.busy = false;
    }
  }

  /** Giá đ/lít đang áp dụng cho một loại nhiên liệu (null = chưa có) */
  async priceOf(code: string | null | undefined) {
    if (!code) return null;
    const st = await this.state();
    return st.prices[code] ?? null;
  }
}
