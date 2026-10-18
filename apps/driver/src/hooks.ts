import { useEffect } from 'react';

/**
 * Tải dữ liệu khi mở màn hình và mỗi khi hàm `load` đổi (vd đổi tháng, đổi chuyến).
 * Gọi `load` sau khi màn hình đã hiện (không đặt state ngay trong effect – tránh vẽ lại dây chuyền),
 * và bỏ qua nếu màn hình đã đóng trước khi kịp tải. Hàm `load` vẫn dùng được cho nút "Tải lại".
 */
export function useLoadOnMount(load: () => unknown) {
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) load();
    });
    return () => {
      alive = false;
    };
  }, [load]);
}
