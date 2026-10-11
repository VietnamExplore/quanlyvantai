import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Badge, Button, Card, Col, DatePicker, Empty, Flex, Row, Segmented, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useCompanyDriverOptions } from '../components/common';
import { GpsMap, type MapMarker } from '../components/GpsMap';

interface LiveDriver {
  id: number;
  fullName: string;
  phone: string;
  lat: number;
  lng: number;
  speed: number | null;
  at: string;
  plate: string | null;
  trip: { id: number; status: string; pickupTime: string; pickupAddress: string; dropoffAddress: string | null; passengers: number; booking: { id: number; code: string } } | null;
}
interface LiveData {
  config: { speedLimit: number; stopMinutes: number; lostMinutes: number };
  drivers: LiveDriver[];
}
interface GpsAlert {
  id: number;
  type: string;
  label: string;
  lat: number | null;
  lng: number | null;
  value: number | null;
  note: string | null;
  at: string;
  seenAt: string | null;
  seenBy: string | null;
  driver: { id: number; fullName: string; phone: string } | null;
  vehicle: { id: number; plateNumber: string } | null;
  trip: { id: number; booking: { id: number; code: string } } | null;
  tripId: number | null;
  driverId: number;
}
interface Track {
  points: { lat: number; lng: number; speed: number | null; at: string; tripId: number | null }[];
  count: number;
  km: number;
  maxSpeed: number;
  start: string | null;
  end: string | null;
  alerts: { id: number; type: string; lat: number | null; lng: number | null; value: number | null; note: string | null; at: string }[];
}

const ALERT_COLOR: Record<string, string> = { QUA_TOC_DO: 'red', DUNG_LAU: 'orange', MAT_TIN_HIEU: 'purple' };
const TRIP_STATUS: Record<string, string> = { TAI_XE_NHAN: 'Đã nhận', DANG_DEN_DON: 'Đang đến đón', DA_DON_KHACH: 'Đang chở khách', HOAN_THANH: 'Hoàn thành', HUY: 'Hủy' };
const ago = (s: string) => {
  const m = Math.round((Date.now() - +new Date(s)) / 60_000);
  return m < 1 ? 'vừa xong' : m < 60 ? `${m} phút trước` : `${Math.floor(m / 60)} giờ ${m % 60} phút trước`;
};

/** Màu xe: chạy (xanh), dừng (cam), quá tốc độ (đỏ), mất tín hiệu (xám) */
function stateOf(d: LiveDriver, cfg: LiveData['config']) {
  const mins = (Date.now() - +new Date(d.at)) / 60_000;
  if (mins > cfg.lostMinutes) return { color: '#8c8c8c', label: 'Mất tín hiệu' };
  if ((d.speed ?? 0) > cfg.speedLimit) return { color: '#f5222d', label: 'Quá tốc độ' };
  if ((d.speed ?? 0) >= 3) return { color: '#16a34a', label: 'Đang chạy' };
  return { color: '#fa8c16', label: 'Đang dừng' };
}

function LiveView() {
  const { data, isFetching, refetch } = useQuery({ queryKey: ['/gps/live'], queryFn: () => api<LiveData>('/gps/live'), refetchInterval: 20_000 });
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const drivers = useMemo(() => data?.drivers ?? [], [data]);
  // Canh khung khi số xe thay đổi (không giật bản đồ mỗi lần làm mới vị trí)
  const fitKey = drivers.map((d) => d.id).join(',');
  const fit = useMemo(() => drivers.map((d) => [d.lat, d.lng] as [number, number]), [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const markers = useMemo<MapMarker[]>(
    () =>
      data
        ? drivers.map((d) => ({
            key: String(d.id),
            lat: d.lat,
            lng: d.lng,
            color: stateOf(d, data.config).color,
            label: `${d.plate ?? d.fullName} · ${Math.round(d.speed ?? 0)} km/h`,
            permanent: drivers.length <= 15,
          }))
        : [],
    [data, drivers],
  );

  return (
    <Row gutter={12}>
      <Col xs={24} lg={16}>
        <GpsMap markers={markers} fit={focus ? undefined : fit} focus={focus} />
      </Col>
      <Col xs={24} lg={8}>
        <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
          <Typography.Text strong>{drivers.length} xe có tín hiệu (12 giờ qua)</Typography.Text>
          <Button size="small" loading={isFetching} onClick={() => refetch()}>
            Làm mới
          </Button>
        </Flex>
        {!drivers.length && <Empty description="Chưa có xe nào gửi vị trí. Lái xe bấm “Bắt đầu đi đón” trên app thì vị trí sẽ hiện ở đây." />}
        <Flex vertical gap={8} style={{ maxHeight: 520, overflow: 'auto' }}>
          {data &&
            drivers.map((d) => {
              const st = stateOf(d, data.config);
              return (
                <Card key={d.id} size="small" hoverable onClick={() => setFocus([d.lat, d.lng])}>
                  <Flex justify="space-between" align="center">
                    <b>{d.plate ?? '—'}</b>
                    <Tag color={st.color}>{st.label}</Tag>
                  </Flex>
                  <div>
                    {d.fullName} · <a href={`tel:${d.phone}`}>{d.phone}</a>
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                    {Math.round(d.speed ?? 0)} km/h · cập nhật {ago(d.at)}
                  </Typography.Text>
                  {d.trip && (
                    <div style={{ fontSize: 12.5, marginTop: 4 }}>
                      <Link to={`/bookings/${d.trip.booking.id}`} onClick={(e) => e.stopPropagation()}>
                        {d.trip.booking.code}
                      </Link>{' '}
                      · {TRIP_STATUS[d.trip.status] ?? d.trip.status} · {d.trip.pickupAddress}
                      {d.trip.dropoffAddress && ` → ${d.trip.dropoffAddress}`}{' '}
                      <Link to={`/gps?view=track&trip=${d.trip.id}`} onClick={(e) => e.stopPropagation()}>
                        Lộ trình
                      </Link>
                    </div>
                  )}
                </Card>
              );
            })}
        </Flex>
        {data && (
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
            Cảnh báo: quá {data.config.speedLimit} km/h · dừng quá {data.config.stopMinutes} phút khi đang chở khách · mất tín hiệu quá {data.config.lostMinutes} phút (sửa ở Cài đặt).
          </Typography.Paragraph>
        )}
      </Col>
    </Row>
  );
}

function TrackView() {
  const [params, setParams] = useSearchParams();
  const tripId = Number(params.get('trip')) || undefined;
  const [driverId, setDriverId] = useState<number | undefined>(Number(params.get('driver')) || undefined);
  const [date, setDate] = useState<Dayjs>(params.get('date') ? dayjs(params.get('date')) : dayjs());
  const drivers = useCompanyDriverOptions();
  const { data, isFetching } = useQuery({
    queryKey: ['/gps/track', tripId, driverId, date.format('YYYY-MM-DD')],
    queryFn: () => api<Track>('/gps/track', { query: tripId ? { tripId } : { driverId, date: date.format('YYYY-MM-DD') } }),
    enabled: !!tripId || !!driverId,
  });
  const line = useMemo(() => (data?.points ?? []).map((p) => [p.lat, p.lng] as [number, number]), [data]);
  const first = data?.points[0];
  const last = data?.points[data.points.length - 1];
  // Điểm bắt đầu (xanh), cuối (đỏ), các cảnh báo (vòng tròn)
  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (first) out.push({ key: 'start', lat: first.lat, lng: first.lng, color: '#16a34a', label: `Bắt đầu ${dayjs(first.at).format('HH:mm')}` });
    if (last && last !== first) out.push({ key: 'end', lat: last.lat, lng: last.lng, color: '#f5222d', label: `Cuối ${dayjs(last.at).format('HH:mm')}` });
    for (const a of data?.alerts ?? []) {
      if (a.lat != null && a.lng != null) out.push({ key: `a${a.id}`, lat: a.lat, lng: a.lng, color: ({ QUA_TOC_DO: '#f5222d', DUNG_LAU: '#fa8c16', MAT_TIN_HIEU: '#722ed1' } as Record<string, string>)[a.type] ?? '#f5222d', label: `${dayjs(a.at).format('HH:mm')} · ${a.note ?? ''}`, ring: true });
    }
    return out;
  }, [data, first, last]);

  return (
    <>
      <Flex gap={8} wrap style={{ marginBottom: 12 }} align="center">
        {tripId ? (
          <>
            <Tag color="blue">Lộ trình chuyến #{tripId}</Tag>
            <Button size="small" onClick={() => setParams((p) => (p.delete('trip'), p), { replace: true })}>
              Xem theo lái xe / ngày
            </Button>
          </>
        ) : (
          <>
            <Select showSearch optionFilterProp="label" placeholder="Chọn lái xe" style={{ width: 220 }} value={driverId} onChange={setDriverId} options={drivers} />
            <DatePicker value={date} onChange={(d) => d && setDate(d)} format="DD/MM/YYYY" allowClear={false} />
          </>
        )}
      </Flex>
      <Row gutter={12}>
        <Col xs={24} lg={17}>
          <GpsMap markers={markers} line={line} fit={line.length ? line : undefined} />
        </Col>
        <Col xs={24} lg={7}>
          {!tripId && !driverId ? (
            <Empty description="Chọn lái xe và ngày để xem lộ trình" />
          ) : !data?.count ? (
            <Empty description={isFetching ? 'Đang tải…' : 'Không có dữ liệu vị trí'} />
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Row gutter={8}>
                <Col span={12}>
                  <Statistic title="Quãng đường (GPS)" value={data.km} suffix="km" />
                </Col>
                <Col span={12}>
                  <Statistic title="Tốc độ cao nhất" value={data.maxSpeed} suffix="km/h" />
                </Col>
              </Row>
              <Typography.Text type="secondary">
                {dayjs(data.start).format('HH:mm DD/MM')} → {dayjs(data.end).format('HH:mm DD/MM')} · {data.count} điểm
              </Typography.Text>
              {data.alerts.map((a) => (
                <div key={a.id}>
                  <Tag color={ALERT_COLOR[a.type]}>{dayjs(a.at).format('HH:mm')}</Tag>
                  {a.note}
                </div>
              ))}
            </Space>
          )}
        </Col>
      </Row>
    </>
  );
}

function AlertsView() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [days, setDays] = useState(7);
  const { data = [], isLoading } = useQuery({ queryKey: ['/gps/alerts', days], queryFn: () => api<GpsAlert[]>('/gps/alerts', { query: { days } }), refetchInterval: 60_000 });
  const unseen = data.filter((a) => !a.seenAt).map((a) => a.id);
  const markSeen = async (ids: number[]) => {
    await api('/gps/alerts/seen', { method: 'POST', body: { ids } });
    qc.invalidateQueries({ queryKey: ['/gps/alerts'] });
    qc.invalidateQueries({ queryKey: ['/gps/alerts/unseen-count'] });
    message.success('Đã đánh dấu đã xem');
  };
  return (
    <>
      <Flex gap={8} style={{ marginBottom: 12 }} wrap>
        <Segmented value={days} onChange={(v) => setDays(Number(v))} options={[{ value: 1, label: 'Hôm nay' }, { value: 7, label: '7 ngày' }, { value: 30, label: '30 ngày' }]} />
        <Button disabled={!unseen.length} onClick={() => markSeen(unseen)}>
          Đánh dấu đã xem tất cả ({unseen.length})
        </Button>
      </Flex>
      <Table<GpsAlert>
        rowKey="id"
        size="middle"
        loading={isLoading}
        dataSource={data}
        scroll={{ x: 800 }}
        pagination={{ pageSize: 30, hideOnSinglePage: true }}
        rowClassName={(r) => (r.seenAt ? '' : 'ant-table-row-selected')}
        columns={[
          { title: 'Thời điểm', dataIndex: 'at', width: 130, render: (v) => dayjs(v).format('HH:mm DD/MM') },
          { title: 'Cảnh báo', width: 200, render: (_, r) => <Tag color={ALERT_COLOR[r.type]}>{r.label}</Tag> },
          { title: 'Chi tiết', dataIndex: 'note' },
          { title: 'Xe / lái xe', width: 190, render: (_, r) => <>{r.vehicle?.plateNumber && <b>{r.vehicle.plateNumber} </b>}{r.driver?.fullName}</> },
          {
            title: 'Chuyến',
            width: 170,
            render: (_, r) =>
              r.trip ? (
                <>
                  <Link to={`/bookings/${r.trip.booking.id}`}>{r.trip.booking.code}</Link> · <Link to={`/gps?view=track&trip=${r.trip.id}`}>Lộ trình</Link>
                </>
              ) : null,
          },
          {
            title: '',
            width: 110,
            render: (_, r) =>
              r.seenAt ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {r.seenBy} đã xem
                </Typography.Text>
              ) : (
                <Button size="small" onClick={() => markSeen([r.id])}>
                  Đã xem
                </Button>
              ),
          },
        ]}
      />
    </>
  );
}

/** Giám sát hành trình: vị trí xe trực tiếp, xem lại lộ trình, cảnh báo */
export default function GpsPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? (params.get('trip') ? 'track' : params.get('alert') ? 'alerts' : 'live');
  const { data: unseen } = useQuery({ queryKey: ['/gps/alerts/unseen-count'], queryFn: () => api<{ count: number }>('/gps/alerts/unseen-count'), refetchInterval: 60_000 });
  return (
    <Card>
      <Segmented
        style={{ marginBottom: 12 }}
        value={view}
        onChange={(v) => setParams({ view: String(v) }, { replace: true })}
        options={[
          { value: 'live', label: 'Vị trí trực tiếp' },
          { value: 'track', label: 'Xem lại lộ trình' },
          {
            value: 'alerts',
            label: (
              <Badge count={unseen?.count ?? 0} size="small" offset={[8, -2]}>
                Cảnh báo
              </Badge>
            ),
          },
        ]}
      />
      {view === 'live' && <LiveView />}
      {view === 'track' && <TrackView />}
      {view === 'alerts' && <AlertsView />}
    </Card>
  );
}
