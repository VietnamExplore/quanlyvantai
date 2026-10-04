import dayjs from 'dayjs';
import { fmtTime, routeText } from './booking-utils';
import type { DispatchTrip, TripStatus } from './types';

/** Thứ tự tiến trình của chuyến sau khi điều xe */
export const TRIP_FLOW: TripStatus[] = ['DA_GAN', 'TAI_XE_NHAN', 'DANG_DEN_DON', 'DA_DON_KHACH', 'HOAN_THANH'];

/** Nút chuyển sang bước kế tiếp */
export const NEXT_ACTION: Partial<Record<TripStatus, { status: TripStatus; label: string }>> = {
  DA_GAN: { status: 'TAI_XE_NHAN', label: 'Tài xế đã nhận chuyến' },
  TAI_XE_NHAN: { status: 'DANG_DEN_DON', label: 'Đang đến điểm đón' },
  DANG_DEN_DON: { status: 'DA_DON_KHACH', label: 'Đã đón khách' },
  DA_DON_KHACH: { status: 'HOAN_THANH', label: 'Hoàn thành chuyến' },
};

/** Màu khối chuyến trên lịch xe (nền nhạt + viền đậm cùng tông) */
export const BLOCK_COLOR: Record<TripStatus, { bg: string; border: string }> = {
  CHO_DIEU: { bg: '#fff1e6', border: '#eb6834' },
  DA_GAN: { bg: '#e6f0fb', border: '#2a78d6' },
  TAI_XE_NHAN: { bg: '#e3f4ee', border: '#1baf7a' },
  DANG_DEN_DON: { bg: '#ece9f8', border: '#4a3aa7' },
  DA_DON_KHACH: { bg: '#ece9f8', border: '#4a3aa7' },
  HOAN_THANH: { bg: '#f0f0ef', border: '#8a8984' },
  HUY: { bg: '#fbe9e9', border: '#e34948' },
};

export const assignmentText = (t: DispatchTrip) =>
  t.vehicle
    ? `${t.vehicle.plateNumber}${t.driver ? ` · ${t.driver.fullName}` : ''}`
    : t.partner
      ? `${t.partner.name}${t.partnerPlate ? ` · ${t.partnerPlate}` : ''}`
      : '';

/** Nội dung lệnh điều xe gửi tài xế / nhà xe qua Zalo */
export function buildDispatchText(t: DispatchTrip) {
  const lines = [
    `LỆNH ĐIỀU XE – ${t.booking.code}${t.booking.customerRef ? ` (mã khách: ${t.booking.customerRef})` : ''}`,
    `Dịch vụ: ${t.service?.name ?? t.serviceType}`,
    `Giờ đón: ${fmtTime(t.pickupTime)} (dự kiến xong ${dayjs(t.endTime).format('HH:mm DD/MM')})`,
    `Điểm đón: ${t.pickupAddress}`,
  ];
  if (t.dropoffAddress) lines.push(`Điểm trả: ${t.dropoffAddress}`);
  if (t.flightNumber) lines.push(`Chuyến bay: ${t.flightNumber}`);
  // Khách: ưu tiên hành khách đầu tiên trong danh sách hành khách; không có thì lấy tên khách hàng / người liên hệ
  const guest = t.booking.passengers?.[0];
  const guestName = guest?.fullName || t.booking.customer?.name || t.booking.contactName;
  const guestPhone = guest?.phone || t.booking.contactPhone;
  lines.push(`Khách: ${guestName} – ${guestPhone} (${t.passengers} khách)`);
  if (t.vehicle) lines.push(`Xe: ${t.vehicle.plateNumber} (${t.vehicle.vehicleType.name})${t.driver ? ` – Lái xe: ${t.driver.fullName} ${t.driver.phone}` : ''}`);
  if (t.partner) {
    lines.push(`Xe: ${t.vehicleType.name}${t.partnerPlate ? ` – ${t.partnerPlate}` : ''}`);
    if (t.partnerDriverName || t.partnerDriverPhone) lines.push(`Tài xế: ${[t.partnerDriverName, t.partnerDriverPhone].filter(Boolean).join(' – ')}`);
  }
  if (t.days > 1) lines.push(`Số ngày: ${t.days}`);
  if (t.itinerary) lines.push(`Lịch trình:\n${t.itinerary}`);
  if (t.notes) lines.push(`Ghi chú: ${t.notes}`);
  if (t.dispatchNote) lines.push(`Lưu ý điều hành: ${t.dispatchNote}`);
  return lines.join('\n');
}

export { routeText };
