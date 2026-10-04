import { ClearOutlined, FilterOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Col, DatePicker, Flex, Input, Row, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { BOOKING_STATUS, toOptions } from '../labels';
import type { CustomerSource } from '../types';
import { useCustomers, useSalesStaffOptions, useServices, useVehicleTypeOptions } from './common';

/** Các điều kiện lọc booking (lưu trên đường dẫn trang: quay lại từ chi tiết booking vẫn giữ bộ lọc) */
const KEYS = ['q', 'status', 'from', 'to', 'payment', 'customerId', 'source', 'serviceType', 'vehicleTypeId', 'salesUserId', 'createdFrom', 'createdTo'] as const;
type Key = (typeof KEYS)[number];
/** Điều kiện nằm trong phần "Lọc thêm" */
const MORE: Key[] = ['customerId', 'source', 'serviceType', 'vehicleTypeId', 'salesUserId', 'createdFrom'];

export const PAYMENT_FILTER = [
  { value: 'CON_NO', label: 'Còn phải thu' },
  { value: 'CHUA_THU', label: 'Chưa thu' },
  { value: 'MOT_PHAN', label: 'Thu một phần' },
  { value: 'DU', label: 'Đã thu đủ' },
  { value: 'CHUA_GIA', label: 'Chưa nhập giá' },
];

const today = () => dayjs().startOf('day');
const DATE_PRESETS: { label: string; value: () => [Dayjs, Dayjs] }[] = [
  { label: 'Hôm nay', value: () => [today(), today()] },
  { label: 'Ngày mai', value: () => [today().add(1, 'day'), today().add(1, 'day')] },
  { label: '7 ngày tới', value: () => [today(), today().add(6, 'day')] },
  { label: 'Tuần này', value: () => [today().startOf('week'), today().endOf('week')] },
  { label: 'Tháng này', value: () => [today().startOf('month'), today().endOf('month')] },
  { label: 'Tháng sau', value: () => [today().add(1, 'month').startOf('month'), today().add(1, 'month').endOf('month')] },
  { label: 'Tháng trước', value: () => [today().subtract(1, 'month').startOf('month'), today().subtract(1, 'month').endOf('month')] },
];

/** Đọc bộ lọc từ đường dẫn → tham số gửi máy chủ */
export function useBookingFilters() {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? undefined])) as Record<Key, string | undefined>;
  const set = (patch: Partial<Record<Key, string | null | undefined>>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  const clear = () => setParams(new URLSearchParams(), { replace: true });
  const active = KEYS.filter((k) => k !== 'createdTo' && filters[k]).length;
  return { filters, set, clear, active };
}

const range = (from?: string, to?: string): [Dayjs, Dayjs] | null => (from && to ? [dayjs(from), dayjs(to)] : null);
const ymd = (d: Dayjs | null | undefined) => d?.format('YYYY-MM-DD');
const num = (v: string | undefined) => (v ? Number(v) : undefined);

export function BookingFilterBar({ filters, set, clear, active }: ReturnType<typeof useBookingFilters>) {
  const customers = useCustomers();
  const { services } = useServices();
  const { options: vehicleTypeOptions } = useVehicleTypeOptions();
  const salesOptions = useSalesStaffOptions();
  const { data: sources = [] } = useQuery({ queryKey: ['/customer-sources'], queryFn: () => api<CustomerSource[]>('/customer-sources') });
  const moreActive = MORE.filter((k) => filters[k]).length;
  const [showMore, setShowMore] = useState(moreActive > 0);

  // Ô tìm kiếm: gõ xong 0,4 giây mới lọc
  const [q, setQ] = useState(filters.q ?? '');
  useEffect(() => setQ(filters.q ?? ''), [filters.q]);
  useEffect(() => {
    if ((filters.q ?? '') === q) return;
    const t = window.setTimeout(() => set({ q }), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <Flex vertical gap={10} style={{ marginBottom: 16 }}>
      <Flex gap={8} wrap align="center">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Mã, tên, SĐT, địa điểm, lịch trình"
          style={{ flex: '1 1 220px', maxWidth: 320 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <DatePicker.RangePicker
          format="DD/MM/YYYY"
          placeholder={['Đi từ ngày', 'đến ngày']}
          presets={DATE_PRESETS.map((p) => ({ label: p.label, value: p.value() }))}
          value={range(filters.from, filters.to)}
          onChange={(v) => set({ from: ymd(v?.[0]), to: ymd(v?.[1]) })}
        />
        <Select
          mode="multiple"
          allowClear
          maxTagCount={2}
          placeholder="Trạng thái"
          style={{ minWidth: 170, maxWidth: 280 }}
          options={toOptions(BOOKING_STATUS)}
          value={filters.status?.split(',') ?? []}
          onChange={(v: string[]) => set({ status: v.join(',') })}
        />
        <Select allowClear placeholder="Thanh toán" style={{ width: 150 }} options={PAYMENT_FILTER} value={filters.payment} onChange={(v) => set({ payment: v })} />
        <Badge count={moreActive} size="small" color="#2563eb">
          <Button icon={<FilterOutlined />} type={showMore ? 'primary' : 'default'} ghost={showMore} onClick={() => setShowMore((s) => !s)}>
            Lọc thêm
          </Button>
        </Badge>
        {active > 0 && (
          <Button type="text" icon={<ClearOutlined />} onClick={clear}>
            Xóa lọc
          </Button>
        )}
      </Flex>

      {showMore && (
        <Row gutter={[8, 8]} style={{ padding: 12, background: '#f8fafc', border: '1px solid #e9eef5', borderRadius: 10 }}>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Khách hàng"
              style={{ width: '100%' }}
              options={customers.map((c) => ({ value: String(c.id), label: c.name }))}
              value={filters.customerId}
              onChange={(v) => set({ customerId: v })}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Select
              allowClear
              placeholder="Nguồn khách"
              style={{ width: '100%' }}
              options={sources.map((s) => ({ value: s.code, label: s.name }))}
              value={filters.source}
              onChange={(v) => set({ source: v })}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Select
              allowClear
              placeholder="Dịch vụ"
              style={{ width: '100%' }}
              options={services.map((s) => ({ value: s.code, label: s.name }))}
              value={filters.serviceType}
              onChange={(v) => set({ serviceType: v })}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Select
              allowClear
              placeholder="Loại xe"
              style={{ width: '100%' }}
              options={vehicleTypeOptions}
              value={num(filters.vehicleTypeId)}
              onChange={(v) => set({ vehicleTypeId: v === undefined ? undefined : String(v) })}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Select
              allowClear
              placeholder="NV kinh doanh"
              style={{ width: '100%' }}
              options={salesOptions}
              value={num(filters.salesUserId)}
              onChange={(v) => set({ salesUserId: v === undefined ? undefined : String(v) })}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <DatePicker.RangePicker
              format="DD/MM/YYYY"
              placeholder={['Tạo từ ngày', 'đến ngày']}
              style={{ width: '100%' }}
              presets={DATE_PRESETS.filter((p) => !['Ngày mai', '7 ngày tới', 'Tháng sau'].includes(p.label)).map((p) => ({ label: p.label, value: p.value() }))}
              value={range(filters.createdFrom, filters.createdTo)}
              onChange={(v) => set({ createdFrom: ymd(v?.[0]), createdTo: ymd(v?.[1]) })}
            />
          </Col>
        </Row>
      )}
    </Flex>
  );
}
