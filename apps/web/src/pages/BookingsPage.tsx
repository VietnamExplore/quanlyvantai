import { EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, DatePicker, Flex, Grid, Input, Select, Table, Tooltip, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { fmtTime, routeText } from '../booking-utils';
import { BookingStatusMenu } from '../components/BookingStatusMenu';
import { EnumTag, Money, ServiceTag, useSalesStaffOptions } from '../components/common';
import { PaidTag } from '../components/finance';
import { BOOKING_STATUS, toOptions } from '../labels';
import type { Booking } from '../types';

export default function BookingsPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'DIEU_HANH', 'KINH_DOANH');
  // Màn hình dưới 1600px: nút thao tác chỉ hiện biểu tượng cho gọn bảng
  const compact = !Grid.useBreakpoint().xxl;
  const salesOptions = useSalesStaffOptions();
  const [q, setQ] = useState<string>();
  // ?status=BAO_GIA: mở sẵn bộ lọc (từ trang Tổng quan)
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<string | undefined>(searchParams.get('status') ?? undefined);
  const [salesUserId, setSalesUserId] = useState<number>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const filters = {
    q,
    status,
    salesUserId,
    from: range?.[0]?.format('YYYY-MM-DD'),
    to: range?.[1]?.format('YYYY-MM-DD'),
  };
  const { data = [], isFetching } = useQuery({
    queryKey: ['/bookings', filters],
    queryFn: () => api<Booking[]>('/bookings', { query: filters }),
  });

  return (
    <Card>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Booking <Typography.Text type="secondary">({data.length})</Typography.Text>
        </Typography.Title>
        <Flex gap={8} wrap>
          <Input allowClear prefix={<SearchOutlined />} placeholder="Mã, tên, SĐT, địa điểm, lịch trình" style={{ width: 250 }} onChange={(e) => setQ(e.target.value || undefined)} />
          <DatePicker.RangePicker format="DD/MM/YYYY" placeholder={['Đi từ ngày', 'đến ngày']} onChange={(v) => setRange(v)} />
          <Select allowClear placeholder="Trạng thái" style={{ width: 150 }} options={toOptions(BOOKING_STATUS)} value={status} onChange={setStatus} />
          <Select allowClear placeholder="NV kinh doanh" style={{ width: 170 }} options={salesOptions} onChange={setSalesUserId} />
          {hasRole('ADMIN', 'DIEU_HANH', 'KINH_DOANH') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/bookings/new')}>
              Tạo booking
            </Button>
          )}
        </Flex>
      </Flex>

      <Table<Booking>
        rowKey="id"
        size="middle"
        loading={isFetching}
        dataSource={data}
        pagination={{ pageSize: 30, hideOnSinglePage: true }}
        onRow={(r) => ({ onClick: () => navigate(`/bookings/${r.id}`), style: { cursor: 'pointer' } })}
        columns={[
          {
            title: 'Mã',
            dataIndex: 'code',
            render: (v, r) => (
              <>
                <b className="nowrap">{v}</b>
                {r.customerRef && (
                  <div>
                    <Typography.Text type="secondary">Mã khách: {r.customerRef}</Typography.Text>
                  </div>
                )}
              </>
            ),
          },
          {
            title: 'Khách hàng',
            render: (_, r) => (
              <>
                {r.customer?.name ?? r.contactName}
                <br />
                <Typography.Text type="secondary">
                  {r.customer ? `${r.contactName} · ` : ''}
                  <span className="nowrap">{r.contactPhone}</span>
                </Typography.Text>
              </>
            ),
          },
          {
            title: 'Ngày đi',
            render: (_, r) => {
              const first = r.trips[0];
              if (!first) return <Typography.Text type="secondary">Chưa có chuyến</Typography.Text>;
              return (
                <>
                  <span className="nowrap">{fmtTime(first.pickupTime)}</span>
                  <br />
                  <ServiceTag code={first.serviceType} />
                </>
              );
            },
          },
          {
            title: 'Hành trình',
            render: (_, r) => {
              const trips = r.trips.filter((t) => t.status !== 'HUY');
              const list = trips.length ? trips : r.trips;
              if (!list.length) return null;
              return (
                <div style={{ minWidth: 130, maxWidth: 260, whiteSpace: 'normal', wordBreak: 'break-word', fontSize: 13, lineHeight: '18px' }}>
                  {list.slice(0, 2).map((t) => (
                    <div key={t.id} style={{ marginBottom: 2 }}>
                      {list.length > 1 && <Typography.Text type="secondary">{dayjs(t.pickupTime).format('HH:mm DD/MM')} · </Typography.Text>}
                      {routeText(t)}
                    </div>
                  ))}
                  {list.length > 2 && <Typography.Text type="secondary">+{list.length - 2} chuyến khác</Typography.Text>}
                </div>
              );
            },
          },
          {
            title: 'Lịch trình',
            responsive: ['xl'],
            render: (_, r) => {
              const list = r.trips.filter((t) => t.status !== 'HUY' && t.itinerary?.trim());
              if (!list.length) return null;
              const full = list.map((t) => (list.length > 1 ? `${dayjs(t.pickupTime).format('DD/MM')}: ${t.itinerary}` : t.itinerary)).join('\n');
              return (
                <Tooltip title={<div style={{ whiteSpace: 'pre-line' }}>{full}</div>}>
                  <div
                    style={{
                      minWidth: 115,
                      maxWidth: 220,
                      whiteSpace: 'pre-line',
                      wordBreak: 'break-word',
                      fontSize: 13,
                      lineHeight: '18px',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {full}
                  </div>
                </Tooltip>
              );
            },
          },
          { title: 'Số chuyến', align: 'center', responsive: ['xxl'], render: (_, r) => r.trips.filter((t) => t.status !== 'HUY').length || r.trips.length },
          { title: 'Tổng tiền', align: 'right', dataIndex: 'total', render: (v) => <Money value={v} strong /> },
          {
            title: 'Thanh toán',
            render: (_, r) =>
              r.status === 'HUY' ? null : (
                <>
                  <PaidTag total={r.total} paid={r.paid} />
                  {r.balance > 0 && r.paid > 0 && (
                    <div>
                      <Typography.Text type="secondary">còn {r.balance.toLocaleString('vi-VN')} đ</Typography.Text>
                    </div>
                  )}
                </>
              ),
          },
          { title: 'Trạng thái', dataIndex: 'status', render: (v) => <EnumTag labels={BOOKING_STATUS} value={v} /> },
          { title: 'NV kinh doanh', responsive: ['xxl'], render: (_, r) => r.salesUser?.fullName },
          { title: 'Ngày tạo', responsive: ['xxl'], dataIndex: 'createdAt', render: (v) => new Date(v).toLocaleDateString('vi-VN') },
          {
            key: 'edit',
            fixed: 'right',
            render: (_, r) => (
              <Flex gap={6}>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  title={r.status === 'HUY' || !canEdit ? 'Xem' : 'Sửa'}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/bookings/${r.id}?edit=1`);
                  }}
                >
                  {!compact && (r.status === 'HUY' || !canEdit ? 'Xem' : 'Sửa')}
                </Button>
                {canEdit && <BookingStatusMenu booking={r} compact={compact} />}
              </Flex>
            ),
          },
        ]}
      />
    </Card>
  );
}
