import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** Loại nhiên liệu của xe = mặt hàng trên bảng giá bán lẻ Petrolimex */
export const FUEL_TYPES: { value: string; label: string; short: string; color: string }[] = [
  { value: 'XANG_95_V', label: 'Xăng E10 RON 95 Mức 5', short: 'RON 95-V', color: 'green' },
  { value: 'XANG_95_III', label: 'Xăng E10 RON 95 Mức 3', short: 'RON 95-III', color: 'lime' },
  { value: 'XANG_92', label: 'Xăng E5 RON 92', short: 'E5 RON 92', color: 'cyan' },
  { value: 'DO_0001', label: 'Dầu DO 0,001S', short: 'DO 0,001S', color: 'gold' },
  { value: 'DO_005', label: 'Dầu DO 0,05S', short: 'DO 0,05S', color: 'orange' },
  { value: 'DIEN', label: 'Điện', short: 'Điện', color: 'blue' },
];
export const fuelType = (code?: string | null) => FUEL_TYPES.find((f) => f.value === code);

export interface FuelPriceState {
  prices: Record<string, number>;
  items: { title: string; code: string | null; zone1: number; zone2: number; modified: string }[];
  zone: 1 | 2;
  effectiveAt: string | null;
  updatedAt: string | null;
  lastError: string | null;
  auto: boolean;
}

/** Giá xăng dầu Petrolimex đang áp dụng (tự cập nhật 15:00 hằng ngày) */
export function useFuelPrices() {
  return useQuery({ queryKey: ['/fuel-prices'], queryFn: () => api<FuelPriceState>('/fuel-prices'), staleTime: 5 * 60_000 });
}
