import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus, Prisma, TripStatus } from '@prisma/client';
import type { AuthUser } from '../auth/auth.decorators';
import { BookingsService } from '../bookings/bookings.service';
import { nationalityFromPhone } from '../common/nationality';
import { PrismaService } from '../prisma/prisma.service';
import { vehicleCode } from '../website/website.service';
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

export interface PlannedRow {
  reservationId: string;
  state: RowState;
  /** Lỗi không nhập được / các thay đổi so với booking đã nhập */
  messages: string[];
  /** Thông tin sẽ bổ sung vào booking đã nhập (chỉ điền chỗ còn trống) */
  fills: string[];
  booking?: { id: number; code: string; status: BookingStatus } | null;
  pickupTime: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType: string | null;
  passengers: number;
  amount: number;
  customerName: string;
  program: string;
  flightNumber: string | null;
  hasPhone: boolean;
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

  /** Thông tin trang chi tiết (PDF) còn thiếu trong booking đã nhập: chỉ điền chỗ trống, không ghi đè */
  private fills(b: Existing, r: TotoRow, pickupIsAirport: boolean, gross: number, inv: Awaited<ReturnType<TotoService['invoiceInfo']>>): Fill[] {
    const out: Fill[] = [];
    const t = b.trips[0];
    // Chưa xuất hóa đơn, giá chuyến đang là giá gồm thuế (nhập trước khi tách VAT): bật hóa đơn, tách giá
    if (!b.invoiceRequired && t && b.trips.length === 1 && Number(t.amount) === gross && !(t.surcharges as unknown[] | null)?.length) {
      const net = netOf(gross, inv.vat);
      out.push({
        label: `Xuất hóa đơn, tách VAT ${inv.vat}%: ${vnd(net)} + thuế = ${vnd(grossOf(net, inv.vat))}`,
        booking: { ...inv.invoice, vatPercent: inv.vat },
        trip: { id: t.id, data: { unitPrice: net, amount: net } },
      });
    }
    const d = r.detail;
    if (!d) return out;
    if (t && d.flightNumber) {
      if (pickupIsAirport && !t.flightNumber) out.push({ label: `Thêm chuyến bay đón ${d.flightNumber}`, trip: { id: t.id, data: { flightNumber: d.flightNumber } } });
      if (!pickupIsAirport && !t.departureFlight && isAirport(r.dropPlace || r.route)) out.push({ label: `Thêm chuyến bay tiễn ${d.flightNumber}`, trip: { id: t.id, data: { departureFlight: d.flightNumber } } });
    }
    if (d.phone && !b.contactPhone?.trim()) out.push({ label: 'Thêm SĐT khách', booking: { contactPhone: d.phone, ...(!b.leaderPhone && { leaderPhone: d.phone, leaderName: b.leaderName ?? (r.customerName || null) }) } });
    const p = b.passengers[0];
    if (p && d.phone && !p.phone) out.push({ label: 'Thêm SĐT, quốc tịch vào danh sách khách', passenger: { id: p.id, data: { phone: d.phone, ...(!p.nationality && { nationality: nationalityFromPhone(d.phone) }) } } });
    const notes = b.internalNotes ?? '';
    if (d.email && !notes.includes(d.email)) out.push({ label: 'Thêm email khách', booking: { internalNotes: [notes, `Email khách: ${d.email}`].filter(Boolean).join('\n') } });
    if (t && d.requestMemo && !(t.notes ?? '').includes(d.requestMemo)) out.push({ label: `Thêm yêu cầu của khách: ${d.requestMemo}`, trip: { id: t.id, data: { notes: [t.notes, `Yêu cầu của khách: ${d.requestMemo}`].filter(Boolean).join(' · ') } } });
    return out;
  }

  /** Xem trước từng booking + booking TOTO cùng ngày không còn trong file (có thể đã hủy) */
  async preview(rows: TotoRow[]) {
    const { planned, missing, days } = await this.plan(rows);
    return {
      rows: planned.map(({ fillOps: _f, ...p }) => p),
      missing,
      range: days.length ? { from: days[0], to: days[days.length - 1] } : null,
      counts: (['NEW', 'EXISTS', 'UPDATE', 'CHANGED', 'CANCELLED', 'ERROR'] as const).reduce((o, s) => ({ ...o, [s.toLowerCase()]: planned.filter((r) => r.state === s).length }), {} as Record<Lowercase<RowState>, number>),
    };
  }

  private async plan(rows: TotoRow[]) {
    this.validate(rows);
    const { types, services, locations } = await this.refs();
    const inv = await this.invoiceInfo();
    // Mã booking của khách = mã đặt chỗ TOTO (chỉ phần số)
    const ids = rows.map((r) => r.reservationId.trim());
    const existing = await this.prisma.booking.findMany({ where: { customerRef: { in: ids }, source: SOURCE.code }, select: EXISTING_SELECT });
    const planned = rows.map((r) => {
      const messages: string[] = [];
      const iso = pickupIso(String(r.meetingTime ?? ''), String(r.checkInDate ?? ''));
      if (!iso) messages.push('Không đọc được ngày giờ đón');
      const code = vehicleCode(r.carType ?? '');
      const type = types.find((t) => t.code === code);
      if (!type) messages.push(`Loại xe "${r.carType}" chưa có trong danh mục Loại xe`);
      const service = isAirport(`${r.programName} ${r.route}`) ? 'DON_TIEN_SAN_BAY' : 'THEO_TUYEN';
      if (!services.some((s) => s.code === service)) messages.push(`Chưa có dịch vụ ${service}`);
      const pax = Math.max(1, Math.round(Number(r.totalPax) || Number(r.adult) + Number(r.child) + Number(r.infant) || 1));
      if (type && pax > type.maxPassengers) messages.push(`${pax} khách vượt số chỗ của ${type.name}`);
      const amount = Math.round((Number(r.totalAmount) || 0) * PRICE_UNIT);
      const pick = this.place(String(r.meetingPlace || r.route || ''), locations);
      const drop = this.place(String(r.dropPlace ?? ''), locations);
      if (!pick.address) messages.push('Thiếu điểm đón');
      const pickupIsAirport = isAirport(r.meetingPlace || r.route || '');
      const base = {
        reservationId: r.reservationId.trim(),
        pickupTime: iso,
        pickupAddress: pick.address,
        dropoffAddress: drop.address,
        vehicleType: type?.name ?? r.carType ?? null,
        passengers: pax,
        amount,
        customerName: String(r.customerName ?? '').trim(),
        program: String(r.programName ?? '').trim(),
        flightNumber: r.detail?.flightNumber ?? null,
        hasPhone: !!r.detail?.phone,
      };
      const b = existing.find((x) => x.customerRef === base.reservationId);
      if (b) {
        // Đã nhập: so giờ đón, điểm đón / trả, số khách, loại xe, giá với chuyến đầu của booking
        const t = b.trips[0];
        const diff: string[] = [];
        if (isCancelled(r) && b.status !== BookingStatus.HUY) diff.push('TOTO đã HỦY đơn này – kiểm tra rồi hủy booking');
        if (!isCancelled(r) && b.status === BookingStatus.HUY) diff.push('Booking đã hủy trong phần mềm nhưng vẫn còn trên TOTO');
        if (t && !isCancelled(r)) {
          if (iso && new Date(iso).getTime() !== t.pickupTime.getTime()) diff.push(`Giờ đón: ${fmt(t.pickupTime)} → ${fmt(new Date(iso))}`);
          if (norm(t.pickupAddress) !== norm(pick.address)) diff.push(`Điểm đón: ${t.pickupAddress} → ${pick.address}`);
          if (drop.address && norm(t.dropoffAddress ?? '') !== norm(drop.address)) diff.push(`Điểm trả: ${t.dropoffAddress ?? '—'} → ${drop.address}`);
          if (t.passengers !== pax) diff.push(`Số khách: ${t.passengers} → ${pax}`);
          if (type && t.vehicleTypeId !== type.id) diff.push(`Loại xe → ${type.name}`);
          // So giá TOTO trả (gồm thuế) với tổng booking: chuyến chưa thuế + thuế của booking
          const current = b.invoiceRequired ? grossOf(Number(t.amount), Number(b.vatPercent)) : Number(t.amount);
          if (b.trips.length === 1 && Math.abs(current - amount) > 1) diff.push(`Giá (gồm thuế): ${vnd(current)} → ${vnd(amount)}`);
        }
        const fillOps = b.status === BookingStatus.HUY || isCancelled(r) ? [] : this.fills(b, r, pickupIsAirport, amount, inv);
        const state: RowState = diff.length ? 'CHANGED' : fillOps.length ? 'UPDATE' : 'EXISTS';
        return { ...base, state, messages: diff, fills: fillOps.map((f) => f.label), fillOps, booking: { id: b.id, code: b.code, status: b.status } };
      }
      if (isCancelled(r)) return { ...base, state: 'CANCELLED' as RowState, messages: ['Đơn đã hủy trên TOTO – không nhập'], fills: [], fillOps: [] as Fill[], booking: null };
      return { ...base, state: (messages.length ? 'ERROR' : 'NEW') as RowState, messages, fills: [], fillOps: [] as Fill[], booking: null };
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
    const created: { reservationId: string; id: number; code: string }[] = [];
    const updated: { reservationId: string; code: string; fills: string[] }[] = [];
    const failed: { reservationId: string; message: string }[] = [];

    // Bổ sung (chuyến bay, SĐT, email, yêu cầu) cho booking đã nhập – kể cả booking có thay đổi khác
    for (const p of planned.filter((x) => x.fillOps.length && x.booking)) {
      try {
        await this.prisma.$transaction(async (tx) => {
          for (const f of p.fillOps) {
            if (f.booking) await tx.booking.update({ where: { id: p.booking!.id }, data: f.booking });
            if (f.trip) await tx.bookingTrip.update({ where: { id: f.trip.id }, data: f.trip.data });
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
      const { types, locations } = await this.refs();
      const inv = await this.invoiceInfo();
      for (const p of todo) {
        const r = rows.find((x) => x.reservationId.trim() === p.reservationId)!;
        const d = r.detail ?? null;
        const type = types.find((t) => t.code === vehicleCode(r.carType))!;
        const pick = this.place(String(r.meetingPlace || r.route || ''), locations);
        const drop = this.place(String(r.dropPlace ?? ''), locations);
        const pickupIsAirport = isAirport(r.meetingPlace || r.route || '');
        const nationality = d?.phone ? nationalityFromPhone(d.phone) : null;
        const paxNote = [`Người lớn ${Number(r.adult) || 0}`, Number(r.child) ? `trẻ em ${r.child}` : null, Number(r.infant) ? `em bé ${r.infant}` : null].filter(Boolean).join(', ');
        try {
          const booking = await this.bookings.create(
            {
              customerId,
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
                `Nhập từ ${d ? 'trang chi tiết (PDF)' : 'file Excel'} TOTO Booking · mã đặt chỗ ${p.reservationId}`,
                `Sản phẩm: ${p.program || r.route}`,
                r.additionalOption?.trim() ? `Tùy chọn thêm: ${r.additionalOption.trim()}` : null,
                d?.email ? `Email khách: ${d.email}` : null,
                `Giá TOTO trả (gồm thuế): ${vnd(p.amount)} = ${vnd(netOf(p.amount, inv.vat))} + VAT ${inv.vat}% · xuất hóa đơn cho TOTO, ghi công nợ khách hàng Toto Booking`,
              ]
                .filter(Boolean)
                .join('\n'),
              passengers: p.customerName ? [{ fullName: p.customerName, phone: d?.phone ?? null, nationality }] : [],
              trips: [
                {
                  serviceType: isAirport(`${r.programName} ${r.route}`) ? 'DON_TIEN_SAN_BAY' : 'THEO_TUYEN',
                  pickupTime: p.pickupTime!,
                  pickupAddress: pick.address,
                  pickupLocationId: pick.locationId,
                  dropoffAddress: drop.address || null,
                  dropoffLocationId: drop.locationId,
                  ...(d?.flightNumber && (pickupIsAirport ? { flightNumber: d.flightNumber } : isAirport(r.dropPlace || r.route) ? { departureFlight: d.flightNumber } : {})),
                  passengers: p.passengers,
                  vehicleTypeId: type.id,
                  unitPrice: netOf(p.amount, inv.vat),
                  itinerary: p.program || null,
                  notes: [`TOTO #${p.reservationId} · ${paxNote}`, r.additionalOption?.trim() || null, d?.requestMemo ? `Yêu cầu của khách: ${d.requestMemo}` : null].filter(Boolean).join(' · '),
                },
              ],
            } as unknown as Parameters<BookingsService['create']>[0],
            user,
            BookingStatus.NHAP,
          );
          // Đơn OTA đã xác nhận: chuyển Đã xác nhận (chuyến sắp chạy thì báo điều hành xếp xe)
          await this.bookings.changeStatus(booking.id, { status: BookingStatus.XAC_NHAN }, user);
          created.push({ reservationId: p.reservationId, id: booking.id, code: booking.code });
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
