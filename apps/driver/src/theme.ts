import type { TripStatus } from './types';

/** Thương hiệu: màu lấy từ logo Vietnam Explore (#1278FA) */
export const BRAND = {
  company: 'VIETNAM EXPLORE',
  /** Tên app */
  appName: 'Vietnam Explore Driver',
  /** Nền màn hình đăng nhập: xanh đậm → xanh logo → xanh sáng */
  gradient: ['#083AA0', '#1278FA', '#5CB2FF'] as const,
  button: ['#0F6BE0', '#3A93FF'] as const,
};

export const colors = {
  primary: '#0F6BE0', // xanh logo công ty (đậm hơn chút cho chữ trắng dễ đọc)
  primaryDark: '#0A4FB0',
  primarySoft: '#e8f1fe', // nền nhạt của nút / nhãn màu xanh
  accent: '#e3262b', // đỏ điểm nhấn trong logo
  bg: '#f2f5fa',
  card: '#ffffff',
  text: '#0f1b2d',
  text2: '#475569',
  muted: '#8a97a8',
  border: '#e4e9f1',
  /** Nền ô nhập, thẻ phụ */
  surface: '#f6f8fc',
  danger: '#d9363e',
  success: '#16a34a',
  warning: '#d97706',
};

/** Bóng đổ mềm dùng chung cho thẻ */
export const shadow = {
  shadowColor: '#0b2a5c',
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
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
