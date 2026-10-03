import { ArrowDownOutlined, ArrowUpOutlined, MinusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, DatePicker, Empty, Flex, Row, Segmented, Statistic, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api';
import { useAuth } from '../auth';
import { ExpiryCell, formatVnd } from '../components/common';
import { SERVICE_TYPE } from '../labels';
import type { ExpiryAlert, ServiceType } from '../types';

// Bảng màu đã kiểm tra bằng công cụ dataviz (đủ tương phản, an toàn với người mù màu)
const COLOR = {
  revenue: '#2a78d6', // slot 1: doanh thu
  profit: '#eb6834', // slot 2: lợi nhuận
  grid: '#ebebea',
  axis: '#8a8984',
  text2: '#52514e',
};

interface Agg {
  revenue: number;
  cost: number;
  profit: number;
  trips: number;
}

interface Summary {
  from: string;
  to: string;
  groupBy: 'day' | 'month';
  ownOnly: boolean;
  kpis: Agg & { bookings: number; tripsWithoutCost: number };
  previous: Agg & { from: string; to: string };
  series: (Agg & { period: string })[];
  byService: (Agg & { serviceType: ServiceType })[];
  byVehicleType: (Agg & { name: string })[];
  bySales: (Agg & { name: string; bookings: number })[];
  topCustomers: (Agg & { name: string; bookings: number })[];
  pipeline: { quotes: number; quoteValue: number; drafts: number; waitingDispatch: number; upcoming7Days: number };
}

type Preset = 'thisMonth' | 'lastMonth' | '3months' | 'thisYear' | 'custom';

const PRESETS: { value: Preset; label: string; range: () => [Dayjs, Dayjs] }[] = [
  { value: 'thisMonth', label: 'Tháng này', range: () => [dayjs().startOf('month'), dayjs().endOf('month')] },
  { value: 'lastMonth', label: 'Tháng trước', range: () => [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
  { value: '3months', label: '3 tháng', range: () => [dayjs().subtract(2, 'month').startOf('month'), dayjs().endOf('month')] },
  { value: 'thisYear', label: 'Năm nay', range: () => [dayjs().startOf('year'), dayjs().endOf('year')] },
];

/** Số gọn cho trục: 1,2 tỷ · 350 tr · 80 N */
function compactVnd(v: number) {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  if (a >= 1e3) return `${(v / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} N`;
  return String(v);
}

const periodLabel = (p: string, groupBy: 'day' | 'month') => (groupBy === 'day' ? dayjs(p).format('DD/MM') : `T${dayjs(`${p}-01`).format('M/YY')}`);

function Delta({ cur, prev }: { cur: number; prev: number }) {
  if (!prev) return <Typography.Text type="secondary">Kỳ trước: chưa có số liệu</Typography.Text>;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  const icon = pct > 0 ? <ArrowUpOutlined /> : pct < 0 ? <ArrowDownOutlined /> : <MinusOutlined />;
  return (
    <Typography.Text type={pct > 0 ? 'success' : pct < 0 ? 'danger' : 'secondary'}>
      {icon} {Math.abs(pct)}% so với kỳ trước
    </Typography.Text>
  );
}

function KpiTile({ title, value, suffix, footer }: { title: string; value: number | string; suffix?: string; footer?: ReactNode }) {
  return (
    <Card style={{ height: '100%' }}>
      <Statistic title={title} value={value} suffix={suffix} formatter={(v) => (typeof v === 'number' ? formatVnd(v) : v)} />
      <div style={{ marginTop: 4, fontSize: 13 }}>{footer}</div>
    </Card>
  );
}

/** Tooltip chung cho biểu đồ: chữ dùng màu chữ, ô màu nhỏ bên cạnh mang nhận diện chuỗi */
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e5e3', borderRadius: 6, padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <Flex key={p.name} gap={8} align="center" justify="space-between" style={{ minWidth: 180 }}>
          <span>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: p.color, marginRight: 6 }} />
            {p.name}
          </span>
          <b>{formatVnd(p.value)} đ</b>
        </Flex>
      ))}
    </div>
  );
}

/** Biểu đồ thanh ngang một màu cho so sánh độ lớn */
function HBar({ data, height }: { data: { name: string; revenue: number }[]; height?: number }) {
  if (!data.length) return <Empty description="Chưa có số liệu" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, data.length * 40 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={COLOR.grid} />
        <XAxis type="number" tickFormatter={compactVnd} stroke={COLOR.axis} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="name" width={130} stroke={COLOR.axis} tick={{ fontSize: 12, fill: COLOR.text2 }} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
        <Bar
          dataKey="revenue"
          name="Doanh thu"
          fill={COLOR.revenue}
          barSize={18}
          radius={[0, 4, 4, 0]}
          label={{ position: 'right', formatter: (v: unknown) => compactVnd(Number(v)), fontSize: 12, fill: COLOR.text2 }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function DashboardPage() {
  const { hasRole } = useAuth();
  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [range, setRange] = useState<[Dayjs, Dayjs]>(PRESETS[0].range());

  const from = range[0].format('YYYY-MM-DD');
  const to = range[1].format('YYYY-MM-DD');
  const { data: r, isLoading } = useQuery({
    queryKey: ['/reports/summary', from, to],
    queryFn: () => api<Summary>('/reports/summary', { query: { from, to } }),
  });
  const alerts = useQuery({ queryKey: ['/alerts/expiring'], queryFn: () => api<ExpiryAlert[]>('/alerts/expiring') });

  const k = r?.kpis;
  const margin = k && k.revenue > 0 ? Math.round((k.profit / k.revenue) * 100) : 0;
  const prevMargin = r && r.previous.revenue > 0 ? Math.round((r.previous.profit / r.previous.revenue) * 100) : null;
  const chartData = r?.series.map((s) => ({ ...s, label: periodLabel(s.period, r.groupBy) })) ?? [];
  const hasData = !!k && k.trips > 0;

  return (
    <Flex vertical gap={16}>
      {/* Bộ lọc thời gian: một hàng phía trên các biểu đồ */}
      <Flex justify="space-between" align="center" wrap gap={12}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Doanh thu & lợi nhuận
          </Typography.Title>
          <Typography.Text type="secondary">
            Theo ngày đón khách · booking đã xác nhận / hoàn thành · chưa gồm VAT
            {r?.ownOnly && ' · chỉ booking bạn phụ trách'}
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
        </Flex>
      </Flex>

      {/* Hàng chỉ số chính */}
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <KpiTile title="Doanh thu" value={k?.revenue ?? 0} suffix="đ" footer={r && <Delta cur={r.kpis.revenue} prev={r.previous.revenue} />} />
        </Col>
        <Col xs={12} lg={6}>
          <KpiTile title="Chi phí dự kiến" value={k?.cost ?? 0} suffix="đ" footer={r && <Delta cur={r.kpis.cost} prev={r.previous.cost} />} />
        </Col>
        <Col xs={12} lg={6}>
          <KpiTile title="Lợi nhuận" value={k?.profit ?? 0} suffix="đ" footer={r && <Delta cur={r.kpis.profit} prev={r.previous.profit} />} />
        </Col>
        <Col xs={12} lg={6}>
          <KpiTile
            title="Biên lợi nhuận"
            value={`${margin}%`}
            footer={
              <Typography.Text type="secondary">
                {k?.bookings ?? 0} booking · {k?.trips ?? 0} chuyến{prevMargin !== null && ` · kỳ trước ${prevMargin}%`}
              </Typography.Text>
            }
          />
        </Col>
      </Row>

      {!!k?.tripsWithoutCost && (
        <Alert
          type="warning"
          showIcon
          title={`${k.tripsWithoutCost} chuyến chưa nhập chi phí dự kiến: lợi nhuận đang hiển thị cao hơn thực tế. Mở booking và nhập "Chi phí dự kiến" cho từng chuyến.`}
        />
      )}

      {/* Xu hướng theo thời gian */}
      <Card title={`Doanh thu và lợi nhuận theo ${r?.groupBy === 'month' ? 'tháng' : 'ngày'}`} loading={isLoading}>
        {hasData ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ left: 8, right: 16, top: 8, bottom: 0 }} barGap={2} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke={COLOR.grid} />
              <XAxis dataKey="label" stroke={COLOR.axis} tick={{ fontSize: 12 }} minTickGap={16} />
              <YAxis tickFormatter={compactVnd} stroke={COLOR.axis} tick={{ fontSize: 12 }} width={64} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 13, color: COLOR.text2 }} />
              <Bar dataKey="revenue" name="Doanh thu" fill={COLOR.revenue} maxBarSize={24} radius={[4, 4, 0, 0]} />
              <Bar dataKey="profit" name="Lợi nhuận" fill={COLOR.profit} maxBarSize={24} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty description="Chưa có booking đã xác nhận trong khoảng thời gian này" />
        )}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Doanh thu theo dịch vụ" loading={isLoading} style={{ height: '100%' }}>
            <HBar data={(r?.byService ?? []).map((s) => ({ ...s, name: SERVICE_TYPE[s.serviceType].label }))} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Doanh thu theo loại xe" loading={isLoading} style={{ height: '100%' }}>
            <HBar data={r?.byVehicleType ?? []} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Theo nhân viên kinh doanh" loading={isLoading} style={{ height: '100%' }}>
            <Table
              size="small"
              rowKey="name"
              pagination={false}
              dataSource={r?.bySales ?? []}
              locale={{ emptyText: 'Chưa có số liệu' }}
              columns={[
                { title: 'Nhân viên', dataIndex: 'name' },
                { title: 'Booking', dataIndex: 'bookings', align: 'right' },
                { title: 'Doanh thu', dataIndex: 'revenue', align: 'right', render: (v) => formatVnd(v) },
                { title: 'Lợi nhuận', dataIndex: 'profit', align: 'right', render: (v) => <Typography.Text type={v < 0 ? 'danger' : undefined}>{formatVnd(v)}</Typography.Text> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Khách hàng doanh thu cao nhất" loading={isLoading} style={{ height: '100%' }}>
            <Table
              size="small"
              rowKey="name"
              pagination={false}
              dataSource={r?.topCustomers ?? []}
              locale={{ emptyText: 'Chưa có số liệu' }}
              columns={[
                { title: 'Khách hàng', dataIndex: 'name' },
                { title: 'Booking', dataIndex: 'bookings', align: 'right' },
                { title: 'Doanh thu', dataIndex: 'revenue', align: 'right', render: (v) => formatVnd(v) },
                { title: 'Lợi nhuận', dataIndex: 'profit', align: 'right', render: (v) => <Typography.Text type={v < 0 ? 'danger' : undefined}>{formatVnd(v)}</Typography.Text> },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {/* Việc cần xử lý */}
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <Link to="/bookings">
            <Card hoverable style={{ height: '100%' }}>
              <Statistic title="Báo giá chờ khách xác nhận" value={r?.pipeline.quotes ?? 0} />
              <Typography.Text type="secondary">Trị giá {formatVnd(r?.pipeline.quoteValue ?? 0)} đ</Typography.Text>
            </Card>
          </Link>
        </Col>
        <Col xs={12} lg={6}>
          <Link to="/bookings">
            <Card hoverable style={{ height: '100%' }}>
              <Statistic title="Booking nháp" value={r?.pipeline.drafts ?? 0} />
              <Typography.Text type="secondary">Chưa gửi báo giá</Typography.Text>
            </Card>
          </Link>
        </Col>
        <Col xs={12} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic title="Chuyến chờ điều xe" value={r?.pipeline.waitingDispatch ?? 0} />
            <Typography.Text type="secondary">Đã xác nhận, chưa xếp xe</Typography.Text>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic title="Chuyến 7 ngày tới" value={r?.pipeline.upcoming7Days ?? 0} />
            <Typography.Text type="secondary">Đã xác nhận</Typography.Text>
          </Card>
        </Col>
      </Row>

      {hasRole('ADMIN', 'DIEU_HANH', 'KE_TOAN') && (
        <Card title="Giấy tờ hết hạn hoặc sắp hết hạn (30 ngày tới)">
          <Table<ExpiryAlert>
            rowKey={(x) => `${x.kind}-${x.id}-${x.document}`}
            size="small"
            loading={alerts.isLoading}
            dataSource={alerts.data}
            pagination={false}
            locale={{ emptyText: <Empty description="Không có giấy tờ nào sắp hết hạn" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            columns={[
              { title: 'Loại', dataIndex: 'kind', render: (v) => (v === 'XE' ? <Tag color="blue">Xe</Tag> : <Tag color="orange">Lái xe</Tag>) },
              { title: 'Xe / Lái xe', dataIndex: 'name', render: (v, x) => <Link to={x.kind === 'XE' ? '/vehicles' : '/drivers'}>{v}</Link> },
              { title: 'Giấy tờ', dataIndex: 'document' },
              { title: 'Ngày hết hạn', dataIndex: 'expiry', render: (v) => <ExpiryCell value={v} /> },
              { title: 'Còn lại', dataIndex: 'daysLeft', render: (d: number) => (d < 0 ? <Tag color="red">Quá hạn {-d} ngày</Tag> : `${d} ngày`) },
            ]}
          />
        </Card>
      )}
    </Flex>
  );
}
