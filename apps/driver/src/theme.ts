import type { ServiceType, TripStatus } from './types';

export const colors = {
  primary: '#1668dc',
  primaryDark: '#0e4fae',
  bg: '#f2f3f5',
  card: '#ffffff',
  text: '#1f1f1f',
  text2: '#5c5c5c',
  muted: '#8c8c8c',
  border: '#e5e5e5',
  danger: '#d9363e',
  success: '#1f9d55',
  warning: '#d48806',
};

export const STATUS: Record<TripStatus, { label: string; color: string; bg: string }> = {
  CHO_DIEU: { label: 'Chờ điều xe', color: '#ad4e00', bg: '#fff1e6' },
  DA_GAN: { label: 'Chuyến mới', color: '#0e4fae', bg: '#e6f0fb' },
  TAI_XE_NHAN: { label: 'Đã nhận', color: '#08796b', bg: '#e3f4ee' },
  DANG_DEN_DON: { label: 'Đang đến đón', color: '#4a3aa7', bg: '#ece9f8' },
  DA_DON_KHACH: { label: 'Đang chở khách', color: '#4a3aa7', bg: '#ece9f8' },
  HOAN_THANH: { label: 'Hoàn thành', color: '#3f6600', bg: '#f0f7e6' },
  HUY: { label: 'Đã hủy', color: '#a8071a', bg: '#fbe9e9' },
};

/** Nút bước kế tiếp cho lái xe */
export const NEXT_STEP: Partial<Record<TripStatus, { status: TripStatus; label: string; confirm: string }>> = {
  DA_GAN: { status: 'TAI_XE_NHAN', label: 'NHẬN CHUYẾN', confirm: 'Xác nhận nhận chuyến này?' },
  TAI_XE_NHAN: { status: 'DANG_DEN_DON', label: 'BẮT ĐẦU ĐI ĐÓN KHÁCH', confirm: 'Bắt đầu đi đến điểm đón?' },
  DANG_DEN_DON: { status: 'DA_DON_KHACH', label: 'ĐÃ ĐÓN KHÁCH', confirm: 'Xác nhận đã đón khách lên xe?' },
  DA_DON_KHACH: { status: 'HOAN_THANH', label: 'HOÀN THÀNH CHUYẾN', confirm: 'Xác nhận đã trả khách, hoàn thành chuyến?' },
};

/** Tên dịch vụ dự phòng khi máy chủ chưa trả về tên */
export const SERVICE: Record<string, string> = {
  DON_TIEN_SAN_BAY: 'Đón/tiễn sân bay',
  THEO_TUYEN: 'Đưa đón theo tuyến',
  CITY_TOUR: 'City tour',
  THUE_THEO_NGAY: 'Thuê xe theo ngày',
  TOUR_NHIEU_NGAY: 'Tour nhiều ngày',
};

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "08:30 · T6 20/11" */
export function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${WEEKDAY[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export const fmtHour = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** "Hôm nay", "Ngày mai" hoặc "T6 20/11" */
export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(today)) / 86_400_000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Ngày mai';
  if (diff === -1) return 'Hôm qua';
  return `${WEEKDAY[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}
