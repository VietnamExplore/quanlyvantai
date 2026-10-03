import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, DatePicker, Flex, Input, Select, Table, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { fmtTime } from '../booking-utils';
import { EnumTag, Money, ServiceTag, useSalesStaffOptions } from '../components/common';
import { BOOKING_STATUS, toOptions } from '../labels';
import type { Booking } from '../types';

export default function BookingsPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const salesOptions = useSalesStaffOptions();
  const [q, setQ] = useState<string>();
  const [status, setStatus] = useState<string>();
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
          <Input allowClear prefix={<SearchOutlined />} placeholder="Mã, tên, SĐT khách" style={{ width: 220 }} onChange={(e) => setQ(e.target.value || undefined)} />
          <DatePicker.RangePicker format="DD/MM/YYYY" placeholder={['Đi từ ngày', 'đến ngày']} onChange={(v) => setRange(v)} />
          <Select allowClear placeholder="Trạng thái" style={{ width: 150 }} options={toOptions(BOOKING_STATUS)} onChange={setStatus} />
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
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 30, hideOnSinglePage: true }}
        onRow={(r) => ({ onClick: () => navigate(`/bookings/${r.id}`), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Mã', dataIndex: 'code', render: (v) => <b>{v}</b> },
          {
            title: 'Khách hàng',
            render: (_, r) => (
              <>
                {r.customer?.name ?? r.contactName}
                <br />
                <Typography.Text type="secondary">
                  {r.customer ? `${r.contactName} · ` : ''}
                  {r.contactPhone}
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
                  {fmtTime(first.pickupTime)}
                  <br />
                  <ServiceTag code={first.serviceType} />
                </>
              );
            },
          },
          { title: 'Số chuyến', align: 'center', render: (_, r) => r.trips.filter((t) => t.status !== 'HUY').length || r.trips.length },
          { title: 'Tổng tiền', align: 'right', dataIndex: 'total', render: (v) => <Money value={v} strong /> },
          { title: 'Trạng thái', dataIndex: 'status', render: (v) => <EnumTag labels={BOOKING_STATUS} value={v} /> },
          { title: 'NV kinh doanh', render: (_, r) => r.salesUser?.fullName },
          { title: 'Ngày tạo', dataIndex: 'createdAt', render: (v) => new Date(v).toLocaleDateString('vi-VN') },
        ]}
      />
    </Card>
  );
}
