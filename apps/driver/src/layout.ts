import { useWindowDimensions } from 'react-native';

/**
 * Bố cục theo kích thước màn hình (điện thoại nhỏ → máy tính bảng ngang):
 * - compact: điện thoại nhỏ (< 360 điểm) – chữ, khoảng cách gọn hơn
 * - tablet: ≥ 700 điểm – danh sách chuyến nhiều cột, chi tiết chuyến chia 2 cột
 * - rail: ≥ 900 điểm (máy tính bảng ngang) – thanh điều hướng bên trái thay cho thanh dưới
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const compact = width < 360;
  const tablet = width >= 700;
  const rail = width >= 900;
  // Bề ngang nội dung: điện thoại dùng hết, máy tính bảng căn giữa không quá rộng
  const maxWidth = rail ? 1180 : tablet ? 980 : width;
  const contentWidth = Math.min(width - (rail ? 96 : 0), maxWidth);
  // Số cột thẻ chuyến: mỗi thẻ rộng tối thiểu ~340 điểm
  const columns = tablet ? Math.max(1, Math.min(3, Math.floor((contentWidth - 24) / 340))) : 1;
  const pad = compact ? 10 : tablet ? 20 : 14;
  return { width, height, compact, tablet, rail, landscape: width > height, maxWidth, contentWidth, columns, pad };
}

/** Chia danh sách thành hàng `n` phần tử (lưới thẻ trên máy tính bảng) */
export function chunk<T>(list: T[], n: number): T[][] {
  if (n <= 1) return list.map((x) => [x]);
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}
