import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Flex, Grid, Select, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { flightText, fmtTime, ownsBooking, routeText } from '../booking-utils';
import { BookingBulkBar } from '../components/BookingBulkBar';
import { BookingCard } from '../components/BookingCard';
import { BookingFilterBar, useBookingFilters } from '../components/BookingFilters';
import { BookingStatusMenu } from '../components/BookingStatusMenu';
import { EnumTag, Money, ServiceTag, formatVnd, paged, byText } from '../components/common';
import { PaidTag } from '../components/finance';
import { BOOKING_STATUS } from '../labels';
import type { Booking } from '../types';

/** Giờ đón chuyến đầu tiên (booking chưa có chuyến xếp cuối) */
const firstPickup = (b: Booking) => (b.trips[0] ? new Date(b.trips[0].pickupTime).getTime() : Number.MAX_SAFE_INTEGER);
const liveTrips = (b: Booking) => b.trips.filter((t) => t.status !== 'HUY');

/** Sắp xếp dạng thẻ (điện thoại không có tiêu đề cột để bấm) */
const CARD_SORTS: { value: string; label: string; fn: (a: Booking, b: Booking) => number }[] = [
  { value: 'created', label: 'Mới tạo nhất', fn: (a, b) => b.createdAt.localeCompare(a.createdAt) },
  { value: 'pickup', label: 'Ngày đi gần nhất', fn: (a, b) => firstPickup(a) - firstPickup(b) },
  { value: 'pickupDesc', label: 'Ngày đi xa nhất', fn: (a, b) => firstPickup(b) - firstPickup(a) },
  { value: 'code', label: 'Mã booking', fn: (a, b) => byText(a.code, b.code) },
  { value: 'customer', label: 'Tên khách A → Z', fn: (a, b) => byText(a.customer?.name ?? a.contactName, b.customer?.name ?? b.contactName) },
  { value: 'total', label: 'Tổng tiền cao nhất', fn: (a, b) => b.total - a.total },
  { value: 'balance', label: 'Còn phải thu nhiều nhất', fn: (a, b) => b.balance - a.balance },
  { value: 'status', label: 'Trạng thái', fn: (a, b) => byText(BOOKING_STATUS[a.status].label, BOOKING_STATUS[b.status].label) },
];

export default function BookingsPage() {
  const navigate = useNavigate();
  const { hasRole, user } = useAuth();
  /** Sửa được booking này không (của mình hoặc Admin) */
  const mine = (b: Booking) => ownsBooking(b, user);
  const canEdit = hasRole('ADMIN', 'DIEU_HANH', 'KINH_DOANH');
  const screens = Grid.useBreakpoint();
  // Màn hình dưới 1600px: nút thao tác chỉ hiện biểu tượng cho gọn bảng
  const compact = !screens.xxl;
  // Điện thoại (< 768px): mỗi booking là một thẻ thay vì dòng bảng nhiều cột
  const mobile = screens.md === false;
  const [cardSort, setCardSort] = useState('created');
  // Bộ lọc lưu trên đường dẫn (vd. ?status=BAO_GIA từ trang Tổng quan)
  const filterState = useBookingFilters();
  const { filters, active } = filterState;
  const { data = [], isFetching } = useQuery({
    queryKey: ['/bookings', filters],
    queryFn: () => api<Booking[]>('/bookings', { query: filters }),
  });
  // Chọn nhiều booking để thao tác hàng loạt; đổi bộ lọc thì bỏ chọn
  const [selectedKeys, setSelectedKeys] = useState<number[]>([]);
  const filterKey = JSON.stringify(filters);
  useEffect(() => setSelectedKeys([]), [filterKey]);
  const selected = useMemo(() => data.filter((b) => selectedKeys.includes(b.id)), [data, selectedKeys]);

  const cardData = useMemo(() => (mobile ? [...data].sort(CARD_SORTS.find((x) => x.value === cardSort)!.fn) : data), [mobile, data, cardSort]);
  const cardColumns: ColumnsType<Booking> = [
    {
      key: 'card',
      title: <Typography.Text type="secondary">Chọn tất cả</Typography.Text>,
      render: (_, r) => <BookingCard b={r} canEdit={canEdit && mine(r)} onEdit={() => navigate(`/bookings/${r.id}?edit=1`)} />,
    },
  ];

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
            {data.length >= 5000 && ' (hiện 5.000 booking mới nhất — hãy lọc thêm)'}
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

      <BookingBulkBar
        selected={selected}
        total={data.length}
        canEdit={canEdit}
        canEditRow={mine}
        compact={mobile}
        onSelectAll={() => setSelectedKeys(data.map((b) => b.id))}
        onClear={() => setSelectedKeys([])}
      />

      {mobile && data.length > 1 && (
        <Flex align="center" gap={8} style={{ marginBottom: 10 }}>
          <Typography.Text type="secondary">Sắp xếp theo</Typography.Text>
          <Select value={cardSort} onChange={setCardSort} options={CARD_SORTS.map(({ value, label }) => ({ value, label }))} style={{ flex: 1 }} />
        </Flex>
      )}

      <Table<Booking>
        rowKey="id"
        className={mobile ? 'booking-cards' : undefined}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: (keys) => setSelectedKeys(keys as number[]),
          preserveSelectedRowKeys: true,
          columnWidth: mobile ? 44 : 40,
          selections: [
            { key: 'all', text: 'Chọn tất cả booking theo bộ lọc (mọi trang)', onSelect: () => setSelectedKeys(data.map((b) => b.id)) },
            Table.SELECTION_ALL,
            Table.SELECTION_INVERT,
            Table.SELECTION_NONE,
          ],
        }}
        size="middle"
        loading={isFetching}
        dataSource={cardData}
        pagination={paged('booking')}
        showSorterTooltip={{ title: 'Bấm để sắp xếp tăng / giảm / bỏ sắp xếp' }}
        locale={{ emptyText: active ? 'Không có booking nào khớp bộ lọc' : 'Chưa có booking' }}
        onRow={(r) => ({
          onClick: (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.ant-table-selection-column')) {
              // Chạm vào khoảng trống quanh ô chọn (dễ bấm trên điện thoại) cũng chọn / bỏ chọn
              if (!target.closest('.ant-checkbox-wrapper')) {
                setSelectedKeys((k) => (k.includes(r.id) ? k.filter((x) => x !== r.id) : [...k, r.id]));
              }
              return;
            }
            navigate(`/bookings/${r.id}`);
          },
          style: { cursor: 'pointer' },
        })}
        columns={mobile ? cardColumns : [
          {
            title: 'Mã',
            dataIndex: 'code',
            sorter: (a, b) => byText(a.code, b.code),
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
            sorter: (a, b) => byText(a.customer?.name ?? a.contactName, b.customer?.name ?? b.contactName),
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
            sorter: (a, b) => firstPickup(a) - firstPickup(b),
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
            sorter: (a, b) => byText(liveTrips(a)[0] ? routeText(liveTrips(a)[0]) : '', liveTrips(b)[0] ? routeText(liveTrips(b)[0]) : ''),
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
                      {flightText(t) && <Typography.Text type="secondary"> · ✈ {flightText(t)}</Typography.Text>}
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
            sorter: (a, b) => byText(liveTrips(a).map((t) => t.itinerary ?? '').join(''), liveTrips(b).map((t) => t.itinerary ?? '').join('')),
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
          { title: 'Số chuyến', align: 'center', responsive: ['xxl'], sorter: (a, b) => liveTrips(a).length - liveTrips(b).length, render: (_, r) => r.trips.filter((t) => t.status !== 'HUY').length || r.trips.length },
          { title: 'Tổng tiền', align: 'right', dataIndex: 'total', sorter: (a, b) => a.total - b.total, render: (v) => <Money value={v} strong /> },
          {
            title: 'Thanh toán',
            // Sắp theo số tiền còn phải thu
            sorter: (a, b) => a.balance - b.balance,
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
          { title: 'Trạng thái', dataIndex: 'status', sorter: (a, b) => byText(BOOKING_STATUS[a.status].label, BOOKING_STATUS[b.status].label), render: (v) => <EnumTag labels={BOOKING_STATUS} value={v} /> },
          { title: 'NV kinh doanh', responsive: ['xxl'], sorter: (a, b) => byText(a.salesUser?.fullName ?? '', b.salesUser?.fullName ?? ''), render: (_, r) => r.salesUser?.fullName },
          { title: 'Ngày tạo', responsive: ['xxl'], dataIndex: 'createdAt', sorter: (a, b) => a.createdAt.localeCompare(b.createdAt), render: (v) => new Date(v).toLocaleDateString('vi-VN') },
          {
            key: 'edit',
            fixed: 'right',
            render: (_, r) => (
              <Flex gap={6}>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  title={r.status === 'HUY' || !canEdit || !mine(r) ? 'Xem' : 'Sửa'}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/bookings/${r.id}?edit=1`);
                  }}
                >
                  {!compact && (r.status === 'HUY' || !canEdit || !mine(r) ? 'Xem' : 'Sửa')}
                </Button>
                {canEdit && mine(r) && <BookingStatusMenu booking={r} compact={compact} />}
              </Flex>
            ),
          },
        ]}
      />
    </Card>
  );
}
