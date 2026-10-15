import { KeyOutlined, LogoutOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Avatar, Button, Card, DatePicker, Dropdown, Empty, Flex, Form, Input, Layout, Modal, Segmented, Select, Spin, Statistic, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { DATE_FORMAT, EnumTag, formatVnd } from '../components/common';
import { NotificationBell } from '../components/NotificationBell';
import { ExtraStatusTag } from '../components/PartnerExtraReview';
import { CompleteTripModal, type ExtraValues } from '../components/partner/CompleteTripModal';
import { NEXT_STEP, PartnerTripDetail } from '../components/partner/PartnerTripDetail';
import type { PartnerTrip } from '../components/partner/types';
import { ResponsiveTable } from '../components/ResponsiveTable';
import { PAYMENT_METHOD, TRIP_STATUS } from '../labels';
import { BRAND } from '../theme';
import type { PaymentMethod, TripStatus } from '../types';

interface Summary {
  from: string | null;
  to: string | null;
  /** Còn nợ đầu kỳ (trước ngày bắt đầu lọc) */
  opening: number;
  tripCount: number;
  totalNet: number;
  totalVat: number;
  totalCost: number;
  totalPaid: number;
  balance: number;
  trips: { id: number; pickupTime: string; pickupAddress: string; dropoffAddress: string | null; partnerPlate: string | null; partnerCost: string | null; partnerExtraUp: string; partnerExtraDown: string; partnerExtraNote: string | null; partnerExtraStatus: string | null; partnerExtraReviewNote: string | null; partnerInvoice: boolean; partnerVatPercent: string; partnerNet: number; partnerVat: number; partnerTotal: number; status: TripStatus; booking: { code: string }; vehicleType: { name: string } }[];
  payments: { id: number; amount: string; paidAt: string; method: PaymentMethod; reference: string | null; note: string | null }[];
}

type Tab = 'new' | 'active' | 'history' | 'money';

/** Kỳ xem công nợ */
type Period = 'all' | 'month' | 'lastMonth' | 'quarter' | 'year' | 'custom';
const quarterStart = () => dayjs().startOf('month').subtract(dayjs().month() % 3, 'month');
const PERIODS: { value: Period; label: string; range?: () => [Dayjs, Dayjs] }[] = [
  { value: 'all', label: 'Tất cả thời gian' },
  { value: 'month', label: 'Tháng này', range: () => [dayjs().startOf('month'), dayjs().endOf('month')] },
  { value: 'lastMonth', label: 'Tháng trước', range: () => [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
  { value: 'quarter', label: 'Quý này', range: () => [quarterStart(), quarterStart().add(2, 'month').endOf('month')] },
  { value: 'year', label: 'Năm nay', range: () => [dayjs().startOf('year'), dayjs().endOf('year')] },
  { value: 'custom', label: 'Chọn khoảng ngày…' },
];

const STATUS_TAG: Partial<Record<TripStatus, { label: string; color: string }>> = {
  DA_GAN: { label: 'Chờ nhận', color: 'orange' },
  TAI_XE_NHAN: { label: 'Đã nhận chuyến', color: 'cyan' },
};

/** Nhóm chuyến theo ngày đón: "Hôm nay", "Ngày mai", "Thứ Năm 09/10" */
function dayTitle(iso: string) {
  const d = dayjs(iso).startOf('day');
  const diff = d.diff(dayjs().startOf('day'), 'day');
  const label = diff === 0 ? 'Hôm nay' : diff === 1 ? 'Ngày mai' : diff === -1 ? 'Hôm qua' : d.format('dddd');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} · ${d.format('DD/MM')}`;
}

/**
 * Cổng nhà xe đối tác (giống app lái xe): danh sách chuyến theo ngày → bấm mở chi tiết (lộ trình, liên hệ đón khách,
 * đoàn khách, bảng đón), nhận / từ chối, nhập xe & tài xế, cập nhật trạng thái, xem công nợ.
 * Không thấy giá bán cho khách, thông tin khách hàng.
 */
export default function PartnerPortalPage() {
  const { user, logout } = useAuth();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('new');
  const [pwdOpen, setPwdOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [vehicleFor, setVehicleFor] = useState<{ trip: PartnerTrip; accept: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState<PartnerTrip | null>(null);
  const [vehicleForm] = Form.useForm<{ partnerPlate?: string; partnerDriverName?: string; partnerDriverPhone?: string }>();

  const { data: me } = useQuery({ queryKey: ['/partner/me'], queryFn: () => api<{ name: string }>('/partner/me') });
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['/partner/trips', tab],
    queryFn: () => api<{ items: PartnerTrip[]; counts: { new: number; active: number } }>('/partner/trips', { query: { scope: tab } }),
    enabled: tab !== 'money',
    refetchInterval: 60_000,
  });
  const { data: opened } = useQuery({
    queryKey: ['/partner/trips', 'detail', openId],
    queryFn: () => api<PartnerTrip>(`/partner/trips/${openId}`),
    enabled: !!openId,
  });
  const [period, setPeriod] = useState<Period>('all');
  const [custom, setCustom] = useState<[Dayjs, Dayjs] | null>(null);
  const range = period === 'custom' ? custom : (PERIODS.find((p) => p.value === period)?.range?.() ?? null);
  const from = range?.[0].format('YYYY-MM-DD');
  const to = range?.[1].format('YYYY-MM-DD');
  const { data: summary, isFetching: summaryLoading } = useQuery({
    queryKey: ['/partner/summary', from, to],
    queryFn: () => api<Summary>('/partner/summary', { query: { from, to } }),
    enabled: tab === 'money' && (period !== 'custom' || !!custom),
    placeholderData: (prev) => prev,
  });

  // Mở từ thông báo (?trip=ID): chuyển sang tab của chuyến và mở chi tiết
  const focusTrip = Number(params.get('trip')) || null;
  useEffect(() => {
    if (!focusTrip) return;
    api<PartnerTrip>(`/partner/trips/${focusTrip}`)
      .then((t) => {
        setTab(t.status === 'DA_GAN' ? 'new' : t.status === 'HOAN_THANH' || t.status === 'HUY' ? 'history' : 'active');
        setOpenId(t.id);
      })
      .catch(() => message.warning('Chuyến này không còn giao cho nhà xe'))
      .finally(() => setParams({}, { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTrip]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      message.success(ok);
      queryClient.invalidateQueries({ queryKey: ['/partner'] });
      queryClient.invalidateQueries({ queryKey: ['/partner/trips'] });
      return true;
    } catch (e) {
      message.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openVehicle(trip: PartnerTrip, accept: boolean) {
    vehicleForm.setFieldsValue({ partnerPlate: trip.partnerPlate ?? '', partnerDriverName: trip.partnerDriverName ?? '', partnerDriverPhone: trip.partnerDriverPhone ?? '' });
    setVehicleFor({ trip, accept });
  }

  async function saveVehicle() {
    if (!vehicleFor) return;
    const v = await vehicleForm.validateFields();
    const { trip, accept } = vehicleFor;
    const done = await run(() => api(`/partner/trips/${trip.id}/${accept ? 'accept' : 'vehicle'}`, { method: 'POST', body: v }), accept ? 'Đã nhận chuyến' : 'Đã cập nhật xe / tài xế');
    if (done) {
      setVehicleFor(null);
      if (accept) setTab('active');
    }
  }

  function reject(trip: PartnerTrip) {
    let reason = '';
    modal.confirm({
      title: `Từ chối chuyến ${trip.booking.code}?`,
      content: <Input.TextArea rows={3} autoFocus placeholder="Lý do (bắt buộc), vd: hết xe ngày này" onChange={(e) => (reason = e.target.value)} />,
      okText: 'Từ chối',
      okButtonProps: { danger: true },
      cancelText: 'Không',
      onOk: async () => {
        if (!reason.trim()) {
          message.warning('Vui lòng nhập lý do');
          return Promise.reject();
        }
        if (await run(() => api(`/partner/trips/${trip.id}/reject`, { method: 'POST', body: { reason } }), 'Đã từ chối, văn phòng sẽ điều xe khác')) setOpenId(null);
      },
    });
  }

  async function complete(v: ExtraValues) {
    if (!completing) return;
    const body = { status: 'HOAN_THANH', extraUp: v.extraUp || 0, extraDown: v.extraDown || 0, extraNote: v.extraNote?.trim() || undefined };
    if (await run(() => api(`/partner/trips/${completing.id}/status`, { method: 'POST', body }), 'Đã hoàn thành chuyến')) setCompleting(null);
  }

  function advance(trip: PartnerTrip) {
    const next = NEXT_STEP[trip.status];
    if (!next) return;
    // Hoàn thành: hiện bảng nhập giá phát sinh
    if (next.status === 'HOAN_THANH') {
      setCompleting(trip);
      return;
    }
    modal.confirm({
      title: `${next.label}?`,
      content: `${trip.booking.code} · ${dayjs(trip.pickupTime).format('HH:mm DD/MM')}`,
      okText: next.label,
      cancelText: 'Không',
      onOk: () => run(() => api(`/partner/trips/${trip.id}/status`, { method: 'POST', body: { status: next.status } }), `Đã cập nhật: ${TRIP_STATUS[next.status as TripStatus].label}`),
    });
  }

  const counts = data?.counts;
  const tabs = [
    { value: 'new', label: `Chờ nhận${counts?.new ? ` (${counts.new})` : ''}` },
    { value: 'active', label: `Đang chạy${counts?.active ? ` (${counts.active})` : ''}` },
    { value: 'history', label: 'Đã xong' },
    { value: 'money', label: 'Công nợ' },
  ];

  // Nhóm theo ngày đón
  const groups: { key: string; title: string; items: PartnerTrip[] }[] = [];
  for (const t of data?.items ?? []) {
    const key = dayjs(t.pickupTime).format('YYYY-MM-DD');
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, title: dayTitle(t.pickupTime), items: [] }));
    g.items.push(t);
  }
  const detail = opened ?? data?.items.find((t) => t.id === openId) ?? null;

  return (
    <Layout style={{ minHeight: '100vh', background: BRAND.bg }}>
      <Layout.Header className="app-header pt-header">
        <Flex align="center" gap={10} style={{ minWidth: 0, flex: 1 }}>
          <img src="/api/settings/logo" alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 8, flex: 'none' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
          <div style={{ minWidth: 0, lineHeight: 1.2 }}>
            <div style={{ fontSize: 12, color: BRAND.muted }}>Cổng nhà xe đối tác</div>
            <div className="pt-head-name">{me?.name ?? '…'}</div>
          </div>
        </Flex>
        <Flex align="center" gap={8} style={{ flex: 'none' }}>
          <NotificationBell />
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'me', label: <b>{user?.fullName}</b>, disabled: true },
                { type: 'divider' },
                { key: 'pwd', icon: <KeyOutlined />, label: 'Đổi mật khẩu', onClick: () => setPwdOpen(true) },
                { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true, onClick: logout },
              ],
            }}
          >
            <Avatar style={{ background: BRAND.primary, cursor: 'pointer' }}>{user?.fullName?.trim().split(/\s+/).pop()?.[0]?.toUpperCase()}</Avatar>
          </Dropdown>
        </Flex>
      </Layout.Header>

      <Layout.Content style={{ padding: 12, maxWidth: 960, width: '100%', margin: '0 auto', minWidth: 0 }}>
        <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
          <Segmented className="pt-tabs" block value={tab} onChange={(v) => setTab(v as Tab)} options={tabs} style={{ flex: 1, minWidth: 0 }} />
          {tab !== 'money' && <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching} title="Tải lại" aria-label="Tải lại" />}
        </Flex>

        {tab === 'money' ? (
          <>
            <Flex gap={8} wrap style={{ marginBottom: 12 }}>
              <Select value={period} onChange={(v: Period) => setPeriod(v)} options={PERIODS.map(({ value, label }) => ({ value, label }))} style={{ flex: '1 1 150px' }} />
              {period === 'custom' && (
                <DatePicker.RangePicker
                  format="DD/MM/YYYY"
                  value={custom}
                  onChange={(v) => setCustom(v?.[0] && v[1] ? [v[0], v[1]] : null)}
                  placeholder={['Từ ngày', 'Đến ngày']}
                  inputReadOnly
                  style={{ flex: '1 1 240px' }}
                />
              )}
            </Flex>
            {period === 'custom' && !custom ? (
              <Card>
                <Empty description="Chọn khoảng ngày để xem công nợ" />
              </Card>
            ) : (
              <Spin spinning={summaryLoading && !!summary}>
                <MoneyView summary={summary} range={range} />
              </Spin>
            )}
          </>
        ) : isFetching && !data ? (
          <Flex justify="center" style={{ padding: 48 }}>
            <Spin />
          </Flex>
        ) : !data?.items.length ? (
          <Card>
            <Empty description={tab === 'new' ? 'Không có chuyến nào chờ nhận' : tab === 'active' ? 'Không có chuyến đang chạy' : 'Chưa có chuyến hoàn thành trong 60 ngày'} />
          </Card>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <Flex justify="space-between" align="center" className="pt-day">
                <b>{g.title}</b>
                <span className="pt-day-count">{g.items.length} chuyến</span>
              </Flex>
              {g.items.map((t) => (
                <TripRow key={t.id} trip={t} onOpen={() => setOpenId(t.id)} />
              ))}
            </div>
          ))
        )}
      </Layout.Content>

      {openId && detail && (
        <PartnerTripDetail
          trip={detail}
          busy={busy}
          onClose={() => setOpenId(null)}
          onAccept={() => openVehicle(detail, true)}
          onReject={() => reject(detail)}
          onVehicle={() => openVehicle(detail, false)}
          onNext={() => advance(detail)}
        />
      )}

      <Modal
        open={!!vehicleFor}
        title={vehicleFor?.accept ? `Nhận chuyến ${vehicleFor.trip.booking.code}` : 'Xe và tài xế'}
        okText={vehicleFor?.accept ? 'Nhận chuyến' : 'Lưu'}
        cancelText="Hủy"
        confirmLoading={busy}
        onOk={saveVehicle}
        onCancel={() => setVehicleFor(null)}
        destroyOnHidden
        zIndex={1100}
      >
        {vehicleFor?.accept && (
          <Typography.Paragraph type="secondary">Nhập luôn xe và tài xế nếu đã sắp xếp (có thể nhập sau, nhưng phải có trước khi bắt đầu chuyến).</Typography.Paragraph>
        )}
        <Form form={vehicleForm} layout="vertical">
          <Form.Item name="partnerPlate" label="Biển số xe" normalize={(v?: string) => v?.toUpperCase()}>
            <Input placeholder="43B-123.45" />
          </Form.Item>
          <Form.Item name="partnerDriverName" label="Tên tài xế">
            <Input />
          </Form.Item>
          <Form.Item name="partnerDriverPhone" label="SĐT tài xế">
            <Input inputMode="tel" />
          </Form.Item>
        </Form>
      </Modal>
      <CompleteTripModal trip={completing} busy={busy} onCancel={() => setCompleting(null)} onSubmit={complete} />
      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </Layout>
  );
}

/** Thẻ chuyến trong danh sách (giống app lái xe): giờ, dịch vụ, tuyến đón → trả, thông tin nhanh */
function TripRow({ trip: t, onOpen }: { trip: PartnerTrip; onOpen: () => void }) {
  const tag = STATUS_TAG[t.status];
  const isNew = t.status === 'DA_GAN';
  return (
    <div className={isNew ? 'pt-row-card pt-row-new' : 'pt-row-card'} onClick={onOpen} role="button">
      <Flex justify="space-between" align="flex-start">
        <div>
          <div className="pt-row-time">{dayjs(t.pickupTime).format('HH:mm')}</div>
          <div className="pt-row-service">
            {t.service?.name ?? t.serviceType} · {t.booking.code}
          </div>
        </div>
        <Flex align="center" gap={6}>
          {tag ? <Tag color={tag.color}>{tag.label}</Tag> : <EnumTag labels={TRIP_STATUS} value={t.status} />}
          <RightOutlined style={{ color: '#a0aec0' }} />
        </Flex>
      </Flex>
      <div className="pt-route">
        <div>
          <span className="pt-route-dot" style={{ background: '#1677ff' }} />
          {t.pickupAddress}
        </div>
        {t.dropoffAddress && (
          <div>
            <span className="pt-route-dot" style={{ background: '#e3262b' }} />
            {t.dropoffAddress}
          </div>
        )}
      </div>
      <Flex gap={6} wrap>
        <Tag>👥 {t.passengers} khách</Tag>
        <Tag>🚐 {t.vehicleType.name}</Tag>
        {t.flightNumber && <Tag color="blue">✈ Đón {t.flightNumber}</Tag>}
        {t.departureFlight && <Tag color="blue">✈ Tiễn {t.departureFlight}</Tag>}
        {t.partnerInvoice && <Tag color="purple">🧾 Xuất HĐ</Tag>}
        {(t.partnerPlate || t.partnerDriverName) && <Tag color="geekblue">{[t.partnerPlate, t.partnerDriverName].filter(Boolean).join(' · ')}</Tag>}
      </Flex>
    </div>
  );
}

function MoneyView({ summary, range }: { summary?: Summary; range: [Dayjs, Dayjs] | null }) {
  if (!summary) {
    return (
      <Flex justify="center" style={{ padding: 48 }}>
        <Spin />
      </Flex>
    );
  }
  return (
    <>
      {range && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          Kỳ {range[0].format('DD/MM/YYYY')} – {range[1].format('DD/MM/YYYY')}: chuyến tính theo ngày đón, thanh toán theo ngày trả.
        </Typography.Paragraph>
      )}
      <Flex gap={12} wrap style={{ marginBottom: 12 }}>
        {range && (
          <Card style={{ flex: '1 1 200px' }}>
            <Statistic title="Còn nợ đầu kỳ" value={summary.opening} suffix="đ" groupSeparator="." />
          </Card>
        )}
        <Card style={{ flex: '1 1 200px' }}>
          <Statistic title={`Tiền chuyến${range ? ' trong kỳ' : ''} (${summary.tripCount} chuyến)`} value={summary.totalCost} suffix="đ" groupSeparator="." />
          {summary.totalVat > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Chưa thuế {formatVnd(summary.totalNet)}đ + thuế {formatVnd(summary.totalVat)}đ
            </Typography.Text>
          )}
        </Card>
        <Card style={{ flex: '1 1 200px' }}>
          <Statistic title={range ? 'Đã thanh toán trong kỳ' : 'Đã được thanh toán'} value={summary.totalPaid} suffix="đ" groupSeparator="." valueStyle={{ color: '#15803d' }} />
        </Card>
        <Card style={{ flex: '1 1 200px' }}>
          <Statistic title={range ? 'Còn lại cuối kỳ' : 'Còn lại'} value={summary.balance} suffix="đ" groupSeparator="." valueStyle={{ color: summary.balance > 0 ? '#b45309' : undefined }} />
        </Card>
      </Flex>
      <Card title="Các lần thanh toán" style={{ marginBottom: 12 }}>
        <ResponsiveTable
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={summary.payments}
          locale={{ emptyText: 'Chưa có lần thanh toán nào' }}
          columns={[
            { title: 'Ngày', dataIndex: 'paidAt', render: (v) => dayjs(v).format(DATE_FORMAT) },
            { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (v) => <b>{formatVnd(v)}đ</b> },
            { title: 'Hình thức', dataIndex: 'method', render: (v: PaymentMethod) => PAYMENT_METHOD[v]?.label },
            { title: 'Số chứng từ / ghi chú', render: (_, p) => [p.reference, p.note].filter(Boolean).join(' · ') },
          ]}
        />
      </Card>
      <Card title="Chuyến tính tiền">
        <ResponsiveTable
          rowKey="id"
          size="small"
          dataSource={summary.trips}
          pagination={{ pageSize: 100, hideOnSinglePage: true }}
          columns={[
            { title: 'Ngày đón', dataIndex: 'pickupTime', render: (v) => dayjs(v).format('HH:mm DD/MM/YYYY'), sorter: (a, b) => a.pickupTime.localeCompare(b.pickupTime) },
            { title: 'Booking', render: (_, t) => t.booking.code },
            { title: 'Hành trình', render: (_, t) => (t.dropoffAddress ? `${t.pickupAddress} → ${t.dropoffAddress}` : t.pickupAddress) },
            { title: 'Xe', render: (_, t) => [t.vehicleType.name, t.partnerPlate].filter(Boolean).join(' · ') },
            { title: 'Trạng thái', dataIndex: 'status', render: (v) => <EnumTag labels={TRIP_STATUS} value={v} /> },
            {
              title: 'Phát sinh',
              align: 'right',
              render: (_, t) => {
                const up = Number(t.partnerExtraUp);
                const down = Number(t.partnerExtraDown);
                if (!up && !down) return '—';
                return (
                  <>
                    <span title={t.partnerExtraNote ?? undefined}>{[up && `+${formatVnd(up)}`, down && `−${formatVnd(down)}`].filter(Boolean).join(' ')}</span>
                    <div>
                      <ExtraStatusTag status={t.partnerExtraStatus} note={t.partnerExtraReviewNote} />
                    </div>
                  </>
                );
              },
            },
            { title: 'Chưa thuế', dataIndex: 'partnerNet', align: 'right', render: (v) => `${formatVnd(v)}đ` },
            { title: 'Thuế', dataIndex: 'partnerVat', align: 'right', render: (v, t) => (t.partnerInvoice ? `${formatVnd(v)}đ (${Number(t.partnerVatPercent)}%)` : '—') },
            { title: 'Thành tiền', dataIndex: 'partnerTotal', align: 'right', render: (v) => <b>{formatVnd(v)}đ</b> },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={6}>
                <b>Tổng</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="right">
                <b>{formatVnd(summary.totalNet)}đ</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={7} align="right">
                <b>{formatVnd(summary.totalVat)}đ</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={8} align="right">
                <b>{formatVnd(summary.totalCost)}đ</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>
    </>
  );
}
