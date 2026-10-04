import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Flex, Grid, Table, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { fmtTime, routeText } from '../booking-utils';
import { BookingFilterBar, useBookingFilters } from '../components/BookingFilters';
import { BookingStatusMenu } from '../components/BookingStatusMenu';
import { EnumTag, Money, ServiceTag, formatVnd } from '../components/common';
import { PaidTag } from '../components/finance';
import { BOOKING_STATUS } from '../labels';
import type { Booking } from '../types';

export default function BookingsPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'DIEU_HANH', 'KINH_DOANH');
  // Màn hình dưới 1600px: nút thao tác chỉ hiện biểu tượng cho gọn bảng
  const compact = !Grid.useBreakpoint().xxl;
  // Bộ lọc lưu trên đường dẫn (vd. ?status=BAO_GIA từ trang Tổng quan)
  const filterState = useBookingFilters();
  const { filters, active } = filterState;
  const { data = [], isFetching } = useQuery({
    queryKey: ['/bookings', filters],
    queryFn: () => api<Booking[]>('/bookings', { query: filters }),
  });
  // Tổng của kết quả đang lọc (không tính booking đã hủy)
  const live = data.filter((b) => b.status !== 'HUY');
  const sum = (f: (b: Booking) => number) => live.reduce((t, b) => t + f(b), 0);

  return (
    <Card>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Booking <Typography.Text type="secondary">({data.length})</Typography.Text>
        </Typography.Title>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/bookings/new')}>
            Tạo booking
          </Button>
        )}
      </Flex>

      <BookingFilterBar {...filterState} />

      {data.length > 0 && (
        <Flex gap={20} wrap style={{ marginBottom: 12, fontSize: 13, color: '#64748b' }}>
          <span>
            {active > 0 ? 'Kết quả lọc' : 'Tất cả'}: <b style={{ color: '#1e293b' }}>{data.length}</b> booking
            {data.length >= 500 && ' (hiện 500 booking mới nhất — hãy lọc thêm)'}
          </span>
          <span>
            Tổng tiền: <b style={{ color: '#1e293b' }}>{formatVnd(sum((b) => b.total))} đ</b>
          </span>
          <span>
            Đã thu: <b style={{ color: '#16a34a' }}>{formatVnd(sum((b) => b.paid))} đ</b>
          </span>
          <span>
            Còn phải thu: <b style={{ color: '#dc2626' }}>{formatVnd(sum((b) => Math.max(0, b.balance)))} đ</b>
          </span>
        </Flex>
      )}

      <Table<Booking>
        rowKey="id"
        size="middle"
        loading={isFetching}
        dataSource={data}
        pagination={{ pageSize: 30, hideOnSinglePage: true }}
        locale={{ emptyText: active ? 'Không có booking nào khớp bộ lọc' : 'Chưa có booking' }}
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
                {(r.arrivalFlight || r.departureFlight) && (
                  <div style={{ fontSize: 12 }}>
                    <Typography.Text type="secondary">
                      ✈ {[r.arrivalFlight && `Đến ${r.arrivalFlight}`, r.departureFlight && `Về ${r.departureFlight}`].filter(Boolean).join(' · ')}
                    </Typography.Text>
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
