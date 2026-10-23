import type { PrismaService } from '../prisma/prisma.service';
import { partnerSafe } from '../common/partner-safe';

/**
 * Nội dung email gửi nhà xe đối tác: lệnh điều xe (chuyến lẻ) / giao khách xe ghép (cả chuyến).
 * Chỉ thông tin nhà xe được xem: không có tên / mã kênh bán, công ty / đại lý đặt, giấy tờ tùy thân của khách.
 */

const vn = (d: Date, withDate = true) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', ...(withDate && { day: '2-digit', month: '2-digit', year: 'numeric' }), hour12: false }).format(d);
const vnd = (v: unknown) => `${Number(v ?? 0).toLocaleString('vi-VN')}đ`;
const GENDER: Record<string, string> = { NAM: 'Nam', NU: 'Nữ' };
const LEADER: Record<string, string> = { HDV: 'Hướng dẫn viên', TRUONG_DOAN: 'Trưởng đoàn' };

type Pax = { fullName: string; gender: string | null; birthYear: number | null; nationality: string | null; phone: string | null };
const paxLine = (p: Pax) => [p.fullName, p.gender && GENDER[p.gender], p.birthYear, p.nationality, p.phone].filter(Boolean).join(' · ');

const bookingSelect = {
  code: true,
  contactName: true,
  contactPhone: true,
  customerRef: true,
  leaderRole: true,
  leaderName: true,
  leaderPhone: true,
  signTitle: true,
  signSubtitle: true,
  customer: { select: { name: true } },
  passengers: { select: { fullName: true, gender: true, birthYear: true, nationality: true, phone: true }, orderBy: { seq: 'asc' as const } },
} as const;

type MailBooking = {
  contactName: string;
  contactPhone: string;
  leaderName: string | null;
  leaderPhone: string | null;
  customer: { name: string } | null;
  passengers: Pax[];
};

/** Người để nhà xe gọi đón: trưởng đoàn / HDV → khách đi có SĐT → người đặt (khi không phải công ty / đại lý) */
function guestContact(b: MailBooking) {
  if (b.leaderPhone) return { name: b.leaderName, phone: b.leaderPhone };
  const p = b.passengers.find((x) => x.phone);
  if (p) return { name: p.fullName, phone: p.phone };
  const ownerIsCustomer = !!b.customer && b.contactName.trim().toLowerCase() === b.customer.name.trim().toLowerCase();
  // Giống cổng nhà xe (partner-portal.controller clean())
  return !ownerIsCustomer && b.contactPhone ? { name: b.contactName, phone: b.contactPhone } : null;
}

/** Lệnh điều xe một chuyến (giao nhà xe / thay đổi chuyến) */
export async function partnerTripText(prisma: PrismaService, tripId: number) {
  const t = await prisma.bookingTrip.findUnique({
    where: { id: tripId },
    select: {
      seq: true,
      days: true,
      pickupTime: true,
      endTime: true,
      pickupAddress: true,
      dropoffAddress: true,
      flightNumber: true,
      departureFlight: true,
      passengers: true,
      childCount: true,
      itinerary: true,
      notes: true,
      dispatchNote: true,
      partnerCost: true,
      partnerInvoice: true,
      partnerVatPercent: true,
      service: { select: { name: true } },
      vehicleType: { select: { name: true } },
      shuttleRun: { select: { departAt: true, route: { select: { name: true } } } },
      shuttlePickupStop: { select: { name: true } },
      shuttleDropoffStop: { select: { name: true } },
      booking: { select: bookingSelect },
    },
  });
  if (!t) return '';
  const b = t.booking;
  const hide = [b.customerRef, b.customer?.name];
  const dropoff = t.dropoffAddress || t.shuttleDropoffStop?.name;
  const lines = [
    `LỆNH ĐIỀU XE – ${b.code} · chuyến ${t.seq}`,
    `Dịch vụ: ${t.service.name}${t.days > 1 ? ` (${t.days} ngày)` : ''}`,
    `Giờ đón: ${vn(t.pickupTime)}${t.endTime ? ` (dự kiến xong ${vn(t.endTime)})` : ''}`,
    `Điểm đón: ${partnerSafe(t.pickupAddress, hide) ?? t.pickupAddress}`,
  ];
  if (dropoff) lines.push(`Điểm trả: ${partnerSafe(dropoff, hide) ?? dropoff}`);
  if (t.flightNumber) lines.push(`Chuyến bay đón: ${t.flightNumber}`);
  if (t.departureFlight) lines.push(`Chuyến bay tiễn: ${t.departureFlight}`);
  lines.push(`Số khách: ${t.passengers}${t.childCount ? ` (${t.childCount} trẻ em)` : ''} · Loại xe: ${t.vehicleType.name}`);
  if (t.shuttleRun) lines.push(`Xe ghép: ${t.shuttleRun.route.name} · khởi hành ${vn(t.shuttleRun.departAt)}${t.shuttlePickupStop ? ` · đón tại ${t.shuttlePickupStop.name}` : ''}`);
  const c = guestContact(b);
  if (b.leaderName || b.leaderPhone) lines.push(`${LEADER[b.leaderRole ?? ''] ?? 'Người liên hệ'}: ${[b.leaderName, b.leaderPhone].filter(Boolean).join(' – ')}`);
  else if (c) lines.push(`Liên hệ đón khách: ${[c.name, c.phone].filter(Boolean).join(' – ')}`);
  else lines.push('Liên hệ đón khách: liên hệ văn phòng điều hành');
  if (b.signTitle) lines.push(`Bảng đón: ${b.signTitle}${b.signSubtitle ? ` – ${b.signSubtitle}` : ''}`);
  if (b.passengers.length) {
    lines.push('', `Danh sách khách (${b.passengers.length}):`);
    b.passengers.forEach((p, i) => lines.push(`${i + 1}. ${paxLine(p)}`));
  }
  const itinerary = partnerSafe(t.itinerary, hide);
  const notes = partnerSafe(t.notes, hide);
  const dispatchNote = partnerSafe(t.dispatchNote, hide);
  if (itinerary) lines.push('', `Lịch trình:\n${itinerary}`);
  if (notes) lines.push(`Ghi chú: ${notes}`);
  if (dispatchNote) lines.push(`Lưu ý điều hành: ${dispatchNote}`);
  if (t.partnerCost !== null) {
    lines.push('', `Giá thuê: ${vnd(t.partnerCost)} (chưa thuế)${t.partnerInvoice ? ` · yêu cầu xuất hóa đơn VAT ${Number(t.partnerVatPercent)}%` : ''}`);
  }
  return lines.join('\n');
}

/** Giao khách xe ghép cả chuyến: khách theo điểm đón (mã booking, liên hệ, hành trình, danh sách khách), giá */
export async function partnerRunText(prisma: PrismaService, runId: number) {
  const run = await prisma.shuttleRun.findUnique({
    where: { id: runId },
    select: { departAt: true, partnerCost: true, partnerPricePerPax: true, dispatchNote: true, route: { select: { name: true } } },
  });
  if (!run) return '';
  const trips = await prisma.bookingTrip.findMany({
    where: { shuttleRunId: runId, status: { not: 'HUY' }, booking: { status: { in: ['XAC_NHAN', 'HOAN_THANH'] } } },
    select: {
      pickupTime: true,
      pickupAddress: true,
      dropoffAddress: true,
      passengers: true,
      childCount: true,
      flightNumber: true,
      departureFlight: true,
      shuttlePickupStop: { select: { name: true } },
      shuttleDropoffStop: { select: { name: true } },
      booking: { select: bookingSelect },
    },
    orderBy: { pickupTime: 'asc' },
  });
  const pax = trips.reduce((s, t) => s + t.passengers, 0);
  const kids = trips.reduce((s, t) => s + t.childCount, 0);
  const lines = [`GIAO KHÁCH XE GHÉP – ${run.route.name}`, `Khởi hành: ${vn(run.departAt)}`, `Số khách: ${pax}${kids ? ` (trong đó ${kids} trẻ em)` : ''}`, '', 'Đón:'];
  for (const t of trips) {
    const b = t.booking;
    const hide = [b.customerRef, b.customer?.name];
    const c = guestContact(b) ?? { name: b.leaderName ?? 'Khách', phone: 'liên hệ văn phòng' };
    const from = partnerSafe(t.pickupAddress, hide) || t.shuttlePickupStop?.name || '—';
    const to = partnerSafe(t.dropoffAddress, hide) || t.shuttleDropoffStop?.name || '—';
    lines.push(
      `• ${vn(t.pickupTime, false)} – ${t.shuttlePickupStop?.name ?? from}: ${b.code} · ${[c.name, c.phone].filter(Boolean).join(' – ')} · ${t.passengers} khách${t.flightNumber ? ` · ✈ ${t.flightNumber}` : ''}`,
      `   Hành trình: ${from} → ${to}${t.departureFlight ? ` · ✈ ${t.departureFlight}` : ''}`,
      ...b.passengers.map((p, i) => `   ${i + 1}. ${paxLine(p)}`),
    );
  }
  const per = run.partnerPricePerPax !== null ? Number(run.partnerPricePerPax) : null;
  lines.push('', per !== null ? `Giá: ${vnd(per)}/khách × ${pax} khách = ${vnd(per * pax)}` : run.partnerCost !== null ? `Giá cả chuyến: ${vnd(run.partnerCost)}` : '');
  const note = partnerSafe(run.dispatchNote);
  if (note) lines.push(`Lưu ý: ${note}`);
  return lines.join('\n').trim();
}
