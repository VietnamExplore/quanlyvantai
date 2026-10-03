import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, DatePicker, Flex, Input, Progress, Row, Segmented, Select, Statistic, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { routeText } from '../booking-utils';
import { formatVnd } from '../components/common';
import { downloadExcel, type ExcelSheet } from '../excel';
import { DRIVER_STATUS, TRIP_STATUS, VEHICLE_STATUS } from '../labels';
import type { DriverStatus, TripStatus, VehicleStatus } from '../types';

// ───── Dữ liệu từ API /reports/trips ─────

interface ReportTrip {
  id: number;
  seq: number;
  status: TripStatus;
  pickupTime: string;
  endTime: string;
  pickupAddress: string;
  dropoffAddress: string | null;
  passengers: number;
  days: number;
  partnerId: number | null;
  partnerPlate: string | null;
  partnerDriverName: string | null;
  service: { code: string; name: string };
  vehicleType: { id: number; name: string };
  vehicle: { id: number; plateNumber: string } | null;
  driver: { id: number; fullName: string } | null;
  partner: { id: number; name: string } | null;
  booking: {
    id: number;
    code: string;
    customerRef: string | null;
    contactName: string;
    customer: { id: number; name: string } | null;
    salesUser: { id: number; fullName: string } | null;
  };
  revenue: number;
  cost: number;
  profit: number;
  costKnown: boolean;
  costActual: boolean;
  partnerCost: number | null;
  driverCosts: number;
}

interface TripsReport {
  from: string;
  to: string;
  ownOnly: boolean;
  trips: ReportTrip[];
  vehicles: { id: number; plateNumber: string; status: VehicleStatus; vehicleType: { name: string } }[];
  drivers: { id: number; fullName: string; phone: string; status: DriverStatus }[];
}

// ───── Gom nhóm ─────

interface Group {
  key: string;
  name: string;
  sub?: string;
  trips: number;
  bookings: number;
  passengers: number;
  hours: number;
  activeDays: number;
  revenue: number;
  cost: number;
  profit: number;
  partnerCost: number;
  driverCosts: number;
}

const tripHours = (t: ReportTrip) => Math.max(0, dayjs(t.endTime).diff(dayjs(t.pickupTime), 'minute') / 60);

/** Các ngày (YYYY-MM-DD) chuyến chiếm dụng xe / lái xe, giới hạn trong kỳ báo cáo */
function tripDays(t: ReportTrip, from: string, to: string) {
  const out: string[] = [];
  let d = dayjs(t.pickupTime).startOf('day');
  const end = dayjs(t.endTime).isAfter(dayjs(t.pickupTime)) ? dayjs(t.endTime).subtract(1, 'minute') : dayjs(t.pickupTime);
  for (let i = 0; i < 400 && !d.isAfter(end, 'day'); i++, d = d.add(1, 'day')) {
    const ymd = d.format('YYYY-MM-DD');
    if (ymd >= from && ymd <= to) out.push(ymd);
  }
  return out;
}

function groupTrips(trips: ReportTrip[], keyOf: (t: ReportTrip) => { key: string; name: string; sub?: string } | null, from: string, to: string, seed: { key: string; name: string; sub?: string }[] = []) {
  const map = new Map<string, Group & { _bookings: Set<number>; _days: Set<string> }>();
  const make = (k: { key: string; name: string; sub?: string }) => ({
    ...k,
    trips: 0,
    bookings: 0,
    passengers: 0,
    hours: 0,
    activeDays: 0,
    revenue: 0,
    cost: 0,
    profit: 0,
    partnerCost: 0,
    driverCosts: 0,
    _bookings: new Set<number>(),
    _days: new Set<string>(),
  });
  for (const s of seed) map.set(s.key, make(s));
  for (const t of trips) {
    const k = keyOf(t);
    if (!k) continue;
    if (!map.has(k.key)) map.set(k.key, make(k));
    const g = map.get(k.key)!;
    g.trips += 1;
    g.passengers += t.passengers;
    g.hours += tripHours(t);
    g.revenue += t.revenue;
    g.cost += t.cost;
    g.profit += t.profit;
    g.partnerCost += t.partnerCost ?? 0;
    g.driverCosts += t.driverCosts;
    g._bookings.add(t.booking.id);
    tripDays(t, from, to).forEach((d) => g._days.add(d));
  }
  return [...map.values()]
    .map(({ _bookings, _days, ...g }) => ({ ...g, bookings: _bookings.size, activeDays: _days.size, hours: Math.round(g.hours * 10) / 10 }))
    .sort((a, b) => b.revenue - a.revenue || b.trips - a.trips || a.name.localeCompare(b.name));
}

const margin = (g: { revenue: number; profit: number }) => (g.revenue > 0 ? Math.round((g.profit / g.revenue) * 1000) / 10 : null);
const customerName = (t: ReportTrip) => t.booking.customer?.name ?? `${t.booking.contactName} (khách lẻ)`;
const assignment = (t: ReportTrip) =>
  t.vehicle
    ? `${t.vehicle.plateNumber}${t.driver ? ` · ${t.driver.fullName}` : ''}`
    : t.partner
      ? `${t.partner.name}${t.partnerPlate ? ` · ${t.partnerPlate}` : ''}`
      : 'Chưa điều xe';

// ───── Cột dùng chung ─────

const money = (v: number) => formatVnd(Math.round(v));
const Profit = ({ v }: { v: number }) => <Typography.Text type={v < 0 ? 'danger' : undefined} strong>{money(v)}</Typography.Text>;
const MarginTag = ({ g }: { g: { revenue: number; profit: number } }) => {
  const m = margin(g);
  return m === null ? null : <Typography.Text type={m < 0 ? 'danger' : 'secondary'}>{m}%</Typography.Text>;
};

function moneyCols(opts: { cost?: boolean } = {}): ColumnsType<Group> {
  return [
    { title: 'Doanh thu', dataIndex: 'revenue', align: 'right', render: money, sorter: (a, b) => a.revenue - b.revenue },
    ...(opts.cost === false ? [] : [{ title: 'Chi phí', dataIndex: 'cost', align: 'right' as const, render: money, sorter: (a: Group, b: Group) => a.cost - b.cost }]),
    { title: 'Lợi nhuận', dataIndex: 'profit', align: 'right', render: (v: number) => <Profit v={v} />, sorter: (a, b) => a.profit - b.profit },
    { title: 'Biên LN', align: 'right', render: (_, g) => <MarginTag g={g} /> },
  ];
}

const sumRow = (rows: Group[]) => rows.reduce((s, g) => ({ trips: s.trips + g.trips, revenue: s.revenue + g.revenue, cost: s.cost + g.cost, profit: s.profit + g.profit }), { trips: 0, revenue: 0, cost: 0, profit: 0 });

// ───── Trang ─────

type Preset = 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear' | 'custom';
const PRESETS: { value: Exclude<Preset, 'custom'>; label: string; range: () => [Dayjs, Dayjs] }[] = [
  { value: 'thisMonth', label: 'Tháng này', range: () => [dayjs().startOf('month'), dayjs().endOf('month')] },
  { value: 'lastMonth', label: 'Tháng trước', range: () => [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
  {
    value: 'thisQuarter',
    label: 'Quý này',
    range: () => {
      const start = dayjs().month(Math.floor(dayjs().month() / 3) * 3).startOf('month');
      return [start, start.add(2, 'month').endOf('month')];
    },
  },
  { value: 'thisYear', label: 'Năm nay', range: () => [dayjs().startOf('year'), dayjs().endOf('year')] },
];

export default function ReportsPage() {
  const { message } = App.useApp();
  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [range, setRange] = useState<[Dayjs, Dayjs]>(PRESETS[0].range());
  const [tab, setTab] = useState('trips');
  const [exporting, setExporting] = useState(false);
  const from = range[0].format('YYYY-MM-DD');
  const to = range[1].format('YYYY-MM-DD');

  const { data, isLoading } = useQuery({
    queryKey: ['/reports/trips', from, to],
    queryFn: () => api<TripsReport>('/reports/trips', { query: { from, to } }),
  });
  const trips = useMemo(() => data?.trips ?? [], [data]);
  const periodDays = range[1].startOf('day').diff(range[0].startOf('day'), 'day') + 1;

  const groups = useMemo(() => {
    const vehicles = groupTrips(
      trips,
      (t) => (t.vehicle ? { key: `v${t.vehicle.id}`, name: t.vehicle.plateNumber } : null),
      from,
      to,
      (data?.vehicles ?? []).map((v) => ({ key: `v${v.id}`, name: v.plateNumber, sub: v.vehicleType.name })),
    );
    const vehicleInfo = new Map((data?.vehicles ?? []).map((v) => [`v${v.id}`, v]));
    vehicles.forEach((g) => (g.sub = g.sub ?? vehicleInfo.get(g.key)?.vehicleType.name));
    return {
      vehicles,
      drivers: groupTrips(
        trips,
        (t) => (t.driver && !t.partnerId ? { key: `d${t.driver.id}`, name: t.driver.fullName } : null),
        from,
        to,
        (data?.drivers ?? []).filter((d) => d.status !== 'NGHI_VIEC').map((d) => ({ key: `d${d.id}`, name: d.fullName, sub: d.phone })),
      ),
      partners: groupTrips(trips, (t) => (t.partner ? { key: `p${t.partner.id}`, name: t.partner.name } : null), from, to),
      customers: groupTrips(trips, (t) => ({ key: t.booking.customer ? `c${t.booking.customer.id}` : `le-${t.booking.contactName}`, name: customerName(t) }), from, to),
      sales: groupTrips(trips, (t) => ({ key: `s${t.booking.salesUser?.id ?? 0}`, name: t.booking.salesUser?.fullName ?? 'Chưa gán NV' }), from, to),
      services: groupTrips(trips, (t) => ({ key: t.service.code, name: t.service.name }), from, to),
      vehicleTypes: groupTrips(trips, (t) => ({ key: `t${t.vehicleType.id}`, name: t.vehicleType.name }), from, to),
    };
  }, [trips, data, from, to]);

  const total = useMemo(() => {
    const s = { revenue: 0, cost: 0, profit: 0, trips: trips.length, passengers: 0, noCost: 0, company: 0, partner: 0, unassigned: 0 };
    for (const t of trips) {
      s.revenue += t.revenue;
      s.cost += t.cost;
      s.profit += t.profit;
      s.passengers += t.passengers;
      if (!t.costKnown) s.noCost++;
      if (t.partnerId) s.partner++;
      else if (t.vehicle) s.company++;
      else s.unassigned++;
    }
    return s;
  }, [trips]);

  const rangeText = `${range[0].format('DD/MM/YYYY')} – ${range[1].format('DD/MM/YYYY')}`;

  async function exportExcel() {
    setExporting(true);
    try {
      const groupSheet = (name: string, title: string, label: string, rows: Group[], extra: { header: string; value: (g: Group) => number | string | null; sum?: boolean }[] = []): ExcelSheet => {
        const headers = [label, ...extra.map((e) => e.header), 'Số chuyến', 'Doanh thu', 'Chi phí', 'Lợi nhuận', 'Biên LN (%)'];
        const base = 1 + extra.length;
        return {
          name,
          title: `${title} · ${rangeText}`,
          headers,
          sumColumns: [...extra.flatMap((e, i) => (e.sum ? [1 + i] : [])), base, base + 1, base + 2, base + 3],
          numberColumns: [base + 4],
          totalLabel: 'Tổng cộng',
          rows: rows.map((g) => [g.sub ? `${g.name} (${g.sub})` : g.name, ...extra.map((e) => e.value(g)), g.trips, Math.round(g.revenue), Math.round(g.cost), Math.round(g.profit), margin(g)]),
        };
      };
      const sheets: ExcelSheet[] = [
        {
          name: 'Chi tiết chuyến',
          title: `BÁO CÁO CHI TIẾT CHUYẾN · ${rangeText}`,
          headers: ['Giờ đón', 'Booking', 'Mã của khách', 'Khách hàng', 'NV kinh doanh', 'Dịch vụ', 'Hành trình', 'Loại xe', 'Số khách', 'Xe / lái xe / nhà xe', 'Trạng thái', 'Doanh thu', 'Chi phí', 'Lợi nhuận', 'Ghi chú chi phí'],
          sumColumns: [8, 11, 12, 13],
          totalLabel: 'Tổng cộng',
          rows: trips.map((t) => [
            dayjs(t.pickupTime).format('DD/MM/YYYY HH:mm'),
            t.booking.code,
            t.booking.customerRef,
            customerName(t),
            t.booking.salesUser?.fullName ?? '',
            t.service.name,
            routeText(t),
            t.vehicleType.name,
            t.passengers,
            assignment(t),
            TRIP_STATUS[t.status].label,
            t.revenue,
            t.cost,
            t.profit,
            !t.costKnown ? 'Chưa có chi phí' : !t.costActual ? 'Chi phí dự kiến' : '',
          ]),
        },
      ];
      if (!data?.ownOnly) {
        sheets.push(
          groupSheet('Hiệu suất xe', 'HIỆU SUẤT XE CÔNG TY', 'Xe', groups.vehicles, [
            { header: 'Ngày hoạt động', value: (g) => g.activeDays, sum: true },
            { header: `Tỷ lệ sử dụng (%/${periodDays} ngày)`, value: (g) => Math.round((g.activeDays / periodDays) * 100) },
            { header: 'Giờ chạy', value: (g) => g.hours, sum: true },
          ]),
          groupSheet('Hiệu suất lái xe', 'HIỆU SUẤT LÁI XE CÔNG TY', 'Lái xe', groups.drivers, [
            { header: 'Ngày làm việc', value: (g) => g.activeDays, sum: true },
            { header: 'Giờ chạy', value: (g) => g.hours, sum: true },
            { header: 'Số khách', value: (g) => g.passengers, sum: true },
            { header: 'Chi phí LX tự nhập', value: (g) => Math.round(g.driverCosts), sum: true },
          ]),
        );
      }
      sheets.push(
        groupSheet('Nhà xe đối tác', 'CHUYẾN GIAO NHÀ XE ĐỐI TÁC', 'Nhà xe', groups.partners, [{ header: 'Giá thuê nhà xe', value: (g) => Math.round(g.partnerCost), sum: true }]),
        groupSheet('Khách hàng', 'DOANH THU THEO KHÁCH HÀNG', 'Khách hàng', groups.customers, [{ header: 'Số booking', value: (g) => g.bookings, sum: true }]),
        groupSheet('NV kinh doanh', 'DOANH THU THEO NHÂN VIÊN KINH DOANH', 'Nhân viên', groups.sales, [{ header: 'Số booking', value: (g) => g.bookings, sum: true }]),
        groupSheet('Dịch vụ', 'DOANH THU THEO DỊCH VỤ', 'Dịch vụ', groups.services, [{ header: 'Số khách', value: (g) => g.passengers, sum: true }]),
        groupSheet('Loại xe', 'DOANH THU THEO LOẠI XE', 'Loại xe', groups.vehicleTypes, [{ header: 'Số khách', value: (g) => g.passengers, sum: true }]),
      );
      await downloadExcel(`bao-cao-${from}-${to}.xlsx`, sheets);
    } catch (e) {
      message.error(`Không xuất được Excel: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  const tabs = [
    { key: 'trips', label: `Chi tiết chuyến (${trips.length})`, children: <TripDetail trips={trips} loading={isLoading} /> },
    ...(data?.ownOnly
      ? []
      : [
          {
            key: 'vehicles',
            label: 'Hiệu suất xe',
            children: (
              <GroupTable
                loading={isLoading}
                rows={groups.vehicles}
                label="Xe công ty"
                note={`Tỷ lệ sử dụng = số ngày xe có chuyến / ${periodDays} ngày trong kỳ. Chỉ tính chuyến chạy bằng xe công ty.`}
                extra={[
                  {
                    title: 'Ngày hoạt động',
                    align: 'right',
                    sorter: (a, b) => a.activeDays - b.activeDays,
                    render: (_, g) => (
                      <Tooltip title={`${g.activeDays}/${periodDays} ngày`}>
                        <Flex vertical style={{ minWidth: 110 }}>
                          <span>{g.activeDays} ngày</span>
                          <Progress percent={Math.round((g.activeDays / periodDays) * 100)} size="small" showInfo={false} />
                        </Flex>
                      </Tooltip>
                    ),
                  },
                  { title: 'Giờ chạy', dataIndex: 'hours', align: 'right', sorter: (a, b) => a.hours - b.hours },
                  {
                    title: 'DT / chuyến',
                    align: 'right',
                    render: (_, g) => (g.trips ? money(g.revenue / g.trips) : ''),
                  },
                ]}
                statusOf={(g) => {
                  const v = data?.vehicles.find((x) => `v${x.id}` === g.key);
                  return v && v.status !== 'SAN_SANG' ? <Tag color={VEHICLE_STATUS[v.status].color}>{VEHICLE_STATUS[v.status].label}</Tag> : null;
                }}
              />
            ),
          },
          {
            key: 'drivers',
            label: 'Hiệu suất lái xe',
            children: (
              <GroupTable
                loading={isLoading}
                rows={groups.drivers}
                label="Lái xe công ty"
                note="Dùng để đối chiếu tính lương / tiền chuyến. Chi phí LX tự nhập = các khoản lái xe ghi trên app (xăng, cầu đường…)."
                extra={[
                  { title: 'Ngày làm việc', dataIndex: 'activeDays', align: 'right', sorter: (a, b) => a.activeDays - b.activeDays },
                  { title: 'Giờ chạy', dataIndex: 'hours', align: 'right', sorter: (a, b) => a.hours - b.hours },
                  { title: 'Số khách', dataIndex: 'passengers', align: 'right' },
                  { title: 'Chi phí LX tự nhập', dataIndex: 'driverCosts', align: 'right', render: money },
                ]}
                statusOf={(g) => {
                  const d = data?.drivers.find((x) => `d${x.id}` === g.key);
                  return d && d.status !== 'DANG_LAM' ? <Tag color={DRIVER_STATUS[d.status].color}>{DRIVER_STATUS[d.status].label}</Tag> : null;
                }}
              />
            ),
          },
        ]),
    {
      key: 'partners',
      label: 'Nhà xe đối tác',
      children: (
        <GroupTable
          loading={isLoading}
          rows={groups.partners}
          label="Nhà xe"
          note="Chi phí = giá thuê nhà xe + chi phí phát sinh của chuyến."
          extra={[{ title: 'Giá thuê nhà xe', dataIndex: 'partnerCost', align: 'right', render: money, sorter: (a, b) => a.partnerCost - b.partnerCost }]}
        />
      ),
    },
    {
      key: 'customers',
      label: 'Khách hàng',
      children: <GroupTable loading={isLoading} rows={groups.customers} label="Khách hàng" extra={[{ title: 'Số booking', dataIndex: 'bookings', align: 'right', sorter: (a, b) => a.bookings - b.bookings }]} />,
    },
    {
      key: 'sales',
      label: 'NV kinh doanh',
      children: <GroupTable loading={isLoading} rows={groups.sales} label="Nhân viên" extra={[{ title: 'Số booking', dataIndex: 'bookings', align: 'right' }]} />,
    },
    {
      key: 'services',
      label: 'Dịch vụ & loại xe',
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12}>
            <GroupTable loading={isLoading} rows={groups.services} label="Dịch vụ" extra={[{ title: 'Số khách', dataIndex: 'passengers', align: 'right' }]} />
          </Col>
          <Col xs={24} xl={12}>
            <GroupTable loading={isLoading} rows={groups.vehicleTypes} label="Loại xe" extra={[{ title: 'Số khách', dataIndex: 'passengers', align: 'right' }]} />
          </Col>
        </Row>
      ),
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Báo cáo
          </Typography.Title>
          <Typography.Text type="secondary">
            Theo ngày đón khách · booking đã xác nhận / hoàn thành · doanh thu đã trừ giảm giá, chưa gồm VAT
            {data?.ownOnly && ' · chỉ booking bạn phụ trách'}
          </Typography.Text>
        </div>
        <Flex gap={8} wrap>
          <Segmented<Preset>
            value={preset}
            options={[...PRESETS.map((p) => ({ value: p.value, label: p.label })), { value: 'custom', label: 'Tùy chọn' }]}
            onChange={(v) => {
              setPreset(v);
              const p = PRESETS.find((x) => x.value === v);
              if (p) setRange(p.range());
            }}
          />
          <DatePicker.RangePicker
            format="DD/MM/YYYY"
            allowClear={false}
            value={range}
            onChange={(v) => {
              if (v?.[0] && v[1]) {
                setRange([v[0], v[1]]);
                setPreset('custom');
              }
            }}
          />
          <Button type="primary" icon={<DownloadOutlined />} loading={exporting} disabled={isLoading} onClick={exportExcel}>
            Xuất Excel
          </Button>
        </Flex>
      </Flex>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Doanh thu" value={Math.round(total.revenue)} formatter={(v) => `${formatVnd(Number(v))} đ`} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Chi phí" value={Math.round(total.cost)} formatter={(v) => `${formatVnd(Number(v))} đ`} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={
                <>
                  Lợi nhuận <MarginTag g={total} />
                </>
              }
              value={Math.round(total.profit)}
              formatter={(v) => `${formatVnd(Number(v))} đ`}
              styles={{ content: total.profit < 0 ? { color: '#cf1322' } : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Số chuyến · khách" value={`${total.trips} chuyến · ${total.passengers} khách`} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Xe công ty {total.company} · Nhà xe {total.partner}
              {total.unassigned > 0 && ` · Chưa điều ${total.unassigned}`}
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      {total.noCost > 0 && (
        <Alert
          type="warning"
          showIcon
          title={`${total.noCost} chuyến chưa có chi phí (chưa nhập chi phí dự kiến / thực tế) nên lợi nhuận đang tính cao hơn thực tế.`}
        />
      )}

      <Card>
        <Tabs activeKey={tab} onChange={setTab} items={tabs} />
      </Card>
    </Flex>
  );
}

// ───── Bảng chi tiết chuyến ─────

function TripDetail({ trips, loading }: { trips: ReportTrip[]; loading: boolean }) {
  const [q, setQ] = useState('');
  const [service, setService] = useState<string>();
  const [kind, setKind] = useState<'all' | 'company' | 'partner' | 'none'>('all');

  const services = useMemo(() => [...new Map(trips.map((t) => [t.service.code, t.service.name])).entries()].map(([value, label]) => ({ value, label })), [trips]);
  const rows = trips.filter((t) => {
    if (service && t.service.code !== service) return false;
    if (kind === 'company' && !t.vehicle) return false;
    if (kind === 'partner' && !t.partnerId) return false;
    if (kind === 'none' && (t.vehicle || t.partnerId)) return false;
    if (!q) return true;
    const text = [t.booking.code, t.booking.customerRef, customerName(t), t.booking.salesUser?.fullName, routeText(t), assignment(t)].join(' ').toLowerCase();
    return text.includes(q.toLowerCase());
  });
  const sum = rows.reduce((s, t) => ({ revenue: s.revenue + t.revenue, cost: s.cost + t.cost, profit: s.profit + t.profit }), { revenue: 0, cost: 0, profit: 0 });

  return (
    <>
      <Flex gap={8} wrap style={{ marginBottom: 12 }}>
        <Input allowClear prefix={<SearchOutlined />} placeholder="Booking, khách, tuyến, xe, lái xe" style={{ width: 280 }} onChange={(e) => setQ(e.target.value)} />
        <Select allowClear placeholder="Dịch vụ" style={{ width: 200 }} options={services} onChange={setService} />
        <Segmented
          value={kind}
          onChange={(v) => setKind(v as typeof kind)}
          options={[
            { value: 'all', label: 'Tất cả' },
            { value: 'company', label: 'Xe công ty' },
            { value: 'partner', label: 'Nhà xe' },
            { value: 'none', label: 'Chưa điều' },
          ]}
        />
      </Flex>
      <Table<ReportTrip>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 50, hideOnSinglePage: true, showTotal: (n) => `${n} chuyến` }}
        locale={{ emptyText: 'Không có chuyến trong kỳ' }}
        columns={[
          { title: 'Giờ đón', dataIndex: 'pickupTime', render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm'), sorter: (a, b) => a.pickupTime.localeCompare(b.pickupTime), defaultSortOrder: 'ascend' },
          {
            title: 'Booking',
            render: (_, t) => (
              <>
                <Link to={`/bookings/${t.booking.id}`}>{t.booking.code}</Link>
                {t.booking.customerRef && (
                  <div>
                    <Typography.Text type="secondary">{t.booking.customerRef}</Typography.Text>
                  </div>
                )}
              </>
            ),
          },
          { title: 'Khách hàng', render: (_, t) => customerName(t) },
          { title: 'Dịch vụ', render: (_, t) => t.service.name },
          { title: 'Hành trình', render: (_, t) => <div style={{ maxWidth: 260, whiteSpace: 'normal' }}>{routeText(t)}</div> },
          { title: 'Loại xe', render: (_, t) => `${t.vehicleType.name} · ${t.passengers} khách` },
          { title: 'Xe / nhà xe', render: (_, t) => (t.vehicle || t.partnerId ? assignment(t) : <Typography.Text type="warning">Chưa điều xe</Typography.Text>) },
          { title: 'Doanh thu', dataIndex: 'revenue', align: 'right', render: money, sorter: (a, b) => a.revenue - b.revenue },
          {
            title: 'Chi phí',
            dataIndex: 'cost',
            align: 'right',
            sorter: (a, b) => a.cost - b.cost,
            render: (v, t) =>
              !t.costKnown ? (
                <Tag color="orange">Chưa có</Tag>
              ) : (
                <>
                  {money(v)}
                  {!t.costActual && (
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        dự kiến
                      </Typography.Text>
                    </div>
                  )}
                </>
              ),
          },
          { title: 'Lợi nhuận', dataIndex: 'profit', align: 'right', render: (v) => <Profit v={v} />, sorter: (a, b) => a.profit - b.profit },
        ]}
        summary={() =>
          rows.length > 0 && (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={7}>
                  <b>Tổng {rows.length} chuyến</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right">
                  <b>{money(sum.revenue)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">
                  <b>{money(sum.cost)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={9} align="right">
                  <Profit v={sum.profit} />
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )
        }
      />
    </>
  );
}

// ───── Bảng gom nhóm ─────

function GroupTable({
  rows,
  label,
  extra = [],
  note,
  loading,
  statusOf,
}: {
  rows: Group[];
  label: string;
  extra?: ColumnsType<Group>;
  note?: string;
  loading: boolean;
  statusOf?: (g: Group) => React.ReactNode;
}) {
  const sum = sumRow(rows);
  const cols: ColumnsType<Group> = [
    {
      title: label,
      render: (_, g) => (
        <>
          <b>{g.name}</b> {statusOf?.(g)}
          {g.sub && (
            <div>
              <Typography.Text type="secondary">{g.sub}</Typography.Text>
            </div>
          )}
        </>
      ),
    },
    { title: 'Số chuyến', dataIndex: 'trips', align: 'right', sorter: (a, b) => a.trips - b.trips },
    ...extra,
    ...moneyCols(),
  ];
  return (
    <>
      {note && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          {note}
        </Typography.Paragraph>
      )}
      <Table<Group>
        rowKey="key"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={cols}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: 'Không có dữ liệu trong kỳ' }}
        summary={() =>
          rows.length > 1 && (
            <Table.Summary>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <b>Tổng cộng</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <b>{sum.trips}</b>
                </Table.Summary.Cell>
                {extra.map((_, i) => (
                  <Table.Summary.Cell key={i} index={2 + i} />
                ))}
                <Table.Summary.Cell index={2 + extra.length} align="right">
                  <b>{money(sum.revenue)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3 + extra.length} align="right">
                  <b>{money(sum.cost)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4 + extra.length} align="right">
                  <Profit v={sum.profit} />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5 + extra.length} align="right">
                  <MarginTag g={sum} />
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )
        }
      />
    </>
  );
}
