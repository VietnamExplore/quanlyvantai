import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus, Prisma, TripStatus } from '@prisma/client';
import type { AuthUser } from '../auth/auth.decorators';
import { BookingsService } from '../bookings/bookings.service';
import { nationalityFromPhone } from '../common/nationality';
import { PrismaService } from '../prisma/prisma.service';
import { vehicleCode } from '../website/website.service';
import { otaSalesUserId } from './ota-sales';
import type { TotoDetail } from './toto-pdf';

/**
 * Một booking TOTO Booking (WinWinTravel): dòng file Excel "Booking List" (trình duyệt đọc sẵn),
 * hoặc trang chi tiết đặt chỗ in ra PDF (máy chủ đọc) – có thêm chuyến bay, SĐT / email khách, yêu cầu, trạng thái.
 */
export interface TotoRow {
  reservationId: string;
  carType: string;
  programName: string;
  route: string;
  meetingPlace: string;
  dropPlace: string;
  customerName: string;
  /** "2026-10-20 23:50…" (giờ Việt Nam) */
  meetingTime: string;
  adult: number;
  child: number;
  infant: number;
  totalPax: number;
  checkInDate: string;
  /** Giá TOTO trả cho công ty, đơn vị nghìn đồng */
  totalAmount: number;
  additionalOption: string;
  /** Chỉ có khi nhập từ trang chi tiết (PDF) */
  detail?: TotoDetail | null;
}

const SOURCE = { code: 'TOTO', name: 'TOTO Booking' };
const CUSTOMER_NAME = 'TOTO Booking';
/** Giá trong file tính bằng nghìn đồng */
const PRICE_UNIT = 1000;
/**
 * Giá TOTO trả đã gồm thuế GTGT; mọi booking TOTO đều xuất hóa đơn: tách giá chưa thuế + thuế suất này
 * (vd 432.000 đ = 400.000 đ + 8%). Đổi thuế suất: cài đặt "ota.toto.vatPercent".
 */
const DEFAULT_VAT = 8;
/** Giá đã gồm thuế → giá chưa thuế */
const netOf = (gross: number, vat: number) => Math.round(gross / (1 + vat / 100));
/** Tổng gồm thuế của booking (giống bookingTotals: thuế làm tròn theo booking) */
const grossOf = (net: number, vat: number) => net + Math.round((net * vat) / 100);

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** "SÂN BAY / DaNang Airport(22:01~05:59 Arrival)" → "DaNang Airport" (bỏ khung giờ, tiền tố loại điểm) */
const cleanPlace = (s: string) =>
  s
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^[^/]{1,20}\/\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

/** "2026-10-20 23:50#driverName# / #carPlate#" → ISO giờ Việt Nam */
function pickupIso(meetingTime: string, checkIn: string) {
  const m = meetingTime.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, '0')}:${m[5]}:00+07:00`;
  const d = checkIn.match(/(\d{4})-(\d{2})-(\d{2})/);
  return d ? `${d[1]}-${d[2]}-${d[3]}T00:00:00+07:00` : null;
}

const isCancelled = (r: TotoRow) => /cancel|hủy|huy/i.test(r.detail?.status ?? '');
const isAirport = (s: string) => /airport|san bay/.test(norm(s));
/** Ngôn ngữ giấy tờ (bảng đón, lời chào) theo quốc tịch khách */
const LANG: Record<string, string> = { 'Hàn Quốc': 'ko', 'Trung Quốc': 'zh', 'Đài Loan': 'zh', 'Hồng Kông': 'zh', 'Ma Cao': 'zh', 'Nhật Bản': 'ja', 'Việt Nam': 'vi' };

/**
 * NEW: sẽ tạo · EXISTS: đã nhập, không có gì mới · UPDATE: đã nhập, sẽ bổ sung (chuyến bay, SĐT…) ·
 * CHANGED: TOTO đổi giờ / điểm / số khách / giá (điều hành tự sửa) · CANCELLED: TOTO đã hủy, không nhập · ERROR: không nhập được
 */
export type RowState = 'NEW' | 'EXISTS' | 'UPDATE' | 'CHANGED' | 'CANCELLED' | 'ERROR';

/** Một chuyến của booking (một dòng trong file) */
export interface PlannedTrip {
  pickupTime: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType: string | null;
  passengers: number;
  /** Giá TOTO trả cho chuyến (gồm thuế) */
  amount: number;
  flightNumber: string | null;
  cancelled: boolean;
}

/** Một booking: các dòng cùng mã đặt chỗ trong file gộp thành một booking nhiều chuyến */
export interface PlannedRow {
  reservationId: string;
  state: RowState;
  /** Lỗi không nhập được / các thay đổi so với booking đã nhập */
  messages: string[];
  /** Thông tin sẽ bổ sung vào booking đã nhập (chỉ điền chỗ còn trống) */
  fills: string[];
  booking?: { id: number; code: string; status: BookingStatus } | null;
  trips: PlannedTrip[];
  /** Tổng giá TOTO trả (gồm thuế) của các chuyến chưa hủy */
  amount: number;
  customerName: string;
  program: string;
  hasPhone: boolean;
}

/** Dòng file đã đọc: điểm, loại xe, giá… (dùng chung cho xem trước và nhập) */
interface ParsedTrip {
  row: TotoRow;
  iso: string | null;
  typeId: number | null;
  typeName: string | null;
  service: string;
  pax: number;
  /** Giá gồm thuế (đ) */
  gross: number;
  pick: { address: string; locationId: number | null };
  drop: { address: string; locationId: number | null };
  pickupIsAirport: boolean;
  cancelled: boolean;
  errors: string[];
}

/** Booking đã nhập: các trường cần để so sánh / bổ sung */
const EXISTING_SELECT = {
  id: true,
  code: true,
  status: true,
  customerRef: true,
  contactPhone: true,
  leaderName: true,
  leaderPhone: true,
  internalNotes: true,
  invoiceRequired: true,
  vatPercent: true,
  passengers: { select: { id: true, phone: true, nationality: true }, orderBy: { seq: 'asc' }, take: 1 },
  trips: {
    where: { status: { not: TripStatus.HUY } },
    select: { id: true, pickupTime: true, pickupAddress: true, dropoffAddress: true, passengers: true, vehicleTypeId: true, amount: true, surcharges: true, flightNumber: true, departureFlight: true, notes: true },
    orderBy: { seq: 'asc' },
  },
} satisfies Prisma.BookingSelect;
type Existing = Prisma.BookingGetPayload<{ select: typeof EXISTING_SELECT }>;

/** Việc bổ sung vào booking đã nhập: nhãn hiển thị + dữ liệu ghi */
interface Fill {
  label: string;
  booking?: Prisma.BookingUpdateInput;
  trip?: { id: number; data: Prisma.BookingTripUpdateInput };
  /** Sửa nhiều chuyến cùng lúc (tách VAT) */
  tripsData?: { id: number; data: Prisma.BookingTripUpdateInput }[];
  passenger?: { id: number; data: Prisma.BookingPassengerUpdateInput };
}

@Injectable()
export class TotoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
  ) {}

  private async refs() {
    const [types, services, locations] = await Promise.all([
      this.prisma.vehicleType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true, maxPassengers: true } }),
      this.prisma.service.findMany({ where: { isActive: true }, select: { code: true } }),
      this.prisma.location.findMany({ where: { isActive: true }, select: { id: true, name: true, type: true } }),
    ]);
    return { types, services, locations };
  }

  /** Điểm đón / trả: sân bay khớp danh mục Địa điểm (Sân bay Đà Nẵng…), còn lại giữ tên trong file */
  private place(raw: string, locations: { id: number; name: string; type: string }[]) {
    const label = cleanPlace(raw) || raw.trim();
    const n = norm(raw);
    if (isAirport(raw)) {
      // "Sân bay Đà Nẵng" → "danang" có trong "san bay / danang airport"
      const compact = n.replace(/\s/g, '');
      const loc = locations.find((l) => {
        const city = norm(l.name).replace(/^san bay\s*/, '').replace(/\s/g, '');
        return l.type === 'SAN_BAY' && !!city && compact.includes(city);
      });
      if (loc) return { address: loc.name, locationId: loc.id };
    }
    const loc = locations.find((l) => norm(l.name) === norm(label));
    return { address: loc?.name ?? label, locationId: loc?.id ?? null };
  }

  /** Thuế suất (cài đặt, mặc định 8%) và thông tin xuất hóa đơn của khách hàng TOTO (tên, MST, địa chỉ, email) */
  private async invoiceInfo() {
    const [setting, customer] = await Promise.all([
      this.prisma.setting.findUnique({ where: { key: 'ota.toto.vatPercent' } }),
      this.prisma.customer.findFirst({ where: { name: { equals: CUSTOMER_NAME, mode: 'insensitive' } }, orderBy: { id: 'asc' }, select: { name: true, taxCode: true, address: true, email: true } }),
    ]);
    const v = Number(setting?.value);
    return {
      vat: setting?.value && Number.isFinite(v) && v >= 0 && v <= 20 ? v : DEFAULT_VAT,
      invoice: { invoiceRequired: true, invoiceCompany: customer?.name ?? CUSTOMER_NAME, invoiceTaxCode: customer?.taxCode ?? null, invoiceAddress: customer?.address ?? null, invoiceEmail: customer?.email ?? null },
    };
  }

  private validate(rows: TotoRow[]) {
    if (!Array.isArray(rows) || !rows.length) throw new BadRequestException('File không có dòng booking nào');
    if (rows.length > 500) throw new BadRequestException('Mỗi lần nhập tối đa 500 booking');
    for (const r of rows) {
      if (!r || typeof r.reservationId !== 'string' || !/^\w[\w-]{2,40}$/.test(r.reservationId.trim())) throw new BadRequestException('Có dòng thiếu / sai mã đặt chỗ (Reservation ID)');
    }
  }

  /** Đọc một dòng: thời gian, loại xe, dịch vụ, điểm đón / trả, giá */
  private parseTrip(r: TotoRow, refs: Awaited<ReturnType<TotoService['refs']>>): ParsedTrip {
    const errors: string[] = [];
    const iso = pickupIso(String(r.meetingTime ?? ''), String(r.checkInDate ?? ''));
    if (!iso) errors.push('Không đọc được ngày giờ đón');
    const type = refs.types.find((t) => t.code === vehicleCode(r.carType ?? ''));
    if (!type) errors.push(`Loại xe "${r.carType}" chưa có trong danh mục Loại xe`);
    const service = isAirport(`${r.programName} ${r.route}`) ? 'DON_TIEN_SAN_BAY' : 'THEO_TUYEN';
    if (!refs.services.some((s) => s.code === service)) errors.push(`Chưa có dịch vụ ${service}`);
    const pax = Math.max(1, Math.round(Number(r.totalPax) || Number(r.adult) + Number(r.child) + Number(r.infant) || 1));
    if (type && pax > type.maxPassengers) errors.push(`${pax} khách vượt số chỗ của ${type.name}`);
    const pick = this.place(String(r.meetingPlace || r.route || ''), refs.locations);
    const drop = this.place(String(r.dropPlace ?? ''), refs.locations);
    if (!pick.address) errors.push('Thiếu điểm đón');
    return {
      row: r,
      iso,
      typeId: type?.id ?? null,
      typeName: type?.name ?? (r.carType || null),
      service,
      pax,
      gross: Math.round((Number(r.totalAmount) || 0) * PRICE_UNIT),
      pick,
      drop,
      pickupIsAirport: isAirport(r.meetingPlace || r.route || ''),
      cancelled: isCancelled(r),
      errors,
    };
  }

  /** Thông tin còn thiếu trong booking đã nhập: chỉ điền chỗ trống, không ghi đè */
  private fills(b: Existing, trips: ParsedTrip[], bTrips: Existing['trips'], inv: Awaited<ReturnType<TotoService['invoiceInfo']>>): Fill[] {
    const out: Fill[] = [];
    // Chưa xuất hóa đơn, giá các chuyến đang là giá gồm thuế (nhập trước khi tách VAT): bật hóa đơn, tách giá
    if (
      !b.invoiceRequired &&
      bTrips.length === trips.length &&
      bTrips.every((t, i) => Number(t.amount) === trips[i].gross && !(t.surcharges as unknown[] | null)?.length)
    ) {
      const nets = trips.map((t) => netOf(t.gross, inv.vat));
      out.push({
        label: `Xuất hóa đơn, tách VAT ${inv.vat}%: ${nets.map(vnd).join(' + ')} + thuế`,
        booking: { ...inv.invoice, vatPercent: inv.vat },
        tripsData: bTrips.map((t, i) => ({ id: t.id, data: { unitPrice: nets[i], amount: nets[i] } })),
      });
    }
    // Trang chi tiết (PDF): chuyến bay, yêu cầu theo từng chuyến; SĐT, email theo booking
    trips.forEach((p, i) => {
      const d = p.row.detail;
      const t = bTrips[i];
      if (!d || !t) return;
      const no = trips.length > 1 ? `chuyến ${i + 1}: ` : '';
      if (d.flightNumber) {
        if (p.pickupIsAirport && !t.flightNumber) out.push({ label: `Thêm ${no}chuyến bay đón ${d.flightNumber}`, trip: { id: t.id, data: { flightNumber: d.flightNumber } } });
        if (!p.pickupIsAirport && !t.departureFlight && isAirport(p.row.dropPlace || p.row.route)) out.push({ label: `Thêm ${no}chuyến bay tiễn ${d.flightNumber}`, trip: { id: t.id, data: { departureFlight: d.flightNumber } } });
      }
      if (d.requestMemo && !(t.notes ?? '').includes(d.requestMemo)) out.push({ label: `Thêm ${no}yêu cầu của khách: ${d.requestMemo}`, trip: { id: t.id, data: { notes: [t.notes, `Yêu cầu của khách: ${d.requestMemo}`].filter(Boolean).join(' · ') } } });
    });
    const d = trips.find((t) => t.row.detail?.phone || t.row.detail?.email)?.row.detail;
    if (d) {
      const name = trips.find((t) => t.row.customerName)?.row.customerName || null;
      if (d.phone && !b.contactPhone?.trim()) out.push({ label: 'Thêm SĐT khách', booking: { contactPhone: d.phone, ...(!b.leaderPhone && { leaderPhone: d.phone, leaderName: b.leaderName ?? name }) } });
      const p = b.passengers[0];
      if (p && d.phone && !p.phone) out.push({ label: 'Thêm SĐT, quốc tịch vào danh sách khách', passenger: { id: p.id, data: { phone: d.phone, ...(!p.nationality && { nationality: nationalityFromPhone(d.phone) }) } } });
      const notes = b.internalNotes ?? '';
      if (d.email && !notes.includes(d.email)) out.push({ label: 'Thêm email khách', booking: { internalNotes: [notes, `Email khách: ${d.email}`].filter(Boolean).join('\n') } });
    }
    return out;
  }

  /** Xem trước từng booking + booking TOTO cùng ngày không còn trong file (có thể đã hủy) */
  async preview(rows: TotoRow[]) {
    const { planned, missing, days } = await this.plan(rows);
    return {
      rows: planned.map(({ fillOps: _f, parsed: _p, ...p }) => p),
      missing,
      range: days.length ? { from: days[0], to: days[days.length - 1] } : null,
      counts: (['NEW', 'EXISTS', 'UPDATE', 'CHANGED', 'CANCELLED', 'ERROR'] as const).reduce((o, s) => ({ ...o, [s.toLowerCase()]: planned.filter((r) => r.state === s).length }), {} as Record<Lowercase<RowState>, number>),
    };
  }

  private async plan(rows: TotoRow[]) {
    this.validate(rows);
    const refs = await this.refs();
    const inv = await this.invoiceInfo();
    // Các dòng cùng mã đặt chỗ = một booking nhiều chuyến (vd đón sân bay + tiễn sân bay); giữ thứ tự trong file
    const groups = new Map<string, TotoRow[]>();
    for (const r of rows) {
      const id = r.reservationId.trim();
      groups.set(id, [...(groups.get(id) ?? []), r]);
    }
    // Mã booking của khách = mã đặt chỗ TOTO (chỉ phần số)
    const ids = [...groups.keys()];
    const existing = await this.prisma.booking.findMany({ where: { customerRef: { in: ids }, source: SOURCE.code }, select: EXISTING_SELECT });

    const planned = ids.map((reservationId) => {
      // Chuyến theo giờ đón
      const parsed = groups
        .get(reservationId)!
        .map((r) => this.parseTrip(r, refs))
        .sort((a, b) => (a.iso ?? '').localeCompare(b.iso ?? ''));
      const live = parsed.filter((t) => !t.cancelled);
      const multi = parsed.length > 1;
      const prefix = (i: number) => (multi ? `Chuyến ${i + 1}: ` : '');
      const base = {
        reservationId,
        trips: parsed.map<PlannedTrip>((t) => ({
          pickupTime: t.iso,
          pickupAddress: t.pick.address,
          dropoffAddress: t.drop.address,
          vehicleType: t.typeName,
          passengers: t.pax,
          amount: t.gross,
          flightNumber: t.row.detail?.flightNumber ?? null,
          cancelled: t.cancelled,
        })),
        amount: live.reduce((s, t) => s + t.gross, 0),
        customerName: String(parsed.find((t) => t.row.customerName?.trim())?.row.customerName ?? '').trim(),
        program: [...new Set(parsed.map((t) => String(t.row.programName ?? '').trim()).filter(Boolean))].join(' + '),
        hasPhone: parsed.some((t) => !!t.row.detail?.phone),
        parsed,
      };

      const b = existing.find((x) => x.customerRef === reservationId);
      if (b) {
        // Đã nhập: so từng chuyến (theo giờ đón) – giờ, điểm đón / trả, số khách, loại xe, giá gồm thuế
        const bTrips = [...b.trips].sort((x, y) => +x.pickupTime - +y.pickupTime);
        const diff: string[] = [];
        if (!live.length && b.status !== BookingStatus.HUY) diff.push('TOTO đã HỦY đơn này – kiểm tra rồi hủy booking');
        if (live.length && b.status === BookingStatus.HUY) diff.push('Booking đã hủy trong phần mềm nhưng vẫn còn trên TOTO');
        if (live.length && b.status !== BookingStatus.HUY) {
          parsed.forEach((t, i) => t.cancelled && multi && diff.push(`${prefix(i)}TOTO đã hủy chuyến này – kiểm tra rồi hủy chuyến`));
          if (bTrips.length !== live.length) diff.push(`Số chuyến: ${bTrips.length} → ${live.length}`);
          live.forEach((t, i) => {
            const bt = bTrips[i];
            if (!bt) return;
            const no = live.length > 1 ? `Chuyến ${i + 1} – ` : '';
            if (t.iso && new Date(t.iso).getTime() !== bt.pickupTime.getTime()) diff.push(`${no}Giờ đón: ${fmt(bt.pickupTime)} → ${fmt(new Date(t.iso))}`);
            if (norm(bt.pickupAddress) !== norm(t.pick.address)) diff.push(`${no}Điểm đón: ${bt.pickupAddress} → ${t.pick.address}`);
            if (t.drop.address && norm(bt.dropoffAddress ?? '') !== norm(t.drop.address)) diff.push(`${no}Điểm trả: ${bt.dropoffAddress ?? '—'} → ${t.drop.address}`);
            if (bt.passengers !== t.pax) diff.push(`${no}Số khách: ${bt.passengers} → ${t.pax}`);
            if (t.typeId && bt.vehicleTypeId !== t.typeId) diff.push(`${no}Loại xe → ${t.typeName}`);
            // Giá TOTO trả (gồm thuế) so với chuyến chưa thuế + thuế của booking
            const current = b.invoiceRequired ? grossOf(Number(bt.amount), Number(b.vatPercent)) : Number(bt.amount);
            if (Math.abs(current - t.gross) > 1) diff.push(`${no}Giá (gồm thuế): ${vnd(current)} → ${vnd(t.gross)}`);
          });
        }
        const fillOps = b.status === BookingStatus.HUY || !live.length ? [] : this.fills(b, live, bTrips.length === live.length ? bTrips : bTrips.slice(0, live.length), inv);
        const state: RowState = diff.length ? 'CHANGED' : fillOps.length ? 'UPDATE' : 'EXISTS';
        return { ...base, state, messages: diff, fills: fillOps.map((f) => f.label), fillOps, booking: { id: b.id, code: b.code, status: b.status } };
      }
      if (!live.length) return { ...base, state: 'CANCELLED' as RowState, messages: ['Đơn đã hủy trên TOTO – không nhập'], fills: [], fillOps: [] as Fill[], booking: null };
      const errors = live.flatMap((t, i) => t.errors.map((e) => `${live.length > 1 ? `Chuyến ${i + 1}: ` : ''}${e}`));
      const notes = parsed.some((t) => t.cancelled) ? ['Chuyến đã hủy trên TOTO không được nhập'] : [];
      return { ...base, state: (errors.length ? 'ERROR' : 'NEW') as RowState, messages: errors.length ? errors : notes, fills: [], fillOps: [] as Fill[], booking: null };
    });

    // Booking TOTO có ngày đón trong khoảng ngày của file nhưng không còn trong file: có thể TOTO đã hủy
    // (chỉ khi nhập file Excel danh sách – trang chi tiết PDF chỉ có từng booking)
    const days = rows.map((r) => pickupIso(String(r.meetingTime ?? ''), String(r.checkInDate ?? ''))?.slice(0, 10)).filter((d): d is string => !!d).sort();
    let missing: { id: number; code: string; customerRef: string | null; pickupTime: Date | null; contactName: string }[] = [];
    if (days.length && rows.every((r) => !r.detail)) {
      const from = new Date(`${days[0]}T00:00:00+07:00`);
      const to = new Date(new Date(`${days[days.length - 1]}T00:00:00+07:00`).getTime() + 86_400_000);
      const others = await this.prisma.booking.findMany({
        where: { source: SOURCE.code, customerRef: { notIn: ids }, status: { not: BookingStatus.HUY }, trips: { some: { pickupTime: { gte: from, lt: to }, status: { not: TripStatus.HUY } } } },
        select: { id: true, code: true, customerRef: true, contactName: true, trips: { select: { pickupTime: true }, orderBy: { seq: 'asc' }, take: 1 } },
      });
      missing = others.map((o) => ({ id: o.id, code: o.code, customerRef: o.customerRef, contactName: o.contactName, pickupTime: o.trips[0]?.pickupTime ?? null }));
    }
    return { planned, missing, days };
  }

  /** Khách hàng "TOTO Booking" và nguồn khách "TOTO Booking": dùng cái đã có, chưa có mới tạo */
  private async ensureCustomer() {
    await this.prisma.customerSource.upsert({ where: { code: SOURCE.code }, update: {}, create: { code: SOURCE.code, name: SOURCE.name, sortOrder: 50 } });
    // Tên không phân biệt hoa thường, vd "Toto Booking" văn phòng tạo trước
    const found = await this.prisma.customer.findFirst({ where: { name: { equals: CUSTOMER_NAME, mode: 'insensitive' } }, orderBy: { id: 'asc' }, select: { id: true } });
    if (found) return found.id;
    const agent = await this.prisma.customerKind.findFirst({ where: { isAgent: true }, orderBy: { sortOrder: 'asc' }, select: { code: true } });
    const c = await this.prisma.customer.create({
      data: { name: CUSTOMER_NAME, type: agent?.code ?? 'KHACH_LE', notes: 'Đại lý OTA (WinWinTravel). Booking nhập từ file của trang nhà cung cấp; giá = giá TOTO trả cho công ty.' },
    });
    return c.id;
  }

  /** Nhập booking mới (đã xác nhận, ghi công nợ khách hàng TOTO Booking) và bổ sung thông tin cho booking đã nhập */
  async import(rows: TotoRow[], user: AuthUser) {
    const { planned } = await this.plan(rows);
    const created: { reservationId: string; id: number; code: string; trips: number }[] = [];
    const updated: { reservationId: string; code: string; fills: string[] }[] = [];
    const failed: { reservationId: string; message: string }[] = [];

    // Bổ sung (hóa đơn, chuyến bay, SĐT, email, yêu cầu) cho booking đã nhập – kể cả booking có thay đổi khác
    for (const p of planned.filter((x) => x.fillOps.length && x.booking)) {
      try {
        await this.prisma.$transaction(async (tx) => {
          for (const f of p.fillOps) {
            if (f.booking) await tx.booking.update({ where: { id: p.booking!.id }, data: f.booking });
            if (f.trip) await tx.bookingTrip.update({ where: { id: f.trip.id }, data: f.trip.data });
            for (const t of f.tripsData ?? []) await tx.bookingTrip.update({ where: { id: t.id }, data: t.data });
            if (f.passenger) await tx.bookingPassenger.update({ where: { id: f.passenger.id }, data: f.passenger.data });
          }
        });
        updated.push({ reservationId: p.reservationId, code: p.booking!.code, fills: p.fills });
      } catch (e) {
        failed.push({ reservationId: p.reservationId, message: (e as Error).message });
      }
    }

    const todo = planned.filter((r) => r.state === 'NEW');
    if (todo.length) {
      const customerId = await this.ensureCustomer();
      // Booking OTA tính cho nhân viên kinh doanh "Sale team"
      const salesUserId = await otaSalesUserId(this.prisma);
      const inv = await this.invoiceInfo();
      for (const p of todo) {
        const live = p.parsed.filter((t) => !t.cancelled);
        const d = live.find((t) => t.row.detail?.phone || t.row.detail?.email)?.row.detail ?? null;
        const nationality = d?.phone ? nationalityFromPhone(d.phone) : null;
        try {
          const booking = await this.bookings.create(
            {
              customerId,
              salesUserId,
              customerRef: p.reservationId,
              source: SOURCE.code,
              contactName: p.customerName || CUSTOMER_NAME,
              contactPhone: d?.phone ?? '',
              // Người liên hệ đón khách: lái xe / nhà xe gọi, nhắn tin (đầu số +82 → KakaoTalk…)
              ...(d?.phone && { leaderName: p.customerName || null, leaderPhone: d.phone }),
              ...(nationality && LANG[nationality] && { docLanguage: LANG[nationality] }),
              signTitle: p.customerName || null,
              // Giá TOTO trả đã gồm thuế: luôn xuất hóa đơn, giá chuyến là giá chưa thuế
              ...inv.invoice,
              vatPercent: inv.vat,
              internalNotes: [
                `Nhập từ ${d || live.some((t) => t.row.detail) ? 'trang chi tiết (PDF)' : 'file Excel'} TOTO Booking · mã đặt chỗ ${p.reservationId}${live.length > 1 ? ` · ${live.length} chuyến` : ''}`,
                `Sản phẩm: ${p.program || live[0].row.route}`,
                ...live.map((t) => t.row.additionalOption?.trim()).filter(Boolean).map((o) => `Tùy chọn thêm: ${o}`),
                d?.email ? `Email khách: ${d.email}` : null,
                `Giá TOTO trả (gồm thuế): ${live.map((t) => vnd(t.gross)).join(' + ')}${live.length > 1 ? ` = ${vnd(p.amount)}` : ''} · VAT ${inv.vat}% · xuất hóa đơn cho TOTO, ghi công nợ khách hàng Toto Booking`,
              ]
                .filter(Boolean)
                .join('\n'),
              passengers: p.customerName ? [{ fullName: p.customerName, phone: d?.phone ?? null, nationality }] : [],
              trips: live.map((t) => {
                const r = t.row;
                const td = r.detail;
                const paxNote = [`Người lớn ${Number(r.adult) || 0}`, Number(r.child) ? `trẻ em ${r.child}` : null, Number(r.infant) ? `em bé ${r.infant}` : null].filter(Boolean).join(', ');
                return {
                  serviceType: t.service,
                  pickupTime: t.iso!,
                  pickupAddress: t.pick.address,
                  pickupLocationId: t.pick.locationId,
                  dropoffAddress: t.drop.address || null,
                  dropoffLocationId: t.drop.locationId,
                  ...(td?.flightNumber && (t.pickupIsAirport ? { flightNumber: td.flightNumber } : isAirport(r.dropPlace || r.route) ? { departureFlight: td.flightNumber } : {})),
                  passengers: t.pax,
                  vehicleTypeId: t.typeId!,
                  unitPrice: netOf(t.gross, inv.vat),
                  itinerary: String(r.programName ?? '').trim() || null,
                  notes: [paxNote, r.additionalOption?.trim() || null, td?.requestMemo ? `Yêu cầu của khách: ${td.requestMemo}` : null].filter(Boolean).join(' · '),
                };
              }),
            } as unknown as Parameters<BookingsService['create']>[0],
            user,
            BookingStatus.NHAP,
          );
          // Đơn OTA đã xác nhận: chuyển Đã xác nhận (chuyến sắp chạy thì báo điều hành xếp xe)
          await this.bookings.changeStatus(booking.id, { status: BookingStatus.XAC_NHAN }, user);
          created.push({ reservationId: p.reservationId, id: booking.id, code: booking.code, trips: live.length });
        } catch (e) {
          failed.push({ reservationId: p.reservationId, message: (e as Error).message });
        }
      }
    }
    return { created, updated, failed };
  }
}

const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`;
/** 23:50 20/10 (giờ Việt Nam) */
const fmt = (d: Date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute} ${p.day}/${p.month}`;
};
