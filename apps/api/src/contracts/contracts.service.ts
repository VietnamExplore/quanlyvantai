import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TripStatus } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { bookingTotals } from '../bookings/bookings.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AcceptContractDto, SaveContractDto } from './contracts.dto';

/** Thông tin công ty in trên hợp đồng / lệnh vận chuyển */
const COMPANY_KEYS = [
  'companyName',
  'companyAddress',
  'companyPhone',
  'companyEmail',
  'companyTaxCode',
  'companyWebsite',
  'companyLogo',
  'companyRepresentative',
  'companyRepresentativeTitle',
  'companyRepresentativeId',
  'companyTransportLicense',
  'companyHotline',
  'bankInfo',
  'contractTerms',
  'contractTerms_en',
];

/**
 * Đường dẫn lệnh vận chuyển điện tử (không cần đăng nhập) cho lái xe xuất trình: /e/lvc/trip|run/:id/:chữ ký.
 * Chữ ký HMAC theo khóa bí mật của máy chủ nên không đoán được đường dẫn của chuyến khác.
 */
export type OrderKind = 'trip' | 'run';
export const orderSig = (kind: OrderKind, id: number) =>
  createHmac('sha256', process.env.JWT_SECRET ?? 'transfer').update(`lvc:${kind}:${id}`).digest('base64url').slice(0, 22);
export const orderPath = (kind: OrderKind, id: number) => `/e/lvc/${kind}/${id}/${orderSig(kind, id)}`;
export function checkOrderSig(kind: string, id: number, sig: string) {
  if (kind !== 'trip' && kind !== 'run') return false;
  const want = Buffer.from(orderSig(kind, id));
  const got = Buffer.from(sig ?? '');
  return want.length === got.length && timingSafeEqual(want, got);
}

const pad = (n: number, len = 4) => String(n).padStart(len, '0');
/** Số hợp đồng: 0001/2026/HĐVC */
const contractNumber = (seq: number, year: number) => `${pad(seq)}/${year}/HĐVC`;

const tripSelect = {
  id: true,
  seq: true,
  status: true,
  serviceType: true,
  pickupTime: true,
  endTime: true,
  pickupAddress: true,
  dropoffAddress: true,
  itinerary: true,
  passengers: true,
  days: true,
  distanceKm: true,
  shuttleRunId: true,
  routePrice: { select: { name: true, distanceKm: true } },
  service: { select: { name: true } },
  vehicleType: { select: { name: true, seats: true } },
  vehicle: { select: { plateNumber: true } },
  driver: { select: { fullName: true, phone: true } },
  partnerPlate: true,
  partnerDriverName: true,
  partnerDriverPhone: true,
} satisfies Prisma.BookingTripSelect;

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async company() {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: COMPANY_KEYS } } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
  }

  /** Toàn bộ dữ liệu in hợp đồng + phụ lục danh sách hành khách của một booking */
  private async docData(bookingId: number) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: { select: { name: true, phone: true, email: true, taxCode: true, address: true, type: true } },
        passengers: { orderBy: { seq: 'asc' }, select: { seq: true, fullName: true, birthYear: true, note: true } },
        trips: { orderBy: { seq: 'asc' }, select: { ...tripSelect, amount: true } },
        contract: true,
      },
    });
    if (!b) throw new NotFoundException('Không tìm thấy booking');
    const totals = bookingTotals(b);
    const active = b.trips.filter((t) => t.status !== TripStatus.HUY);
    // Xe ghép (bán vé từng chỗ) không thuộc hợp đồng thuê xe: NĐ 158/2024 cấm xe hợp đồng bán vé, gom khách lẻ
    const trips = active
      .filter((t) => !t.shuttleRunId)
      .map(({ amount: _a, routePrice, ...t }) => ({ ...t, routeName: routePrice?.name ?? null, distanceKm: t.distanceKm ?? routePrice?.distanceKm ?? null }));
    return {
      booking: {
        id: b.id,
        code: b.code,
        status: b.status,
        docLanguage: b.docLanguage,
        customerRef: b.customerRef,
        contactName: b.contactName,
        contactPhone: b.contactPhone,
        leaderRole: b.leaderRole,
        leaderName: b.leaderName,
        leaderPhone: b.leaderPhone,
        customer: b.customer,
        invoiceRequired: b.invoiceRequired,
        vatPercent: Number(b.vatPercent),
        depositAmount: Number(b.depositAmount),
        invoiceCompany: b.invoiceCompany,
        invoiceTaxCode: b.invoiceTaxCode,
        invoiceAddress: b.invoiceAddress,
        taxable: totals.taxable,
        vatAmount: totals.vatAmount,
        total: totals.total,
      },
      trips,
      shuttleTrips: active.length - trips.length,
      passengers: b.passengers,
      contract: b.contract,
    };
  }

  /**
   * Văn phòng xem hợp đồng, kèm bản nháp Bên A (điền khi lập mới, hoặc bấm "Lấy lại thông tin"):
   * - Booking nguồn OTA: khách đặt qua sàn, công ty không có hồ sơ khách hàng → lấy từ danh sách hành khách
   *   (trưởng đoàn nếu có trong danh sách, không thì hành khách đầu tiên).
   * - Nguồn khác: lấy từ hồ sơ khách hàng (thông tin xuất hóa đơn của booking được ưu tiên); khách lẻ chưa có hồ sơ → người liên hệ.
   */
  async forBooking(bookingId: number) {
    const [data, company, extra] = await Promise.all([
      this.docData(bookingId),
      this.company(),
      this.prisma.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: {
          source: true,
          customer: {
            select: {
              name: true, phone: true, email: true, taxCode: true, address: true, idNumber: true,
              representative: true, representativeTitle: true, representativeIdNumber: true, bankAccount: true,
            },
          },
          passengers: { orderBy: { seq: 'asc' }, select: { fullName: true, idNumber: true, phone: true, nationality: true } },
        },
      }),
    ]);
    const b = data.booking;
    const base = { signedDate: new Date(), paymentMethod: 'Chuyển khoản hoặc tiền mặt' };
    let draft: Record<string, unknown>;
    let draftSource: 'OTA' | 'CUSTOMER' | 'CONTACT';
    const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
    if (extra.source === 'OTA' && extra.passengers.length) {
      const p = extra.passengers.find((x) => b.leaderName && norm(x.fullName) === norm(b.leaderName)) ?? extra.passengers[0];
      draftSource = 'OTA';
      draft = {
        ...base,
        hirerName: p.fullName,
        hirerIdNumber: p.idNumber,
        hirerPhone: p.phone || b.leaderPhone || b.contactPhone,
        hirerAddress: p.nationality ? `Quốc tịch: ${p.nationality}` : null,
      };
    } else if (extra.customer) {
      const c = extra.customer;
      draftSource = 'CUSTOMER';
      draft = {
        ...base,
        hirerName: b.invoiceCompany || c.name,
        hirerTaxCode: b.invoiceTaxCode || c.taxCode,
        hirerAddress: b.invoiceAddress || c.address,
        hirerPhone: c.phone || b.contactPhone,
        hirerEmail: c.email,
        hirerIdNumber: c.idNumber,
        hirerRepresentative: c.representative,
        hirerPosition: c.representativeTitle,
        hirerRepIdNumber: c.representativeIdNumber,
        hirerBank: c.bankAccount,
      };
    } else {
      draftSource = 'CONTACT';
      draft = { ...base, hirerName: b.invoiceCompany || b.contactName, hirerTaxCode: b.invoiceTaxCode, hirerAddress: b.invoiceAddress, hirerPhone: b.contactPhone };
    }
    return { ...data, company, draft, draftSource };
  }

  async save(bookingId: number, dto: SaveContractDto, userId: number) {
    const data = await this.docData(bookingId);
    if (data.booking.status === 'HUY') throw new BadRequestException('Booking đã hủy, không lập hợp đồng');
    if (!data.trips.length) throw new BadRequestException('Booking chưa có chuyến thuê xe nào (chuyến xe ghép không lập hợp đồng thuê xe)');
    const { trips: tripKm, ...fields } = dto;
    const signedDate = new Date(fields.signedDate);
    const body = {
      ...fields,
      signedDate,
      hirerName: fields.hirerName.trim(),
    };

    return this.prisma.$transaction(async (tx) => {
      // Cự ly từng chuyến (km) in trên hợp đồng
      for (const t of tripKm ?? []) {
        if (!data.trips.some((x) => x.id === t.id)) continue;
        await tx.bookingTrip.update({ where: { id: t.id }, data: { distanceKm: t.distanceKm ?? null } });
      }
      const cur = data.contract;
      if (cur) {
        const changed = (Object.keys(body) as (keyof typeof body)[]).some((k) =>
          k === 'signedDate' ? +cur.signedDate !== +signedDate : (cur[k] ?? null) !== (body[k] ?? null),
        );
        return tx.transportContract.update({
          where: { id: cur.id },
          // Sửa nội dung sau khi khách đã xác nhận: khách phải xác nhận lại
          data: { ...body, ...(changed && cur.acceptedAt && { acceptedAt: null, acceptedName: null, acceptedIp: null }) },
        });
      }
      const year = signedDate.getFullYear();
      const max = await tx.transportContract.aggregate({ where: { year }, _max: { seq: true } });
      const seq = (max._max.seq ?? 0) + 1;
      return tx.transportContract.create({
        data: {
          ...body,
          bookingId,
          year,
          seq,
          number: contractNumber(seq, year),
          token: randomBytes(18).toString('base64url'),
          createdById: userId,
        },
      });
    });
  }

  /** Bản hợp đồng điện tử (không cần đăng nhập, mở bằng mã bí mật): cho lái xe xuất trình, khách xem và xác nhận */
  async byToken(token: string) {
    const c = await this.prisma.transportContract.findUnique({ where: { token }, select: { bookingId: true } });
    if (!c) throw new NotFoundException('Không tìm thấy hợp đồng');
    const [data, company] = await Promise.all([this.docData(c.bookingId), this.company()]);
    const { id: _id, customer, ...booking } = data.booking;
    return { ...data, booking: { ...booking, customer: customer && { name: customer.name } }, company };
  }

  async accept(token: string, dto: AcceptContractDto, ip: string | null) {
    const c = await this.prisma.transportContract.findUnique({ where: { token } });
    if (!c) throw new NotFoundException('Không tìm thấy hợp đồng');
    if (c.acceptedAt) return { acceptedAt: c.acceptedAt, acceptedName: c.acceptedName };
    const r = await this.prisma.transportContract.update({
      where: { id: c.id },
      data: { acceptedAt: new Date(), acceptedName: dto.name.trim(), acceptedIp: ip?.slice(0, 64) ?? null },
    });
    return { acceptedAt: r.acceptedAt, acceptedName: r.acceptedName };
  }

  /** Mã hợp đồng điện tử của các chuyến (cho app lái xe / cổng nhà xe) */
  async tokensForBookings(bookingIds: number[]) {
    const rows = await this.prisma.transportContract.findMany({ where: { bookingId: { in: bookingIds } }, select: { bookingId: true, token: true, number: true } });
    return new Map(rows.map((r) => [r.bookingId, r]));
  }

  // ───── Lệnh vận chuyển (TT 36/2024 Phụ lục IV) ─────

  /** Lệnh vận chuyển một chuyến thuê xe */
  async tripOrder(tripId: number) {
    const t = await this.prisma.bookingTrip.findUnique({
      where: { id: tripId },
      select: {
        ...tripSelect,
        driver: { select: { fullName: true, phone: true, licenseClass: true } },
        partner: { select: { name: true } },
        dispatchNote: true,
        signoffName: true,
        signoffAt: true,
        signoffSvg: true,
        signoffNote: true,
        booking: {
          select: {
            id: true,
            code: true,
            contactName: true,
            contactPhone: true,
            contract: { select: { number: true, signedDate: true, token: true } },
          },
        },
      },
    });
    if (!t) throw new NotFoundException('Không tìm thấy chuyến');
    if (t.shuttleRunId) throw new BadRequestException('Chuyến xe ghép: in lệnh vận chuyển theo cả chuyến ghép ở trang Xe ghép');
    const company = await this.company();
    const { routePrice, ...trip } = t;
    return {
      kind: 'TRIP' as const,
      number: `${t.booking.code}-${t.seq}`,
      company,
      trip: { ...trip, routeName: routePrice?.name ?? null, distanceKm: t.distanceKm ?? routePrice?.distanceKm ?? null },
    };
  }

  /** Lệnh vận chuyển một chuyến xe ghép (cả xe) */
  async runOrder(runId: number) {
    const r = await this.prisma.shuttleRun.findUnique({
      where: { id: runId },
      include: {
        route: { include: { stops: { where: { isActive: true }, orderBy: { seq: 'asc' } } } },
        vehicleType: { select: { name: true, seats: true } },
        vehicle: { select: { plateNumber: true } },
        driver: { select: { fullName: true, phone: true, licenseClass: true } },
        partner: { select: { name: true } },
        trips: {
          where: { status: { not: TripStatus.HUY }, booking: { status: { in: ['XAC_NHAN', 'HOAN_THANH'] } } },
          select: { passengers: true },
        },
      },
    });
    if (!r) throw new NotFoundException('Không tìm thấy chuyến xe ghép');
    const company = await this.company();
    const ymd = new Date(r.departAt.getTime() + 7 * 3600_000).toISOString().slice(2, 10).replace(/-/g, '');
    return {
      kind: 'RUN' as const,
      number: `XG${ymd}-${pad(r.id, 3)}`,
      company,
      run: {
        id: r.id,
        departAt: r.departAt,
        arriveAt: new Date(r.departAt.getTime() + r.route.durationMinutes * 60_000),
        route: { code: r.route.code, name: r.route.name, stops: r.route.stops.map((s) => s.name) },
        capacity: r.capacity,
        vehicleType: r.vehicleType,
        plate: r.vehicle?.plateNumber ?? r.partnerPlate,
        driver: r.driver ?? (r.partnerDriverName ? { fullName: r.partnerDriverName, phone: r.partnerDriverPhone, licenseClass: null } : null),
        partner: r.partner,
        passengers: r.trips.reduce((s, x) => s + x.passengers, 0),
        note: [r.note, r.dispatchNote].filter(Boolean).join(' · ') || null,
      },
    };
  }
}
