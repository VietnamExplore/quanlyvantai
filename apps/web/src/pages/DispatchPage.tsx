import { LeftOutlined, RightOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Col, DatePicker, Empty, Flex, Input, Row, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtTime, routeText } from '../booking-utils';
import { EnumTag } from '../components/common';
import { TripDispatchDrawer } from '../components/TripDispatchDrawer';
import { assignmentText, BLOCK_COLOR } from '../dispatch-utils';
import { TRIP_STATUS, toOptions } from '../labels';
import type { DispatchTrip, Schedule, TripStatus } from '../types';

const DAY_MS = 86_400_000;
const LABEL_W = 190;

/** Một khối chuyến trên dòng thời gian của xe */
function TripBlock({ trip, day, onOpen }: { trip: DispatchTrip; day: Dayjs; onOpen: (id: number) => void }) {
  const start = day.startOf('day').valueOf();
  const s = Math.max(dayjs(trip.pickupTime).valueOf(), start);
  const e = Math.min(dayjs(trip.endTime).valueOf(), start + DAY_MS);
  const left = ((s - start) / DAY_MS) * 100;
  const width = Math.max(((e - s) / DAY_MS) * 100, 1.5);
  const c = BLOCK_COLOR[trip.status];
  return (
    <Tooltip
      title={
        <>
          <b>{trip.booking.code}</b> · {TRIP_STATUS[trip.status].label}
          <div>
            {dayjs(trip.pickupTime).format('HH:mm DD/MM')} → {dayjs(trip.endTime).format('HH:mm DD/MM')}
          </div>
          <div>{routeText(trip)}</div>
          <div>
            {trip.passengers} khách · {trip.driver?.fullName ?? 'chưa có lái xe'}
          </div>
        </>
      }
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(trip.id)}
        onKeyDown={(ev) => ev.key === 'Enter' && onOpen(trip.id)}
        style={{
          position: 'absolute',
          left: `${left}%`,
          width: `${width}%`,
          top: 6,
          bottom: 6,
          background: c.bg,
          borderLeft: `3px solid ${c.border}`,
          borderRadius: 4,
          padding: '2px 6px',
          fontSize: 12,
          lineHeight: '16px',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.04)',
        }}
      >
        <b>{dayjs(trip.pickupTime).format('HH:mm')}</b> {trip.booking.code}
        <div style={{ color: '#52514e', textOverflow: 'ellipsis', overflow: 'hidden' }}>{trip.pickupAddress}</div>
      </div>
    </Tooltip>
  );
}

function Timeline({ data, day, onOpen }: { data: Schedule; day: Dayjs; onOpen: (id: number) => void }) {
  const isToday = day.isSame(dayjs(), 'day');
  const nowPct = ((dayjs().valueOf() - day.startOf('day').valueOf()) / DAY_MS) * 100;
  const hours = Array.from({ length: 13 }, (_, i) => i * 2);

  if (!data.vehicles.length) {
    return <Empty description="Chưa có xe công ty. Thêm xe ở menu Danh mục → Xe." />;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 640 }}>
        {/* Thước giờ */}
        <Flex style={{ borderBottom: '1px solid #ebebea', paddingBottom: 4 }}>
          <div style={{ width: LABEL_W, flexShrink: 0 }} />
          <div style={{ position: 'relative', flex: 1, height: 18 }}>
            {hours.map((h) => (
              <span
                key={h}
                style={{
                  position: 'absolute',
                  left: `${(h / 24) * 100}%`,
                  // Nhãn đầu/cuối canh vào trong để không tràn ra ngoài khung
                  transform: h === 0 ? 'none' : h === 24 ? 'translateX(-100%)' : 'translateX(-50%)',
                  fontSize: 11,
                  color: '#8a8984',
                }}
              >
                {h}h
              </span>
            ))}
          </div>
        </Flex>
        {data.vehicles.map((v) => (
          <Flex key={v.id} style={{ borderBottom: '1px solid #f0f0ef', minHeight: 52 }} align="stretch">
            <div style={{ width: LABEL_W, flexShrink: 0, padding: '6px 8px 6px 0' }}>
              <b>{v.plateNumber}</b>
              {v.status !== 'SAN_SANG' && (
                <Tag color="orange" style={{ marginLeft: 4 }}>
                  {v.status === 'BAO_DUONG' ? 'Bảo dưỡng' : 'Ngừng'}
                </Tag>
              )}
              <div style={{ fontSize: 12, color: '#52514e' }}>
                {v.vehicleType.name}
                {v.defaultDriver && ` · ${v.defaultDriver.fullName}`}
              </div>
            </div>
            <div
              style={{
                position: 'relative',
                flex: 1,
                // Vạch giờ mờ mỗi 2 tiếng
                backgroundImage: 'repeating-linear-gradient(to right, #f3f3f2 0, #f3f3f2 1px, transparent 1px, transparent calc(100% / 12))',
              }}
            >
              {v.trips.map((t) => (
                <TripBlock key={t.id} trip={t} day={day} onOpen={onOpen} />
              ))}
              {isToday && nowPct >= 0 && nowPct <= 100 && (
                <div style={{ position: 'absolute', left: `${nowPct}%`, top: 0, bottom: 0, width: 2, background: '#e34948' }} title="Bây giờ" />
              )}
            </div>
          </Flex>
        ))}
      </div>
    </div>
  );
}

function WaitingList({ trips, onOpen }: { trips: DispatchTrip[]; onOpen: (id: number) => void }) {
  if (!trips.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có chuyến chờ điều xe" />;
  return (
    <Flex vertical gap={8}>
      {trips.map((t) => {
        const late = dayjs(t.pickupTime).isBefore(dayjs());
        return (
          <Card key={t.id} size="small" hoverable onClick={() => onOpen(t.id)} styles={{ body: { padding: 10 } }} style={{ borderLeft: `3px solid ${late ? '#e34948' : '#eb6834'}` }}>
            <Flex justify="space-between">
              <b>{dayjs(t.pickupTime).format('HH:mm DD/MM')}</b>
              <Typography.Text type="secondary">{t.booking.code}</Typography.Text>
            </Flex>
            <div style={{ fontSize: 13 }}>{routeText(t)}</div>
            <Flex justify="space-between" style={{ fontSize: 12, marginTop: 2 }}>
              <span>
                {t.vehicleType.name} · {t.passengers} khách
              </span>
              {late && (
                <Typography.Text type="danger">
                  <WarningOutlined /> Quá giờ đón
                </Typography.Text>
              )}
            </Flex>
          </Card>
        );
      })}
    </Flex>
  );
}

function TripList({ onOpen }: { onOpen: (id: number) => void }) {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs(), dayjs().add(6, 'day')]);
  const [status, setStatus] = useState<TripStatus>();
  const [q, setQ] = useState<string>();
  const query = { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD'), status, q };
  const { data = [], isFetching } = useQuery({
    queryKey: ['/dispatch', 'trips', query],
    queryFn: () => api<DispatchTrip[]>('/dispatch/trips', { query }),
  });
  return (
    <>
      <Flex gap={8} wrap style={{ marginBottom: 12 }}>
        <DatePicker.RangePicker format="DD/MM/YYYY" allowClear={false} value={range} onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])} />
        <Select allowClear placeholder="Trạng thái" style={{ width: 170 }} options={toOptions(TRIP_STATUS)} onChange={setStatus} />
        <Input.Search allowClear placeholder="Mã booking, tên khách" style={{ width: 220 }} onSearch={(v) => setQ(v || undefined)} />
      </Flex>
      <Table<DispatchTrip>
        rowKey="id"
        size="middle"
        loading={isFetching}
        dataSource={data}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        onRow={(t) => ({ onClick: () => onOpen(t.id), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Giờ đón', render: (_, t) => <b>{fmtTime(t.pickupTime)}</b> },
          { title: 'Booking', render: (_, t) => t.booking.code },
          { title: 'Khách', render: (_, t) => t.booking.customer?.name ?? t.booking.contactName },
          { title: 'Hành trình', render: (_, t) => <div style={{ maxWidth: 280, whiteSpace: 'normal' }}>{routeText(t)}</div> },
          { title: 'Yêu cầu', render: (_, t) => `${t.vehicleType.name} · ${t.passengers} khách` },
          { title: 'Xe được gán', render: (_, t) => assignmentText(t) || <Typography.Text type="warning">Chưa điều</Typography.Text> },
          { title: 'Trạng thái', dataIndex: 'status', render: (v) => <EnumTag labels={TRIP_STATUS} value={v} /> },
        ]}
      />
    </>
  );
}

export default function DispatchPage() {
  const [view, setView] = useState<'timeline' | 'list'>(() => {
    try {
      return (localStorage.getItem('dispatch_view') as 'timeline' | 'list') || 'timeline';
    } catch {
      return 'timeline';
    }
  });
  const [day, setDay] = useState<Dayjs>(dayjs());
  const [openTrip, setOpenTrip] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('dispatch_view', view);
    } catch {
      /* bỏ qua */
    }
  }, [view]);

  const ymd = day.format('YYYY-MM-DD');
  const { data, isLoading } = useQuery({
    queryKey: ['/dispatch', 'schedule', ymd],
    queryFn: () => api<Schedule>('/dispatch/schedule', { query: { from: ymd } }),
    refetchInterval: 60_000,
  });

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Điều xe
        </Typography.Title>
        <Space wrap>
          <Segmented
            value={view}
            onChange={(v) => setView(v as 'timeline' | 'list')}
            options={[
              { value: 'timeline', label: 'Lịch xe theo ngày' },
              { value: 'list', label: 'Danh sách chuyến' },
            ]}
          />
          {view === 'timeline' && (
            <Space.Compact>
              <Button icon={<LeftOutlined />} onClick={() => setDay(day.subtract(1, 'day'))} />
              <DatePicker value={day} allowClear={false} format="dd DD/MM/YYYY" onChange={(v) => v && setDay(v)} />
              <Button icon={<RightOutlined />} onClick={() => setDay(day.add(1, 'day'))} />
              <Button onClick={() => setDay(dayjs())}>Hôm nay</Button>
            </Space.Compact>
          )}
        </Space>
      </Flex>

      {!!data?.overdueCount && (
        <Alert
          type="error"
          showIcon
          title={`Có ${data.overdueCount} chuyến đã qua giờ đón nhưng chưa được điều xe.`}
          description='Xem ở "Danh sách chuyến", lọc trạng thái "Chờ điều xe".'
        />
      )}

      {view === 'list' ? (
        <Card>
          <TripList onOpen={setOpenTrip} />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={6}>
            <Card
              title={
                <Space>
                  Chờ điều xe <Badge count={data?.waiting.length ?? 0} showZero color={data?.waiting.length ? '#eb6834' : '#bfbfbf'} />
                </Space>
              }
              loading={isLoading}
              styles={{ body: { maxHeight: 640, overflowY: 'auto' } }}
            >
              <WaitingList trips={data?.waiting ?? []} onOpen={setOpenTrip} />
            </Card>
          </Col>
          <Col xs={24} xl={18}>
            <Card title={`Lịch xe công ty · ${day.format('dddd, DD/MM/YYYY')}`} loading={isLoading}>
              {data && <Timeline data={data} day={day} onOpen={setOpenTrip} />}
              <Flex gap={12} wrap style={{ marginTop: 12, fontSize: 12 }}>
                {(['DA_GAN', 'TAI_XE_NHAN', 'DANG_DEN_DON', 'HOAN_THANH'] as TripStatus[]).map((s) => (
                  <Flex key={s} align="center" gap={4}>
                    <span style={{ width: 12, height: 12, borderRadius: 2, background: BLOCK_COLOR[s].bg, borderLeft: `3px solid ${BLOCK_COLOR[s].border}` }} />
                    {s === 'DANG_DEN_DON' ? 'Đang chạy' : TRIP_STATUS[s].label}
                  </Flex>
                ))}
                {day.isSame(dayjs(), 'day') && (
                  <Flex align="center" gap={4}>
                    <span style={{ width: 2, height: 12, background: '#e34948' }} /> Bây giờ
                  </Flex>
                )}
              </Flex>
            </Card>

            <Card title={`Chuyến giao nhà xe đối tác (${data?.partnerTrips.length ?? 0})`} style={{ marginTop: 16 }} loading={isLoading}>
              <Table<DispatchTrip>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={data?.partnerTrips ?? []}
                locale={{ emptyText: 'Không có chuyến giao đối tác trong ngày' }}
                onRow={(t) => ({ onClick: () => setOpenTrip(t.id), style: { cursor: 'pointer' } })}
                scroll={{ x: 'max-content' }}
                columns={[
                  { title: 'Giờ', render: (_, t) => <b>{dayjs(t.pickupTime).format('HH:mm')}</b> },
                  { title: 'Booking', render: (_, t) => t.booking.code },
                  { title: 'Nhà xe', render: (_, t) => t.partner?.name },
                  { title: 'Xe / tài xế', render: (_, t) => [t.partnerPlate, t.partnerDriverName, t.partnerDriverPhone].filter(Boolean).join(' · ') },
                  { title: 'Hành trình', render: (_, t) => routeText(t) },
                  { title: 'Trạng thái', dataIndex: 'status', render: (v) => <EnumTag labels={TRIP_STATUS} value={v} /> },
                ]}
              />
            </Card>
          </Col>
        </Row>
      )}

      <TripDispatchDrawer tripId={openTrip} onClose={() => setOpenTrip(null)} />
    </Flex>
  );
}
