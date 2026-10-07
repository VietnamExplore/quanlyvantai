import { ClearOutlined, DownloadOutlined, FileExcelOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, DatePicker, Flex, Input, Progress, Row, Segmented, Select, Statistic, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { routeText } from '../booking-utils';
import { formatVnd, paged } from '../components/common';
import { DriverSalaryModal } from '../components/DriverSalary';
import { fileSlug } from '../components/FinanceFilter';
import { downloadExcel, type ExcelSheet } from '../excel';
import { DRIVER_STATUS, TRIP_STATUS, VEHICLE_STATUS } from '../labels';
import type { DriverStatus, TripStatus, VehicleStatus } from '../types';
import { ResponsiveTable } from '../components/ResponsiveTable';

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
  /** Số km đầu / cuối lái xe công ty ghi trên app */
  startKm: number | null;
  endKm: number | null;
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

// ───── Lương lái xe (API /reports/driver-pay, chỉ Admin / Kế toán) ─────

interface PayMonth {
  month: string;
  from: string;
  to: string;
  days: number;
  daysInMonth: number;
  hasRate: boolean;
  baseSalary: number;
  commissionPercent: number;
  baseAmount: number;
  trips: number;
  revenue: number;
  commission: number;
  total: number;
  reimbursement: number;
  advanceTaken: number;
  netPay: number;
}

interface DriverAdvance {
  id: string;
  amount: number;
  spentAt: string;
  note: string | null;
  category: string;
  tripId: number | null;
  pickupTime: string;
  tripStatus: TripStatus | null;
  /** null = khoản xăng dầu lái xe tự ứng (không gắn chuyến) */
  booking: { id: number; code: string } | null;
}

interface DriverPay {
  driverId: number;
  fullName: string;
  phone: string;
  status: DriverStatus;
  missingRate: boolean;
  baseSalary: number;
  commissionPercent: number;
  trips: number;
  revenue: number;
  baseAmount: number;
  commission: number;
  total: number;
  reimbursement: number;
  /** Tạm ứng đã chi trong kỳ (trừ lương) */
  advanceTaken: number;
  loans: { id: number; code: string; amount: number; date: string; reason: string | null }[];
  netPay: number;
  months: PayMonth[];
  /** Chuyến đã qua giờ đón nhưng chưa hoàn thành: chưa tính % doanh số */
  pendingTrips: { id: number; pickupTime: string; status: TripStatus; booking: { id: number; code: string } }[];
  advances: DriverAdvance[];
}

interface DriverPayReport {
  from: string;
  to: string;
  drivers: DriverPay[];
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

/** Lái xe của chuyến: lái xe công ty, hoặc tài xế nhà xe nhập */
const driverOf = (t: ReportTrip) => (t.partnerId ? t.partnerDriverName : t.driver?.fullName) ?? '';
/** Biển số xe của chuyến: xe công ty, hoặc biển số nhà xe nhập */
const plateOf = (t: ReportTrip) => (t.partnerId ? t.partnerPlate : t.vehicle?.plateNumber) ?? '';
const kmOf = (t: ReportTrip) => (t.startKm !== null && t.endKm !== null && t.endKm >= t.startKm ? t.endKm - t.startKm : null);

/** Sheet chi tiết chuyến để đối chiếu với lái xe / xe / nhà xe: tiêu đề, kỳ, điều kiện lọc, dòng tổng, tóm tắt */
function tripSheet(trips: ReportTrip[], title: string, info: string[]): ExcelSheet {
  const sorted = [...trips].sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
  const sum = sorted.reduce((s, t) => ({ revenue: s.revenue + t.revenue, cost: s.cost + t.cost, profit: s.profit + t.profit }), { revenue: 0, cost: 0, profit: 0 });
  return {
    name: 'Đối chiếu chuyến',
    title,
    info: [...info, `Ngày lập: ${dayjs().format('DD/MM/YYYY HH:mm')}`],
    headers: [
      'Giờ đón',
      'Giờ kết thúc',
      'Booking',
      'Mã của khách',
      'Khách hàng',
      'Dịch vụ',
      'Hành trình',
      'Loại xe',
      'Số khách',
      'Biển số',
      'Lái xe',
      'Nhà xe',
      'Số km',
      'Giờ chạy',
      'Trạng thái',
      'Doanh thu',
      'Giá thuê nhà xe',
      'Chi phí',
      'Chi phí LX tự nhập',
      'Lợi nhuận',
    ],
    sumColumns: [8, 12, 13, 15, 16, 17, 18, 19],
    totalLabel: `Tổng ${sorted.length} chuyến`,
    rows: sorted.map((t) => [
      dayjs(t.pickupTime).format('DD/MM/YYYY HH:mm'),
      dayjs(t.endTime).format('DD/MM/YYYY HH:mm'),
      t.booking.code,
      t.booking.customerRef,
      customerName(t),
      t.service.name,
      routeText(t),
      t.vehicleType.name,
      t.passengers,
      plateOf(t),
      driverOf(t),
      t.partner?.name ?? (t.vehicle ? 'Xe công ty' : 'Chưa điều xe'),
      kmOf(t),
      Math.round(tripHours(t) * 10) / 10,
      TRIP_STATUS[t.status].label,
      Math.round(t.revenue),
      t.partnerCost === null ? null : Math.round(t.partnerCost),
      Math.round(t.cost),
      Math.round(t.driverCosts),
      Math.round(t.profit),
    ]),
    summary: [
      ['Doanh thu', Math.round(sum.revenue)],
      ['Chi phí', Math.round(sum.cost)],
      ['Lợi nhuận', Math.round(sum.profit)],
    ],
  };
}

// ───── Bộ lọc báo cáo (áp dụng cho mọi tab, thẻ tổng và file Excel) ─────

type TripKind = 'all' | 'company' | 'partner' | 'none';
interface ReportFilter {
  driver?: string;
  plate?: string;
  partner?: number;
  customer?: string;
  sales?: string;
  service?: string;
  vehicleType?: number;
  kind: TripKind;
  q: string;
}
const EMPTY_FILTER: ReportFilter = { kind: 'all', q: '' };
const salesName = (t: ReportTrip) => t.booking.salesUser?.fullName ?? 'Chưa gán NV';

function matchTrip(t: ReportTrip, f: ReportFilter) {
  if (f.driver && driverOf(t) !== f.driver) return false;
  if (f.plate && plateOf(t) !== f.plate) return false;
  if (f.partner && t.partner?.id !== f.partner) return false;
  if (f.customer && customerName(t) !== f.customer) return false;
  if (f.sales && salesName(t) !== f.sales) return false;
  if (f.service && t.service.code !== f.service) return false;
  if (f.vehicleType && t.vehicleType.id !== f.vehicleType) return false;
  if (f.kind === 'company' && !t.vehicle) return false;
  if (f.kind === 'partner' && !t.partnerId) return false;
  if (f.kind === 'none' && (t.vehicle || t.partnerId)) return false;
  const q = f.q.trim().toLowerCase();
  if (!q) return true;
  return [t.booking.code, t.booking.customerRef, customerName(t), salesName(t), routeText(t), assignment(t), driverOf(t)].join(' ').toLowerCase().includes(q);
}

/** Các lựa chọn lọc lấy từ chuyến trong kỳ */
function filterOptions(trips: ReportTrip[]) {
  const sorted = <T extends string | number>(m: Map<T, string>) => [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  const drivers = new Map<string, string>();
  const plates = new Map<string, string>();
  const partners = new Map<number, string>();
  const customers = new Map<string, string>();
  const sales = new Map<string, string>();
  const services = new Map<string, string>();
  const types = new Map<number, string>();
  for (const t of trips) {
    const d = driverOf(t);
    if (d) drivers.set(d, t.partnerId ? `${d} (${t.partner?.name ?? 'nhà xe'})` : d);
    const p = plateOf(t);
    if (p) plates.set(p, t.partnerId ? `${p} (${t.partner?.name ?? 'nhà xe'})` : p);
    if (t.partner) partners.set(t.partner.id, t.partner.name);
    customers.set(customerName(t), customerName(t));
    sales.set(salesName(t), salesName(t));
    services.set(t.service.code, t.service.name);
    types.set(t.vehicleType.id, t.vehicleType.name);
  }
  return { drivers: sorted(drivers), plates: sorted(plates), partners: sorted(partners), customers: sorted(customers), sales: sorted(sales), services: sorted(services), types: sorted(types) };
}
type FilterOptions = ReturnType<typeof filterOptions>;

const KIND_LABEL: Record<Exclude<TripKind, 'all'>, string> = { company: 'Chỉ xe công ty', partner: 'Chỉ nhà xe', none: 'Chỉ chuyến chưa điều' };

/** Mô tả bộ lọc đang dùng (ghi vào file Excel) */
function filterLabels(f: ReportFilter, o: FilterOptions) {
  const name = <T,>(list: { value: T; label: string }[], v: T) => list.find((x) => x.value === v)?.label;
  return [
    f.driver && `Lái xe: ${f.driver}`,
    f.plate && `Xe: ${f.plate}`,
    f.partner && `Nhà xe: ${name(o.partners, f.partner)}`,
    f.customer && `Khách hàng: ${f.customer}`,
    f.sales && `NV kinh doanh: ${f.sales}`,
    f.service && `Dịch vụ: ${name(o.services, f.service)}`,
    f.vehicleType && `Loại xe: ${name(o.types, f.vehicleType)}`,
    f.kind !== 'all' && KIND_LABEL[f.kind],
    f.q.trim() && `Tìm: "${f.q.trim()}"`,
  ].filter(Boolean) as string[];
}

function ReportFilterBar({ value, onChange, options }: { value: ReportFilter; onChange: (f: ReportFilter) => void; options: FilterOptions }) {
  const set = (patch: Partial<ReportFilter>) => onChange({ ...value, ...patch });
  const pick = (placeholder: string, width: number) => ({ allowClear: true, showSearch: true, optionFilterProp: 'label', placeholder, style: { width, maxWidth: '100%' } });
  const active = filterLabels(value, options).length > 0;
  return (
    <Flex gap={8} wrap align="center">
      <Select {...pick('Lái xe', 200)} options={options.drivers} value={value.driver} onChange={(driver) => set({ driver })} />
      <Select {...pick('Xe (biển số)', 180)} options={options.plates} value={value.plate} onChange={(plate) => set({ plate })} />
      <Select {...pick('Nhà xe đối tác', 200)} options={options.partners} value={value.partner} onChange={(partner) => set({ partner })} />
      <Select {...pick('Khách hàng', 200)} options={options.customers} value={value.customer} onChange={(customer) => set({ customer })} />
      <Select {...pick('NV kinh doanh', 170)} options={options.sales} value={value.sales} onChange={(sales) => set({ sales })} />
      <Select {...pick('Dịch vụ', 170)} options={options.services} value={value.service} onChange={(service) => set({ service })} />
      <Select {...pick('Loại xe', 150)} options={options.types} value={value.vehicleType} onChange={(vehicleType) => set({ vehicleType })} />
      <Input allowClear prefix={<SearchOutlined />} placeholder="Booking, tuyến, mã khách…" style={{ width: 220, maxWidth: '100%' }} value={value.q} onChange={(e) => set({ q: e.target.value })} />
      <Segmented<TripKind>
        value={value.kind}
        onChange={(kind) => set({ kind })}
        options={[
          { value: 'all', label: 'Tất cả' },
          { value: 'company', label: 'Xe công ty' },
          { value: 'partner', label: 'Nhà xe' },
          { value: 'none', label: 'Chưa điều' },
        ]}
      />
      {active && (
        <Button icon={<ClearOutlined />} onClick={() => onChange(EMPTY_FILTER)}>
          Xóa lọc
        </Button>
      )}
    </Flex>
  );
}

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
  const { hasRole } = useAuth();
  const canSalary = hasRole('ADMIN', 'KE_TOAN');
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
  const allTrips = useMemo(() => data?.trips ?? [], [data]);
  const [filter, setFilter] = useState<ReportFilter>(EMPTY_FILTER);
  const options = useMemo(() => filterOptions(allTrips), [allTrips]);
  const labels = filterLabels(filter, options);
  const isFiltered = labels.length > 0;
  // Mọi tab, thẻ tổng và file Excel đều dùng các chuyến đã lọc
  const trips = useMemo(() => allTrips.filter((t) => matchTrip(t, filter)), [allTrips, filter]);
  const { data: pay, isLoading: payLoading } = useQuery({
    queryKey: ['/reports/driver-pay', from, to],
    queryFn: () => api<DriverPayReport>('/reports/driver-pay', { query: { from, to } }),
    enabled: canSalary,
  });
  const periodDays = range[1].startOf('day').diff(range[0].startOf('day'), 'day') + 1;

  const groups = useMemo(() => {
    const vehicles = groupTrips(
      trips,
      (t) => (t.vehicle ? { key: `v${t.vehicle.id}`, name: t.vehicle.plateNumber } : null),
      from,
      to,
      isFiltered ? [] : (data?.vehicles ?? []).map((v) => ({ key: `v${v.id}`, name: v.plateNumber, sub: v.vehicleType.name })),
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
        isFiltered ? [] : (data?.drivers ?? []).filter((d) => d.status !== 'NGHI_VIEC').map((d) => ({ key: `d${d.id}`, name: d.fullName, sub: d.phone })),
      ),
      partners: groupTrips(trips, (t) => (t.partner ? { key: `p${t.partner.id}`, name: t.partner.name } : null), from, to),
      customers: groupTrips(trips, (t) => ({ key: t.booking.customer ? `c${t.booking.customer.id}` : `le-${t.booking.contactName}`, name: customerName(t) }), from, to),
      sales: groupTrips(trips, (t) => ({ key: `s${t.booking.salesUser?.id ?? 0}`, name: t.booking.salesUser?.fullName ?? 'Chưa gán NV' }), from, to),
      services: groupTrips(trips, (t) => ({ key: t.service.code, name: t.service.name }), from, to),
      vehicleTypes: groupTrips(trips, (t) => ({ key: `t${t.vehicleType.id}`, name: t.vehicleType.name }), from, to),
    };
  }, [trips, data, from, to, isFiltered]);

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

  const periodText = `${range[0].format('DD/MM/YYYY')} – ${range[1].format('DD/MM/YYYY')}`;
  // Tiêu đề các sheet Excel ghi kèm điều kiện lọc
  const rangeText = isFiltered ? `${periodText} · Lọc: ${labels.join(' · ')}` : periodText;

  /** Xuất Excel đối chiếu các chuyến đang lọc (tên file theo lái xe / xe / nhà xe / khách đang chọn) */
  async function exportFiltered() {
    const who = filter.driver ?? filter.plate ?? options.partners.find((p) => p.value === filter.partner)?.label ?? filter.customer ?? filter.sales;
    try {
      await downloadExcel(`doi-chieu${who ? `-${fileSlug(who)}` : '-chuyen'}_${from}_${to}.xlsx`, [
        tripSheet(trips, `ĐỐI CHIẾU CHUYẾN${who ? ` – ${who.toUpperCase()}` : ''}`, [`Kỳ: ${periodText}`, isFiltered ? `Lọc: ${labels.join(' · ')}` : 'Tất cả chuyến trong kỳ']),
      ]);
    } catch (e) {
      message.error(`Không xuất được Excel: ${(e as Error).message}`);
    }
  }

  /** Xuất Excel đối chiếu chuyến của một xe / lái xe / nhà xe (dòng trong các tab gom nhóm) */
  async function exportOne(kind: 'vehicle' | 'driver' | 'partner', g: Group) {
    const id = Number(g.key.slice(1));
    const list = trips.filter((t) => (kind === 'vehicle' ? t.vehicle?.id === id : kind === 'driver' ? t.driver?.id === id && !t.partnerId : t.partner?.id === id));
    if (!list.length) {
      message.info(`${g.name} không có chuyến trong kỳ`);
      return;
    }
    const label = { vehicle: 'XE', driver: 'LÁI XE', partner: 'NHÀ XE' }[kind];
    try {
      await downloadExcel(`doi-chieu-${fileSlug(g.name)}_${from}_${to}.xlsx`, [
        tripSheet(list, `ĐỐI CHIẾU CHUYẾN – ${label} ${g.name.toUpperCase()}`, [[g.sub, `Kỳ: ${periodText}`].filter(Boolean).join(' · '), ...(isFiltered ? [`Lọc: ${labels.join(' · ')}`] : [])]),
      ]);
    } catch (e) {
      message.error(`Không xuất được Excel: ${(e as Error).message}`);
    }
  }

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
          ...(pay ? payrollSheets(filter.driver ? { ...pay, drivers: pay.drivers.filter((d) => d.fullName === filter.driver) } : pay, allTrips, rangeText) : []),
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
      await downloadExcel(`bao-cao-${from}-${to}${isFiltered ? '-loc' : ''}.xlsx`, sheets);
    } catch (e) {
      message.error(`Không xuất được Excel: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  const tabs = [
    { key: 'trips', label: `Chi tiết chuyến (${trips.length})`, children: <TripDetail trips={trips} loading={isLoading} onExport={exportFiltered} filtered={isFiltered} /> },
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
                onExport={(g) => exportOne('vehicle', g)}
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
              <>
              {canSalary && (
                <DriverPayTable
                  pay={pay && filter.driver ? { ...pay, drivers: pay.drivers.filter((d) => d.fullName === filter.driver) } : pay}
                  loading={payLoading}
                  trips={allTrips}
                  rangeText={periodText}
                  from={from}
                  to={to}
                />
              )}
              {canSalary && (
                <Typography.Title level={5} style={{ marginTop: 24 }}>
                  Hiệu suất lái xe
                </Typography.Title>
              )}
              <GroupTable
                loading={isLoading}
                rows={groups.drivers}
                label="Lái xe công ty"
                onExport={(g) => exportOne('driver', g)}
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
              </>
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
          onExport={(g) => exportOne('partner', g)}
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

      <Card size="small" title={isFiltered ? `Lọc: ${trips.length}/${allTrips.length} chuyến` : 'Lọc báo cáo (áp dụng cho mọi tab)'}>
        <ReportFilterBar value={filter} onChange={setFilter} options={options} />
      </Card>

      <Card>
        <Tabs activeKey={tab} onChange={setTab} items={tabs} />
      </Card>
    </Flex>
  );
}

// ───── Bảng chi tiết chuyến ─────

function TripDetail({ trips: rows, loading, onExport, filtered }: { trips: ReportTrip[]; loading: boolean; onExport: () => void; filtered: boolean }) {
  const sum = rows.reduce((s, t) => ({ revenue: s.revenue + t.revenue, cost: s.cost + t.cost, profit: s.profit + t.profit }), { revenue: 0, cost: 0, profit: 0 });

  return (
    <>
      <Flex justify="flex-end" style={{ marginBottom: 12 }}>
        <Button icon={<FileExcelOutlined style={{ color: '#15803d' }} />} disabled={!rows.length} onClick={onExport}>
          Xuất Excel đối chiếu {filtered ? 'theo bộ lọc' : 'chi tiết chuyến'} ({rows.length} chuyến)
        </Button>
      </Flex>
      <ResponsiveTable<ReportTrip>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={paged('chuyến')}
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
  onExport,
}: {
  /** Xuất Excel đối chiếu chuyến của dòng này (xe / lái xe / nhà xe) */
  onExport?: (g: Group) => void;
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
    ...(onExport
      ? [
          {
            key: 'excel',
            width: 60,
            render: (_: unknown, g: Group) =>
              g.trips > 0 && (
                <Tooltip title={`Xuất Excel đối chiếu chuyến của ${g.name}`}>
                  <Button size="small" icon={<FileExcelOutlined style={{ color: '#15803d' }} />} onClick={() => onExport(g)}>
                    Excel
                  </Button>
                </Tooltip>
              ),
          },
        ]
      : []),
  ];
  return (
    <>
      {note && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          {note}
        </Typography.Paragraph>
      )}
      <ResponsiveTable<Group>
        rowKey="key"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={cols}
        pagination={paged()}
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

// ───── Bảng lương lái xe ─────

/** Các chuyến tính lương của một lái xe: xe công ty, đã hoàn thành; kèm % và tiền doanh số của tháng đó */
function payTrips(d: DriverPay, trips: ReportTrip[]) {
  return trips
    .filter((t) => t.driver?.id === d.driverId && !t.partnerId && t.status === 'HOAN_THANH')
    .map((t) => {
      const pct = d.months.find((m) => m.month === dayjs(t.pickupTime).format('YYYY-MM'))?.commissionPercent ?? 0;
      return { trip: t, pct, commission: (t.revenue * pct) / 100 };
    });
}

type PayState = 'all' | 'hasTrips' | 'missingRate' | 'pending' | 'advance' | 'reimburse';
const PAY_STATE: Record<PayState, string> = {
  all: 'Tất cả',
  hasTrips: 'Có chuyến',
  missingRate: 'Chưa cài lương',
  pending: 'Còn chuyến chưa HT',
  advance: 'Có trừ tạm ứng',
  reimburse: 'Có hoàn ứng',
};

function DriverPayTable({ pay, loading, trips, rangeText, from, to }: { pay?: DriverPayReport; loading: boolean; trips: ReportTrip[]; rangeText: string; from: string; to: string }) {
  const { message } = App.useApp();
  const [editing, setEditing] = useState<{ id: number; fullName: string } | null>(null);
  // Bộ lọc riêng của bảng lương
  const [ids, setIds] = useState<number[]>([]);
  const [status, setStatus] = useState<DriverStatus>();
  const [state, setState] = useState<PayState>('all');
  const [q, setQ] = useState('');
  const all = pay?.drivers ?? [];
  const rows = all.filter(
    (r) =>
      (!ids.length || ids.includes(r.driverId)) &&
      (!status || r.status === status) &&
      (!q.trim() || `${r.fullName} ${r.phone}`.toLowerCase().includes(q.trim().toLowerCase())) &&
      (state === 'all' ||
        (state === 'hasTrips' && r.trips > 0) ||
        (state === 'missingRate' && r.missingRate) ||
        (state === 'pending' && r.pendingTrips.length > 0) ||
        (state === 'advance' && r.advanceTaken > 0) ||
        (state === 'reimburse' && r.reimbursement > 0)),
  );
  const labels = [
    ids.length && `Lái xe: ${all.filter((r) => ids.includes(r.driverId)).map((r) => r.fullName).join(', ')}`,
    status && `Trạng thái: ${DRIVER_STATUS[status].label}`,
    state !== 'all' && PAY_STATE[state],
    q.trim() && `Tìm: "${q.trim()}"`,
  ].filter(Boolean) as string[];
  const filtered = labels.length > 0;

  async function exportPay(list: DriverPay[], file: string) {
    if (!pay || !list.length) return;
    try {
      await downloadExcel(file, payrollSheets({ ...pay, drivers: list }, trips, filtered && list.length > 1 ? `${rangeText} · Lọc: ${labels.join(' · ')}` : rangeText));
    } catch (e) {
      message.error(`Không xuất được Excel: ${(e as Error).message}`);
    }
  }
  const sum = rows.reduce(
    (s, r) => ({
      revenue: s.revenue + r.revenue,
      baseAmount: s.baseAmount + r.baseAmount,
      commission: s.commission + r.commission,
      total: s.total + r.total,
      trips: s.trips + r.trips,
      reimbursement: s.reimbursement + r.reimbursement,
      advanceTaken: s.advanceTaken + r.advanceTaken,
      netPay: s.netPay + r.netPay,
    }),
    { revenue: 0, baseAmount: 0, commission: 0, total: 0, trips: 0, reimbursement: 0, advanceTaken: 0, netPay: 0 },
  );
  const missing = rows.filter((r) => r.missingRate);
  const pendingCount = rows.reduce((n, r) => n + r.pendingTrips.length, 0);
  const multiMonth = (pay?.drivers[0]?.months.length ?? 0) > 1;

  return (
    <>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Bảng lương lái xe
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        Lương = lương cứng + % × doanh thu các chuyến đã <b>Hoàn thành</b> (đã trừ giảm giá, chưa VAT); kỳ không trọn tháng thì lương cứng tính theo số
        ngày. Thực nhận = lương + hoàn ứng (chi phí lái xe tự ứng, ghi trên app). Bấm vào dòng để xem từng chuyến và khoản ứng.
      </Typography.Paragraph>
      {missing.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          title={`Chưa cài lương cho: ${missing.map((m) => m.fullName).join(', ')}. Bấm nút ở cột "Mức lương" để cài.`}
        />
      )}
      {pendingCount > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          title={`${pendingCount} chuyến đã qua giờ đón nhưng chưa bấm "Hoàn thành" nên chưa được tính % doanh số. Bấm vào lái xe để xem và cập nhật trạng thái chuyến.`}
        />
      )}
      <Flex gap={8} wrap align="center" style={{ marginBottom: 12 }}>
        <Select
          mode="multiple"
          allowClear
          showSearch
          optionFilterProp="label"
          maxTagCount="responsive"
          placeholder="Tất cả lái xe"
          style={{ minWidth: 220, maxWidth: '100%', flex: '1 1 220px' }}
          options={all.map((r) => ({ value: r.driverId, label: r.fullName }))}
          value={ids}
          onChange={setIds}
        />
        <Select
          allowClear
          placeholder="Trạng thái lái xe"
          style={{ width: 170 }}
          options={(Object.keys(DRIVER_STATUS) as DriverStatus[]).map((k) => ({ value: k, label: DRIVER_STATUS[k].label }))}
          value={status}
          onChange={setStatus}
        />
        <Select<PayState> style={{ width: 190 }} value={state} onChange={setState} options={(Object.keys(PAY_STATE) as PayState[]).map((k) => ({ value: k, label: k === 'all' ? 'Tình trạng: tất cả' : PAY_STATE[k] }))} />
        <Input allowClear prefix={<SearchOutlined />} placeholder="Tên, SĐT lái xe" style={{ width: 180, maxWidth: '100%' }} value={q} onChange={(e) => setQ(e.target.value)} />
        {filtered && (
          <Button
            icon={<ClearOutlined />}
            onClick={() => {
              setIds([]);
              setStatus(undefined);
              setState('all');
              setQ('');
            }}
          >
            Xóa lọc
          </Button>
        )}
        <Button
          icon={<FileExcelOutlined style={{ color: '#15803d' }} />}
          disabled={!rows.length}
          onClick={() => exportPay(rows, `bang-luong-lai-xe_${from}_${to}${filtered ? (rows.length === 1 ? `_${fileSlug(rows[0].fullName)}` : '_loc') : ''}.xlsx`)}
        >
          Xuất Excel bảng lương {filtered ? 'theo bộ lọc' : ''} ({rows.length} lái xe)
        </Button>
      </Flex>
      <ResponsiveTable<DriverPay>
        rowKey="driverId"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={paged('lái xe')}
        locale={{ emptyText: filtered ? 'Không có lái xe khớp bộ lọc' : 'Chưa có lái xe công ty' }}
        expandable={{
          expandRowByClick: true,
          rowExpandable: (r) => r.trips > 0 || multiMonth || r.advances.length > 0 || r.pendingTrips.length > 0,
          expandedRowRender: (r) => <DriverPayDetail pay={r} trips={trips} multiMonth={multiMonth} />,
        }}
        columns={[
          {
            title: 'Lái xe',
            render: (_, r) => (
              <>
                <b>{r.fullName}</b> {r.status !== 'DANG_LAM' && <Tag color={DRIVER_STATUS[r.status].color}>{DRIVER_STATUS[r.status].label}</Tag>}
                <div>
                  <Typography.Text type="secondary">{r.phone}</Typography.Text>
                </div>
              </>
            ),
          },
          {
            title: 'Mức lương',
            render: (_, r) => (
              <Button
                size="small"
                type={r.missingRate ? 'dashed' : 'text'}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing({ id: r.driverId, fullName: r.fullName });
                }}
              >
                {r.missingRate && r.baseSalary === 0 && r.commissionPercent === 0 ? (
                  <Typography.Text type="warning">Cài lương</Typography.Text>
                ) : (
                  `${money(r.baseSalary)} + ${r.commissionPercent}%`
                )}
              </Button>
            ),
          },
          {
            title: 'Chuyến hoàn thành',
            dataIndex: 'trips',
            align: 'right',
            render: (v, r) => (
              <>
                {v}
                {r.pendingTrips.length > 0 && (
                  <Tooltip title="Đã qua giờ đón nhưng chưa bấm Hoàn thành – chưa tính % doanh số">
                    <div>
                      <Typography.Text type="warning" style={{ fontSize: 12 }}>
                        +{r.pendingTrips.length} chưa HT
                      </Typography.Text>
                    </div>
                  </Tooltip>
                )}
              </>
            ),
          },
          { title: 'Doanh thu tính lương (chưa thuế)', dataIndex: 'revenue', align: 'right', render: money, sorter: (a, b) => a.revenue - b.revenue },
          { title: 'Lương cứng', dataIndex: 'baseAmount', align: 'right', render: money },
          { title: 'Tiền % doanh số', dataIndex: 'commission', align: 'right', render: money, sorter: (a, b) => a.commission - b.commission },
          { title: 'Tổng lương', dataIndex: 'total', align: 'right', render: (v) => <b>{money(v)}</b>, sorter: (a, b) => a.total - b.total },
          { title: 'Hoàn ứng', dataIndex: 'reimbursement', align: 'right', render: money },
          {
            title: 'Trừ tạm ứng',
            dataIndex: 'advanceTaken',
            align: 'right',
            render: (v, r) =>
              v ? (
                <Tooltip
                  title={r.loans.map((l) => (
                    <div key={l.id}>
                      {dayjs(l.date).format('DD/MM')} · {l.code} · {formatVnd(l.amount)}
                      {l.reason ? ` – ${l.reason}` : ''}
                    </div>
                  ))}
                >
                  <Typography.Text type="danger">−{money(v)}</Typography.Text>
                </Tooltip>
              ) : (
                money(0)
              ),
          },
          {
            title: 'Thực nhận',
            dataIndex: 'netPay',
            align: 'right',
            render: (v) => (
              <Typography.Text strong style={{ color: '#2a78d6' }}>
                {money(v)}
              </Typography.Text>
            ),
            sorter: (a, b) => a.netPay - b.netPay,
          },
          {
            key: 'slip',
            width: 70,
            render: (_, r) => (
              <Tooltip title={`Xuất phiếu lương của ${r.fullName} (lương, chuyến tính lương, hoàn ứng)`}>
                <Button
                  size="small"
                  icon={<FileExcelOutlined style={{ color: '#15803d' }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    exportPay([r], `phieu-luong-${fileSlug(r.fullName)}_${from}_${to}.xlsx`);
                  }}
                >
                  Phiếu lương
                </Button>
              </Tooltip>
            ),
          },
        ]}
        summary={() =>
          rows.length > 1 && (
            <Table.Summary>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <b>Tổng cộng</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <b>{sum.trips}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <b>{money(sum.revenue)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">
                  <b>{money(sum.baseAmount)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">
                  <b>{money(sum.commission)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right">
                  <b>{money(sum.total)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">
                  <b>{money(sum.reimbursement)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={9} align="right">
                  <b>−{money(sum.advanceTaken)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={10} align="right">
                  <b>{money(sum.netPay)}</b>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )
        }
      />
      <DriverSalaryModal driver={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function DriverPayDetail({ pay, trips, multiMonth }: { pay: DriverPay; trips: ReportTrip[]; multiMonth: boolean }) {
  const rows = payTrips(pay, trips);
  return (
    <Flex vertical gap={12}>
      {multiMonth && (
        <ResponsiveTable<PayMonth>
          rowKey="month"
          size="small"
          pagination={false}
          dataSource={pay.months}
          columns={[
            { title: 'Tháng', render: (_, m) => `${dayjs(m.month).format('MM/YYYY')}${m.days < m.daysInMonth ? ` (${m.days}/${m.daysInMonth} ngày)` : ''}` },
            { title: 'Mức lương', render: (_, m) => (m.hasRate ? `${money(m.baseSalary)} + ${m.commissionPercent}%` : <Typography.Text type="warning">Chưa cài</Typography.Text>) },
            { title: 'Chuyến', dataIndex: 'trips', align: 'right' },
            { title: 'Doanh thu', dataIndex: 'revenue', align: 'right', render: money },
            { title: 'Lương cứng', dataIndex: 'baseAmount', align: 'right', render: money },
            { title: 'Tiền % DS', dataIndex: 'commission', align: 'right', render: money },
            { title: 'Lương', dataIndex: 'total', align: 'right', render: (v) => <b>{money(v)}</b> },
            { title: 'Hoàn ứng', dataIndex: 'reimbursement', align: 'right', render: money },
            { title: 'Tạm ứng', dataIndex: 'advanceTaken', align: 'right', render: (v) => (v ? `−${money(v)}` : money(0)) },
            { title: 'Thực nhận', dataIndex: 'netPay', align: 'right', render: (v) => <b>{money(v)}</b> },
          ]}
        />
      )}
      {rows.length > 0 && (
        <ResponsiveTable
          rowKey={(r) => r.trip.id}
          size="small"
          pagination={false}
          dataSource={rows}
          columns={[
            { title: 'Giờ đón', render: (_, r) => dayjs(r.trip.pickupTime).format('DD/MM/YYYY HH:mm') },
            { title: 'Booking', render: (_, r) => <Link to={`/bookings/${r.trip.booking.id}`}>{r.trip.booking.code}</Link> },
            { title: 'Khách', render: (_, r) => customerName(r.trip) },
            { title: 'Hành trình', render: (_, r) => <div style={{ maxWidth: 300, whiteSpace: 'normal' }}>{routeText(r.trip)}</div> },
            { title: 'Xe', render: (_, r) => r.trip.vehicle?.plateNumber },
            { title: 'Doanh thu', align: 'right', render: (_, r) => money(r.trip.revenue) },
            { title: '%', align: 'right', render: (_, r) => `${r.pct}%` },
            { title: 'Tiền % DS', align: 'right', render: (_, r) => money(r.commission) },
          ]}
        />
      )}
      {pay.advances.length > 0 && (
        <>
          <Typography.Text strong>Khoản lái xe tự ứng (hoàn ứng)</Typography.Text>
          <ResponsiveTable<DriverAdvance>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={pay.advances}
            columns={[
              { title: 'Ngày chi', dataIndex: 'spentAt', render: (v) => dayjs(v).format('DD/MM/YYYY') },
              { title: 'Khoản mục', dataIndex: 'category' },
              {
                title: 'Chuyến',
                render: (_, c) => (
                  c.booking ? (
                    <>
                      <Link to={`/bookings/${c.booking.id}`}>{c.booking.code}</Link> · {dayjs(c.pickupTime).format('DD/MM HH:mm')}{' '}
                      {c.tripStatus === 'HUY' && <Tag>Chuyến hủy</Tag>}
                    </>
                  ) : (
                    <Typography.Text type="secondary">Không theo chuyến</Typography.Text>
                  )
                ),
              },
              { title: 'Ghi chú', dataIndex: 'note' },
              { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: money },
            ]}
          />
        </>
      )}
      {pay.pendingTrips.length > 0 && (
        <Alert
          type="warning"
          showIcon
          title="Chuyến chưa bấm Hoàn thành (chưa tính % doanh số)"
          description={
            <Flex gap={8} wrap>
              {pay.pendingTrips.map((t) => (
                <Link key={t.id} to={`/bookings/${t.booking.id}`}>
                  {t.booking.code} · {dayjs(t.pickupTime).format('DD/MM HH:mm')} ({TRIP_STATUS[t.status].label})
                </Link>
              ))}
            </Flex>
          }
        />
      )}
    </Flex>
  );
}

/** Sheet Excel: bảng lương tổng hợp + chi tiết chuyến tính lương */
function payrollSheets(pay: DriverPayReport, trips: ReportTrip[], rangeText: string): ExcelSheet[] {
  return [
    {
      name: 'Bảng lương lái xe',
      title: `BẢNG LƯƠNG LÁI XE · ${rangeText}`,
      headers: ['Lái xe', 'SĐT', 'Lương cứng / tháng', '% doanh số', 'Chuyến hoàn thành', 'Doanh thu tính lương', 'Lương cứng kỳ này', 'Tiền % doanh số', 'Tổng lương', 'Hoàn ứng', 'Trừ tạm ứng', 'Thực nhận', 'Ghi chú'],
      sumColumns: [4, 5, 6, 7, 8, 9, 10, 11],
      numberColumns: [2],
      totalLabel: 'Tổng cộng',
      rows: pay.drivers.map((d) => [
        d.fullName,
        d.phone,
        d.baseSalary,
        d.commissionPercent,
        d.trips,
        d.revenue,
        d.baseAmount,
        d.commission,
        d.total,
        d.reimbursement,
        d.advanceTaken,
        d.netPay,
        [
          d.missingRate ? 'Chưa cài lương đủ các tháng' : '',
          d.pendingTrips.length ? `${d.pendingTrips.length} chuyến chưa bấm Hoàn thành` : '',
          d.months.length > 1 ? d.months.map((m) => `${dayjs(m.month).format('MM/YYYY')}: ${formatVnd(m.netPay)}`).join('; ') : '',
        ]
          .filter(Boolean)
          .join(' · '),
      ]),
    },
    {
      name: 'Chuyến tính lương LX',
      title: `CHI TIẾT CHUYẾN TÍNH LƯƠNG LÁI XE · ${rangeText}`,
      headers: ['Lái xe', 'Giờ đón', 'Booking', 'Khách hàng', 'Hành trình', 'Xe', 'Doanh thu', '% doanh số', 'Tiền % doanh số'],
      sumColumns: [6, 8],
      totalLabel: 'Tổng cộng',
      rows: pay.drivers.flatMap((d) =>
        payTrips(d, trips).map((r) => [
          d.fullName,
          dayjs(r.trip.pickupTime).format('DD/MM/YYYY HH:mm'),
          r.trip.booking.code,
          customerName(r.trip),
          routeText(r.trip),
          r.trip.vehicle?.plateNumber,
          r.trip.revenue,
          r.pct,
          Math.round(r.commission),
        ]),
      ),
    },
    {
      name: 'Hoàn ứng LX',
      title: `CHI PHÍ LÁI XE TỰ ỨNG (HOÀN ỨNG) · ${rangeText}`,
      headers: ['Lái xe', 'Ngày chi', 'Khoản mục', 'Booking', 'Giờ đón chuyến', 'Ghi chú', 'Số tiền'],
      sumColumns: [6],
      totalLabel: 'Tổng cộng',
      rows: pay.drivers.flatMap((d) =>
        d.advances.map((c) => [d.fullName, dayjs(c.spentAt).format('DD/MM/YYYY'), c.category, c.booking?.code ?? '', c.booking ? dayjs(c.pickupTime).format('DD/MM/YYYY HH:mm') : '', c.note, c.amount]),
      ),
    },
  ];
}
