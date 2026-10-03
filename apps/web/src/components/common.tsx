import { useQuery } from '@tanstack/react-query';
import { Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { api } from '../api';
import type { Driver, Partner, VehicleType } from '../types';

export const DATE_FORMAT = 'DD/MM/YYYY';

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

// ───── Danh sách lựa chọn dùng trong form ─────

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
