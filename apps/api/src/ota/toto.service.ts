import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus, TripStatus } from '@prisma/client';
import type { AuthUser } from '../auth/auth.decorators';
import { BookingsService } from '../bookings/bookings.service';
import { PrismaService } from '../prisma/prisma.service';
import { vehicleCode } from '../website/website.service';

/** Một dòng file "Booking List" xuất từ trang nhà cung cấp TOTO Booking (WinWinTravel), trình duyệt đã đọc sẵn */
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
}

/** Mã booking của khách = mã đặt chỗ TOTO (không trùng) */
const REF_PREFIX = 'TOTO-';
const SOURCE = { code: 'TOTO', name: 'TOTO Booking' };
const CUSTOMER_NAME = 'TOTO Booking';
/** Giá trong file tính bằng nghìn đồng */
const PRICE_UNIT = 1000;

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

export type RowState = 'NEW' | 'EXISTS' | 'CHANGED' | 'ERROR';

export interface PlannedRow {
  reservationId: string;
  state: RowState;
  /** Lỗi không nhập được / các thay đổi so với booking đã nhập */
  messages: string[];
  booking?: { id: number; code: string; status: BookingStatus } | null;
  pickupTime: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType: string | null;
  passengers: number;
  amount: number;
  customerName: string;
  program: string;
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
    if (/airport|san bay/.test(n)) {
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

  private validate(rows: TotoRow[]) {
    if (!Array.isArray(rows) || !rows.length) throw new BadRequestException('File không có dòng booking nào');
    if (rows.length > 500) throw new BadRequestException('Mỗi lần nhập tối đa 500 booking');
    for (const r of rows) {
      if (!r || typeof r.reservationId !== 'string' || !/^\w[\w-]{2,40}$/.test(r.reservationId.trim())) throw new BadRequestException('Có dòng thiếu / sai mã đặt chỗ (Reservation ID)');
    }
  }

  /** Xem trước: mỗi dòng là booking mới / đã nhập / đã thay đổi / lỗi; kèm booking TOTO cùng ngày không còn trong file (có thể đã hủy) */
  async preview(rows: TotoRow[]) {
    this.validate(rows);
    const { types, services, locations } = await this.refs();
    const ids = rows.map((r) => REF_PREFIX + r.reservationId.trim());
    const existing = await this.prisma.booking.findMany({
      where: { customerRef: { in: ids } },
      select: { id: true, code: true, status: true, customerRef: true, trips: { where: { status: { not: TripStatus.HUY } }, select: { pickupTime: true, pickupAddress: true, dropoffAddress: true, passengers: true, vehicleTypeId: true, amount: true }, orderBy: { seq: 'asc' } } },
    });
    const planned: PlannedRow[] = rows.map((r) => {
      const messages: string[] = [];
      const iso = pickupIso(String(r.meetingTime ?? ''), String(r.checkInDate ?? ''));
      if (!iso) messages.push('Không đọc được ngày giờ đón');
      const code = vehicleCode(r.carType ?? '');
      const type = types.find((t) => t.code === code);
      if (!type) messages.push(`Loại xe "${r.carType}" chưa có trong danh mục Loại xe`);
      const service = /airport|san bay/.test(norm(`${r.programName} ${r.route}`)) ? 'DON_TIEN_SAN_BAY' : 'THEO_TUYEN';
      if (!services.some((s) => s.code === service)) messages.push(`Chưa có dịch vụ ${service}`);
      const pax = Math.max(1, Math.round(Number(r.totalPax) || Number(r.adult) + Number(r.child) + Number(r.infant) || 1));
      if (type && pax > type.maxPassengers) messages.push(`${pax} khách vượt số chỗ của ${type.name}`);
      const amount = Math.round((Number(r.totalAmount) || 0) * PRICE_UNIT);
      const pick = this.place(String(r.meetingPlace || r.route || ''), locations);
      const drop = this.place(String(r.dropPlace ?? ''), locations);
      if (!pick.address) messages.push('Thiếu điểm đón');
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
      };
      const b = existing.find((x) => x.customerRef === REF_PREFIX + base.reservationId);
      if (b) {
        // Đã nhập: so giờ đón, điểm đón / trả, số khách, loại xe, giá với chuyến đầu của booking
        const t = b.trips[0];
        const diff: string[] = [];
        if (b.status === BookingStatus.HUY) diff.push('Booking đã hủy trong phần mềm nhưng vẫn còn trên TOTO');
        if (t) {
          if (iso && new Date(iso).getTime() !== t.pickupTime.getTime()) diff.push(`Giờ đón: ${fmt(t.pickupTime)} → ${fmt(new Date(iso))}`);
          if (norm(t.pickupAddress) !== norm(pick.address)) diff.push(`Điểm đón: ${t.pickupAddress} → ${pick.address}`);
          if (norm(t.dropoffAddress ?? '') !== norm(drop.address)) diff.push(`Điểm trả: ${t.dropoffAddress ?? '—'} → ${drop.address}`);
          if (t.passengers !== pax) diff.push(`Số khách: ${t.passengers} → ${pax}`);
          if (type && t.vehicleTypeId !== type.id) diff.push(`Loại xe → ${type.name}`);
          if (Number(t.amount) !== amount) diff.push(`Giá: ${vnd(Number(t.amount))} → ${vnd(amount)}`);
        }
        return { ...base, state: diff.length ? 'CHANGED' : 'EXISTS', messages: diff, booking: { id: b.id, code: b.code, status: b.status } } satisfies PlannedRow;
      }
      return { ...base, state: messages.length ? 'ERROR' : 'NEW', messages, booking: null } satisfies PlannedRow;
    });

    // Booking TOTO có ngày đón trong khoảng ngày của file nhưng không còn trong file: có thể TOTO đã hủy
    const days = rows.map((r) => pickupIso(String(r.meetingTime ?? ''), String(r.checkInDate ?? ''))?.slice(0, 10)).filter((d): d is string => !!d).sort();
    let missing: { id: number; code: string; customerRef: string | null; pickupTime: Date | null; contactName: string }[] = [];
    if (days.length) {
      const from = new Date(`${days[0]}T00:00:00+07:00`);
      const to = new Date(new Date(`${days[days.length - 1]}T00:00:00+07:00`).getTime() + 86_400_000);
      const others = await this.prisma.booking.findMany({
        where: { customerRef: { startsWith: REF_PREFIX, notIn: ids }, status: { not: BookingStatus.HUY }, trips: { some: { pickupTime: { gte: from, lt: to }, status: { not: TripStatus.HUY } } } },
        select: { id: true, code: true, customerRef: true, contactName: true, trips: { select: { pickupTime: true }, orderBy: { seq: 'asc' }, take: 1 } },
      });
      missing = others.map((o) => ({ id: o.id, code: o.code, customerRef: o.customerRef, contactName: o.contactName, pickupTime: o.trips[0]?.pickupTime ?? null }));
    }
    return {
      rows: planned,
      missing,
      range: days.length ? { from: days[0], to: days[days.length - 1] } : null,
      counts: { new: planned.filter((r) => r.state === 'NEW').length, exists: planned.filter((r) => r.state === 'EXISTS').length, changed: planned.filter((r) => r.state === 'CHANGED').length, error: planned.filter((r) => r.state === 'ERROR').length },
    };
  }

  /** Khách hàng "TOTO Booking" (đại lý) và nguồn khách "TOTO Booking": tạo ở lần nhập đầu */
  private async ensureCustomer() {
    await this.prisma.customerSource.upsert({ where: { code: SOURCE.code }, update: {}, create: { code: SOURCE.code, name: SOURCE.name, sortOrder: 50 } });
    const found = await this.prisma.customer.findFirst({ where: { name: CUSTOMER_NAME }, select: { id: true } });
    if (found) return found.id;
    const agent = await this.prisma.customerKind.findFirst({ where: { isAgent: true }, orderBy: { sortOrder: 'asc' }, select: { code: true } });
    const c = await this.prisma.customer.create({
      data: { name: CUSTOMER_NAME, type: agent?.code ?? 'KHACH_LE', notes: 'Đại lý OTA (WinWinTravel). Booking nhập từ file Excel của trang nhà cung cấp; giá = giá TOTO trả cho công ty.' },
    });
    return c.id;
  }

  /** Nhập các booking mới (đã xác nhận, ghi công nợ khách hàng TOTO Booking) */
  async import(rows: TotoRow[], user: AuthUser) {
    const plan = await this.preview(rows);
    const todo = plan.rows.filter((r) => r.state === 'NEW');
    if (!todo.length) return { created: [], failed: [], ...plan.counts };
    const customerId = await this.ensureCustomer();
    const { types, locations } = await this.refs();
    const created: { reservationId: string; id: number; code: string }[] = [];
    const failed: { reservationId: string; message: string }[] = [];
    for (const p of todo) {
      const r = rows.find((x) => x.reservationId.trim() === p.reservationId)!;
      const type = types.find((t) => t.code === vehicleCode(r.carType))!;
      const pick = this.place(String(r.meetingPlace || r.route || ''), locations);
      const drop = this.place(String(r.dropPlace ?? ''), locations);
      const paxNote = [`Người lớn ${Number(r.adult) || 0}`, Number(r.child) ? `trẻ em ${r.child}` : null, Number(r.infant) ? `em bé ${r.infant}` : null].filter(Boolean).join(', ');
      try {
        const booking = await this.bookings.create(
          {
            customerId,
            customerRef: REF_PREFIX + p.reservationId,
            source: SOURCE.code,
            contactName: p.customerName || CUSTOMER_NAME,
            contactPhone: '',
            signTitle: p.customerName || null,
            internalNotes: [
              `Nhập từ file TOTO Booking · mã đặt chỗ ${p.reservationId}`,
              `Sản phẩm: ${p.program || r.route}`,
              r.additionalOption?.trim() ? `Tùy chọn thêm: ${r.additionalOption.trim()}` : null,
              `Giá TOTO trả: ${vnd(p.amount)} (ghi công nợ khách hàng TOTO Booking)`,
            ]
              .filter(Boolean)
              .join('\n'),
            passengers: p.customerName ? [{ fullName: p.customerName }] : [],
            trips: [
              {
                serviceType: /airport|san bay/.test(norm(`${r.programName} ${r.route}`)) ? 'DON_TIEN_SAN_BAY' : 'THEO_TUYEN',
                pickupTime: p.pickupTime!,
                pickupAddress: pick.address,
                pickupLocationId: pick.locationId,
                dropoffAddress: drop.address || null,
                dropoffLocationId: drop.locationId,
                passengers: p.passengers,
                vehicleTypeId: type.id,
                unitPrice: p.amount,
                itinerary: p.program || null,
                notes: `TOTO #${p.reservationId} · ${paxNote}${r.additionalOption?.trim() ? ` · ${r.additionalOption.trim()}` : ''}`,
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
    return { created, failed, ...plan.counts };
  }
}

const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`;
/** 23:50 20/10 (giờ Việt Nam) */
const fmt = (d: Date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute} ${p.day}/${p.month}`;
};
