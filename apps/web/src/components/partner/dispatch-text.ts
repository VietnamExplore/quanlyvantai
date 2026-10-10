import dayjs from 'dayjs';
import { APP_LABEL, guessApp, type ContactApp } from './contact';
import type { PartnerTrip } from './types';

const LEADER: Record<string, string> = { HDV: 'Hướng dẫn viên', TRUONG_DOAN: 'Trưởng đoàn' };

/**
 * Lệnh điều xe nhà xe đối tác gửi lái xe của mình qua Zalo.
 * Chỉ gồm thông tin nhà xe được xem: không có giá thuê, hóa đơn, thông tin khách hàng / đại lý đặt xe.
 */
export function buildPartnerDispatchText(t: PartnerTrip) {
  const b = t.booking;
  const lines = [
    `LỆNH ĐIỀU XE – ${b.code} · chuyến ${t.seq}`,
    `Dịch vụ: ${t.service?.name ?? t.serviceType}${t.days > 1 ? ` (${t.days} ngày)` : ''}`,
    `Giờ đón: ${dayjs(t.pickupTime).format('HH:mm DD/MM/YYYY')}${t.endTime ? ` (dự kiến xong ${dayjs(t.endTime).format('HH:mm DD/MM')})` : ''}`,
    `Điểm đón: ${t.pickupAddress}`,
  ];
  if (t.dropoffAddress) lines.push(`Điểm trả: ${t.dropoffAddress}`);
  if (t.flightNumber) lines.push(`Chuyến bay đón: ${t.flightNumber}`);
  if (t.departureFlight) lines.push(`Chuyến bay tiễn: ${t.departureFlight}`);
  lines.push(`Số khách: ${t.passengers} · Loại xe: ${t.vehicleType.name}`);
  if (t.partnerPlate || t.partnerDriverName || t.partnerDriverPhone) {
    lines.push(`Xe: ${[t.partnerPlate, t.partnerDriverName, t.partnerDriverPhone].filter(Boolean).join(' – ')}`);
  }
  if (b.leaderName || b.leaderPhone) {
    const app: ContactApp = (b.leaderApp as ContactApp | null) ?? guessApp(b.leaderPhone);
    const via = b.leaderPhone || b.leaderAppId ? ` (liên hệ qua ${APP_LABEL[app]}${b.leaderAppId ? ` ID: ${b.leaderAppId}` : ''})` : '';
    lines.push(`${LEADER[b.leaderRole ?? ''] ?? 'Người liên hệ'}: ${[b.leaderName, b.leaderPhone].filter(Boolean).join(' – ')}${via}`);
  }
  if (b.signTitle) lines.push(`Bảng đón: ${b.signTitle}${b.signSubtitle ? ` – ${b.signSubtitle}` : ''}`);
  if (b.passengers.length) {
    lines.push(`Danh sách khách (${b.passengers.length}):`);
    b.passengers.forEach((p, i) => lines.push(`${i + 1}. ${p.fullName}`));
  }
  if (t.itinerary) lines.push(`Lịch trình:\n${t.itinerary}`);
  if (t.notes) lines.push(`Ghi chú: ${t.notes}`);
  if (t.dispatchNote) lines.push(`Lưu ý điều hành: ${t.dispatchNote}`);
  // Hợp đồng điện tử: lái xe mở link để xuất trình khi kiểm tra
  if (b.contract) lines.push(`Hợp đồng vận chuyển ${b.contract.number}: ${window.location.origin}/e/hd/${b.contract.token}`);
  return lines.join('\n');
}
