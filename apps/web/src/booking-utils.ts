import dayjs from 'dayjs';
import { docCompany, docDate, docFooter, docMoney, docServiceName, docT, docTime, docVehicleName, toDocLang, localizeBooking, type DocLang } from './doc-i18n';
import type { Booking, BookingTrip, PriceLine, ServiceType, Settings, TripStatus } from './types';

/** Chuyến đang soạn trên form (chưa lưu hoặc đã lưu) */
export interface TripDraft {
  key: string;
  id?: number;
  status?: TripStatus;
  serviceType: ServiceType;
  pickupTime: string;
  endTime: string | null;
  pickupLocationId: number | null;
  pickupAddress: string;
  dropoffLocationId: number | null;
  dropoffAddress: string | null;
  flightNumber: string | null;
  departureFlight: string | null;
  collectAmount?: number | null;
  collectNote?: string | null;
  passengers: number;
  vehicleTypeId: number;
  vehicleTypeName?: string;
  routePriceId: number | null;
  days: number;
  extraKm: number;
  extraHours: number;
  unitPrice: number;
  surcharges: PriceLine[];
  estimatedCost: number | null;
  itinerary: string | null;
  notes: string | null;
  /** Xe / nhà xe đã gán (chỉ để hiển thị) */
  assignment?: string;
}

export const newKey = () => Math.random().toString(36).slice(2);

export const tripAmount = (t: Pick<TripDraft, 'unitPrice' | 'surcharges'>) =>
  Number(t.unitPrice || 0) + (t.surcharges ?? []).reduce((s, x) => s + Number(x.amount || 0), 0);

export function fromTrip(t: BookingTrip): TripDraft {
  return {
    key: newKey(),
    id: t.id,
    status: t.status,
    serviceType: t.serviceType,
    pickupTime: t.pickupTime,
    endTime: t.endTime,
    pickupLocationId: t.pickupLocationId,
    pickupAddress: t.pickupAddress,
    dropoffLocationId: t.dropoffLocationId,
    dropoffAddress: t.dropoffAddress,
    flightNumber: t.flightNumber,
    departureFlight: t.departureFlight,
    collectAmount: t.collectAmount ? Number(t.collectAmount) : null,
    collectNote: t.collectNote ?? null,
    passengers: t.passengers,
    vehicleTypeId: t.vehicleTypeId,
    vehicleTypeName: t.vehicleType.name,
    routePriceId: t.routePriceId,
    days: t.days,
    extraKm: t.extraKm,
    extraHours: t.extraHours,
    unitPrice: Number(t.unitPrice),
    surcharges: t.surcharges ?? [],
    estimatedCost: t.estimatedCost === null ? null : Number(t.estimatedCost),
    itinerary: t.itinerary,
    notes: t.notes,
    assignment: t.vehicle
      ? `${t.vehicle.plateNumber}${t.driver ? ` · ${t.driver.fullName}` : ''}`
      : t.partner
        ? t.partner.name
        : undefined,
  };
}

/** Bỏ các trường chỉ dùng trên giao diện trước khi gửi API */
export function toTripPayload({ key: _k, status: _s, vehicleTypeName: _v, assignment: _a, ...t }: TripDraft) {
  return t;
}

export function computeTotals(trips: TripDraft[], discount: number, vatPercent: number, deposit: number) {
  const subtotal = trips.filter((t) => t.status !== 'HUY').reduce((s, t) => s + tripAmount(t), 0);
  const taxable = Math.max(0, subtotal - (discount || 0));
  const vatAmount = Math.round((taxable * (vatPercent || 0)) / 100);
  const total = taxable + vatAmount;
  const cost = trips.filter((t) => t.status !== 'HUY').reduce((s, t) => s + (t.estimatedCost ?? 0), 0);
  const missingCost = trips.filter((t) => t.status !== 'HUY' && t.estimatedCost === null).length;
  // Lợi nhuận tính trên doanh thu chưa VAT
  return { subtotal, vatAmount, total, remaining: total - (deposit || 0), cost, profit: taxable - cost, missingCost };
}

export const fmtTime = (iso: string) => dayjs(iso).format('HH:mm dd DD/MM/YYYY');

/** Số hiệu chuyến bay đón / tiễn của chuyến: "Đón VN123 · Tiễn VJ636" (rỗng nếu không có) */
export function flightText(t: { flightNumber?: string | null; departureFlight?: string | null }, arrival = 'Đón', departure = 'Tiễn') {
  return [t.flightNumber && `${arrival} ${t.flightNumber}`, t.departureFlight && `${departure} ${t.departureFlight}`].filter(Boolean).join(' · ');
}

export const routeText =(t: Pick<TripDraft, 'pickupAddress' | 'dropoffAddress'>) =>
  t.dropoffAddress ? `${t.pickupAddress} → ${t.dropoffAddress}` : t.pickupAddress;

/** Nhân viên báo giá: NV kinh doanh phụ trách, chưa gán thì người tạo booking */
export const quoteStaff = (b: Pick<Booking, 'salesUser' | 'createdBy'>) => b.salesUser ?? b.createdBy;

/** Nội dung báo giá dạng chữ để dán vào Zalo / email, theo ngôn ngữ giấy tờ */
export function buildQuoteText(raw: Booking, s: Settings, lang: DocLang = toDocLang(raw.docLanguage)) {
  const b = localizeBooking(raw, lang);
  const t = docT(lang);
  const money = (v: number | string) => docMoney(v, lang);
  const lines: string[] = [];
  lines.push(`${t('quoteTextTitle')}${docCompany(s, lang, 'companyName') ? ` – ${docCompany(s, lang, 'companyName')}` : ''}`);
  lines.push(
    `${t('no')}: ${b.code}${b.customerRef ? ` | ${t('yourRef')}: ${b.customerRef}` : ''} | ${t('date')}: ${docDate(dayjs(), lang)}`,
  );
  lines.push(`${t('to')}: ${b.customer?.name ?? b.contactName} – ${b.contactPhone}`);
  lines.push('');

  b.trips
    .filter((x) => x.status !== 'HUY')
    .forEach((x, i) => {
      lines.push(`${i + 1}) ${docServiceName(x.service, x.serviceType, lang)} – ${docTime(x.pickupTime, lang)}`);
      const fl = flightText(x, t('arrivalFlight'), t('departureFlight'));
      lines.push(`   ${routeText(x)}${fl ? ` (${fl})` : ''}`);
      lines.push(`   ${docVehicleName(x.vehicleType, lang)} – ${x.passengers} ${t('pax')}${x.days > 1 ? ` – ${x.days} ${t('days')}` : ''}`);
      if (x.itinerary) lines.push(`   ${t('itinerary')}: ${x.itinerary.replace(/\n/g, '; ')}`);
      lines.push(`   ${t('price')}: ${money(x.unitPrice)}`);
      for (const sc of x.surcharges ?? []) lines.push(`   + ${sc.name}: ${money(sc.amount)}`);
      if ((x.surcharges ?? []).length) lines.push(`   ${t('lineTotal')}: ${money(x.amount)}`);
      lines.push('');
    });

  if (Number(b.discountAmount) || Number(b.vatPercent)) lines.push(`${t('subtotal')}: ${money(b.subtotal)}`);
  if (Number(b.discountAmount)) lines.push(`${t('discount')}: -${money(b.discountAmount)}`);
  if (Number(b.vatPercent)) lines.push(`${t('vat')} ${Number(b.vatPercent)}%: ${money(b.vatAmount)}`);
  lines.push(`${t('grandTotal')}: ${money(b.total)}`);
  if (Number(b.depositAmount)) lines.push(`${t('deposit')}: ${money(b.depositAmount)} – ${t('balance')}: ${money(b.remaining)}`);
  if (b.quoteValidUntil) lines.push(`${t('validUntil')} ${docDate(b.quoteValidUntil, lang)}`);

  for (const extra of [b.notes, docFooter(s, lang), docCompany(s, lang, 'bankInfo') && `${t('bankText')}: ${docCompany(s, lang, 'bankInfo')}`]) {
    if (extra) lines.push('', extra);
  }

  // Liên hệ: nhân viên báo giá + SĐT, kèm hotline công ty
  const staff = quoteStaff(b);
  lines.push('', `${t('quoteStaff')}: ${staff.fullName}${staff.phone ? ` – ${staff.phone}` : ''}`);
  if (s.companyPhone && s.companyPhone !== staff.phone) lines.push(`${t('hotline')}: ${s.companyPhone}`);
  return lines.join('\n');
}
