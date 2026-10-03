import dayjs from 'dayjs';
import { formatVnd } from './components/common';
import { SERVICE_TYPE } from './labels';
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
  };
}

/** Bỏ các trường chỉ dùng trên giao diện trước khi gửi API */
export function toTripPayload({ key: _k, status: _s, vehicleTypeName: _v, ...t }: TripDraft) {
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

export const routeText = (t: Pick<TripDraft, 'pickupAddress' | 'dropoffAddress'>) =>
  t.dropoffAddress ? `${t.pickupAddress} → ${t.dropoffAddress}` : t.pickupAddress;

/** Nội dung báo giá dạng chữ để dán vào Zalo / email */
export function buildQuoteText(b: Booking, s: Settings) {
  const vnd = (v: number | string) => `${formatVnd(v)}đ`;
  const lines: string[] = [];
  lines.push(`BÁO GIÁ DỊCH VỤ XE${s.companyName ? ` – ${s.companyName}` : ''}`);
  lines.push(`Mã: ${b.code} | Ngày: ${dayjs().format('DD/MM/YYYY')}`);
  lines.push(`Kính gửi: ${b.customer?.name ?? b.contactName} – ${b.contactPhone}`);
  lines.push('');

  b.trips
    .filter((t) => t.status !== 'HUY')
    .forEach((t, i) => {
      lines.push(`${i + 1}) ${SERVICE_TYPE[t.serviceType].label} – ${fmtTime(t.pickupTime)}`);
      lines.push(`   ${routeText(t)}${t.flightNumber ? ` (chuyến bay ${t.flightNumber})` : ''}`);
      lines.push(`   ${t.vehicleType.name} – ${t.passengers} khách${t.days > 1 ? ` – ${t.days} ngày` : ''}`);
      if (t.itinerary) lines.push(`   Lịch trình: ${t.itinerary.replace(/\n/g, '; ')}`);
      lines.push(`   Giá: ${vnd(t.unitPrice)}`);
      for (const sc of t.surcharges ?? []) lines.push(`   + ${sc.name}: ${vnd(sc.amount)}`);
      if ((t.surcharges ?? []).length) lines.push(`   Thành tiền: ${vnd(t.amount)}`);
      lines.push('');
    });

  if (Number(b.discountAmount) || Number(b.vatPercent)) lines.push(`Tạm tính: ${vnd(b.subtotal)}`);
  if (Number(b.discountAmount)) lines.push(`Giảm giá: -${vnd(b.discountAmount)}`);
  if (Number(b.vatPercent)) lines.push(`VAT ${Number(b.vatPercent)}%: ${vnd(b.vatAmount)}`);
  lines.push(`TỔNG CỘNG: ${vnd(b.total)}`);
  if (Number(b.depositAmount)) lines.push(`Đặt cọc: ${vnd(b.depositAmount)} – Còn lại: ${vnd(b.remaining)}`);
  if (b.quoteValidUntil) lines.push(`Báo giá có hiệu lực đến ${dayjs(b.quoteValidUntil).format('DD/MM/YYYY')}`);

  for (const extra of [b.notes, s.quoteFooter, s.bankInfo && `Chuyển khoản: ${s.bankInfo}`, s.companyPhone && `Hotline: ${s.companyPhone}`]) {
    if (extra) lines.push('', extra);
  }
  return lines.join('\n');
}
