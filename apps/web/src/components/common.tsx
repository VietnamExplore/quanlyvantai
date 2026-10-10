import { useQuery } from '@tanstack/react-query';
import { InputNumber, Tag, Tooltip, type InputNumberProps } from 'antd';
import dayjs from 'dayjs';
import { api } from '../api';
import type { Customer, CustomerKind, Driver, Location, Partner, Service, Settings, VehicleType } from '../types';

export const DATE_FORMAT = 'DD/MM/YYYY';

/** So sánh chữ tiếng Việt có dấu, dùng cho sắp xếp cột bảng */
export const byText = (a?: string | null, b?: string | null) => (a ?? '').localeCompare(b ?? '', 'vi');

/** Số dòng tối đa mỗi trang của mọi bảng danh sách */
export const PAGE_SIZE = 100;
/** Phân trang chung: 100 dòng/trang, luôn hiện "1–100 / 245 <đơn vị>" */
export const paged = (unit = 'dòng') => ({
  pageSize: PAGE_SIZE,
  hideOnSinglePage: false,
  showSizeChanger: false,
  showTotal: (total: number, [a, b]: [number, number]) => `${a}–${b} / ${total} ${unit}`,
});

export function EnumTag<K extends string>({ labels, value }: { labels: Record<K, { label: string; color?: string }>; value: K }) {
  const item = labels[value];
  return item ? <Tag color={item.color}>{item.label}</Tag> : <>{value}</>;
}

/** Hiển thị ngày hết hạn: đỏ nếu đã hết hạn hoặc còn ≤ 7 ngày, cam nếu còn ≤ 30 ngày. */
export function ExpiryCell({ value }: { value: string | null }) {
  if (!value) return <span style={{ color: '#bbb' }}>—</span>;
  const days = dayjs(value).startOf('day').diff(dayjs().startOf('day'), 'day');
  const text = dayjs(value).format(DATE_FORMAT);
  if (days > 30) return <>{text}</>;
  const color = days <= 7 ? 'red' : 'orange';
  const hint = days < 0 ? `Đã hết hạn ${-days} ngày` : days === 0 ? 'Hết hạn hôm nay' : `Còn ${days} ngày`;
  return (
    <Tooltip title={hint}>
      <Tag color={color}>{text}</Tag>
    </Tooltip>
  );
}

export const formatVnd = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('vi-VN');

/** Ô nhập tiền VND có dấu chấm phân cách hàng nghìn */
export function MoneyInput(props: InputNumberProps<number>) {
  return (
    <InputNumber<number>
      min={0}
      step={50_000}
      style={{ width: '100%' }}
      formatter={(v) => formatVnd(v)}
      parser={(v) => Number((v ?? '').replace(/\D/g, ''))}
      suffix="đ"
      {...props}
    />
  );
}

/** Hiển thị số tiền: 1.250.000 đ */
export const Money = ({ value, strong }: { value: number | string | null | undefined; strong?: boolean }) =>
  value === null || value === undefined ? null : strong ? <b>{formatVnd(value)} đ</b> : <>{formatVnd(value)} đ</>;

// ───── Danh sách lựa chọn dùng trong form ─────

export function useLocations() {
  const { data = [] } = useQuery({ queryKey: ['/locations', {}], queryFn: () => api<Location[]>('/locations') });
  return data.filter((l) => l.isActive);
}

export function useCustomers() {
  const { data = [] } = useQuery({ queryKey: ['/customers', {}], queryFn: () => api<Customer[]>('/customers') });
  return data.filter((c) => c.isActive);
}

/** Danh mục Dịch vụ: danh sách, tra theo mã, option cho ô chọn (chỉ dịch vụ đang dùng) */
export function useServices() {
  const { data = [] } = useQuery({ queryKey: ['/services'], queryFn: () => api<Service[]>('/services') });
  const byCode = Object.fromEntries(data.map((s) => [s.code, s])) as Record<string, Service | undefined>;
  return {
    services: data,
    byCode,
    options: data.filter((s) => s.isActive).map((s) => ({ value: s.code, label: s.name })),
    name: (code: string) => byCode[code]?.name ?? code,
  };
}

/** Danh mục loại khách hàng (Khách lẻ, Doanh nghiệp, Đại lý…) */
export function useCustomerTypes() {
  const { data = [] } = useQuery({ queryKey: ['/customer-types'], queryFn: () => api<CustomerKind[]>('/customer-types') });
  const byCode = Object.fromEntries(data.map((t) => [t.code, t])) as Record<string, CustomerKind | undefined>;
  return {
    types: data,
    byCode,
    options: data.filter((t) => t.isActive).map((t) => ({ value: t.code, label: t.name })),
    name: (code?: string | null) => (code ? (byCode[code]?.name ?? code) : ''),
    /** Khách hưởng giá đại lý; danh mục chưa tải thì coi mã DAI_LY là đại lý */
    isAgent: (code?: string | null) => !!code && (byCode[code]?.isAgent ?? code === 'DAI_LY'),
  };
}

/** Nhãn màu loại khách hàng */
export function CustomerTypeTag({ code }: { code?: string | null }) {
  const { byCode } = useCustomerTypes();
  if (!code) return null;
  const t = byCode[code];
  return <Tag color={t?.color ?? undefined}>{t?.name ?? code}</Tag>;
}

/** Nhãn màu tên dịch vụ */
export function ServiceTag({ code }: { code: string }) {
  const { byCode } = useServices();
  const s = byCode[code];
  return <Tag color={s?.color ?? undefined}>{s?.name ?? code}</Tag>;
}

export function useSettings() {
  const { data = {} } = useQuery({ queryKey: ['/settings'], queryFn: () => api<Settings>('/settings') });
  return data;
}

export function useVehicleTypeOptions() {
  const { data = [] } = useQuery({ queryKey: ['/vehicle-types'], queryFn: () => api<VehicleType[]>('/vehicle-types') });
  return {
    vehicleTypes: data,
    options: data.map((t) => ({ value: t.id, label: t.name })),
    codeOptions: data.map((t) => ({ value: t.code, label: t.name })),
  };
}

export function usePartnerOptions() {
  const { data = [] } = useQuery({ queryKey: ['/partners', {}], queryFn: () => api<Partner[]>('/partners') });
  return data.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name }));
}

export function useCompanyDriverOptions() {
  const { data = [] } = useQuery({
    queryKey: ['/drivers', { owner: 'company' }],
    queryFn: () => api<Driver[]>('/drivers', { query: { owner: 'company' } }),
  });
  return data
    .filter((d) => d.status !== 'NGHI_VIEC')
    .map((d) => ({ value: d.id, label: `${d.fullName} (${d.phone})` }));
}

export function useSalesStaffOptions() {
  const { data = [] } = useQuery({
    queryKey: ['/users/sales-staff'],
    queryFn: () => api<{ id: number; fullName: string }[]>('/users/sales-staff'),
  });
  return data.map((u) => ({ value: u.id, label: u.fullName }));
}
