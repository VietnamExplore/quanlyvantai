import { CheckCircleFilled, CopyOutlined, DownOutlined, FileExcelOutlined, FileProtectOutlined, LeftOutlined, PlusOutlined, RightOutlined, UpOutlined, WarningFilled } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Badge, Button, Card, Col, DatePicker, Descriptions, Drawer, Empty, Flex, Form, Grid, Input, InputNumber, Modal, Popconfirm, Progress, Radio, Row, Segmented, Select, Space, Spin, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { useCopyText } from '../clipboard';
import { MoneyInput, formatVnd, useCompanyDriverOptions, usePartnerOptions } from '../components/common';
import { downloadExcel } from '../excel';
import { SendOrderModal, type SendTarget } from '../components/SendOrderModal';
import { TRIP_STATUS } from '../labels';
import { RUN_PROGRESS, RUN_STATUS, type ShuttleRoute, type ShuttleRun, type ShuttleRunDetail, type ShuttleRunTrip } from '../shuttle-types';
import type { Vehicle } from '../types';
import { partnerSafe } from '../partner-safe';

const hm = (d: string) => dayjs(d).format('HH:mm');
/** Ghi chú gửi lái xe / nhà xe: bỏ tên kênh bán, mã đặt chỗ, tên khách hàng */
const safeNote = (t: ShuttleRunTrip) => partnerSafe(t.notes, [t.booking.customerRef, t.booking.customer?.name]);
/**
 * Khách để nhà xe cung cấp gọi đón: trưởng đoàn / HDV → khách đi có SĐT → người đặt nếu là khách đi.
 * Booking của công ty / đại lý mà không có SĐT khách đi: không ghi tên / SĐT đại lý (nhà xe liên hệ văn phòng).
 */
const GENDER_VI: Record<string, string> = { NAM: 'Nam', NU: 'Nữ' };
/** "Kim Minsu · Nam · 1990 · Hàn Quốc · +8210…" */
const paxLine = (p: NonNullable<ShuttleRunTrip['booking']['passengers']>[number]) =>
  [p.fullName, p.gender && GENDER_VI[p.gender], p.birthYear, p.nationality, p.phone].filter(Boolean).join(' · ');
const guestOf = (t: ShuttleRunTrip) => {
  const b = t.booking;
  if (b.leaderPhone) return { name: b.leaderName, phone: b.leaderPhone };
  const pax = b.passengers?.find((x) => x.phone);
  if (pax) return { name: pax.fullName, phone: pax.phone };
  if (!b.customer) return { name: b.contactName, phone: b.contactPhone };
  return { name: b.leaderName ?? 'Khách', phone: 'liên hệ văn phòng' };
};
const contactOf = (t: ShuttleRunTrip) => ({ name: t.booking.leaderName || t.booking.contactName, phone: t.booking.leaderPhone || t.booking.contactPhone });
const paxText = (t: { passengers: number; childCount: number }) => `${t.passengers} khách${t.childCount ? ` (${t.childCount} trẻ em)` : ''}`;

/** Xe ghép: chuyến theo ngày, ghế đã bán / còn trống, điều xe cả chuyến, danh sách khách theo điểm đón */
export default function ShuttlePage() {
  const { hasRole } = useAuth();
  const canDispatch = hasRole('ADMIN', 'DIEU_HANH');
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ? dayjs(params.get('date')) : dayjs();
  const ymd = date.format('YYYY-MM-DD');
  const openRun = Number(params.get('run')) || null;
  const setParam = (k: string, v: string | null) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (v) n.set(k, v);
      else n.delete(k);
      return n;
    });
  const [creating, setCreating] = useState(false);

  const { data: runs = [], isFetching } = useQuery({ queryKey: ['/shuttle/runs', { date: ymd }], queryFn: () => api<ShuttleRun[]>('/shuttle/runs', { query: { date: ymd } }) });
  const { data: routes = [] } = useQuery({ queryKey: ['/shuttle/routes'], queryFn: () => api<ShuttleRoute[]>('/shuttle/routes') });
  // Đủ mọi tuyến đang chạy (cả tuyến không có chuyến trong ngày), theo thứ tự danh mục; tuyến đã ngừng mà còn chuyến thì thêm cuối
  const byRoute = useMemo(() => {
    const m = new Map<number, { id: number; name: string; runs: ShuttleRun[] }>();
    for (const rt of routes) m.set(rt.id, { id: rt.id, name: rt.name, runs: [] });
    for (const r of runs) {
      const g = m.get(r.routeId) ?? { id: r.routeId, name: r.route.name, runs: [] };
      g.runs.push(r);
      m.set(r.routeId, g);
    }
    return [...m.values()];
  }, [runs, routes]);
  const total = runs.filter((r) => r.status !== 'HUY').reduce((s, r) => ({ sold: s.sold + r.seatsConfirmed + r.seatsHeld, cap: s.cap + r.capacity }), { sold: 0, cap: 0 });
  const pendingAll = runs.filter(needDispatch).length;
  // Tab tuyến đang mở: theo địa chỉ trang, mặc định tuyến đầu tiên còn chuyến chưa điều xe
  const routeKey = params.get('route') ?? String((byRoute.find((g) => g.runs.some(needDispatch)) ?? byRoute.find((g) => g.runs.some(hasGuests)) ?? byRoute.find((g) => g.runs.length) ?? byRoute[0])?.id ?? '');
  const current = byRoute.find((g) => String(g.id) === routeKey);

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Xe ghép
          </Typography.Title>
          <Typography.Text type="secondary">
            {runs.length} chuyến · đã bán {total.sold}/{total.cap} ghế · nhập khách bằng dịch vụ "Xe ghép" trong booking
          </Typography.Text>
          {pendingAll > 0 && (
            <div>
              <Typography.Text type="danger" strong>
                <WarningFilled /> {pendingAll} chuyến có khách chưa điều xe
              </Typography.Text>
            </div>
          )}
        </div>
        <Flex gap={8} wrap>
          <Space.Compact>
            <Button icon={<LeftOutlined />} onClick={() => setParam('date', date.subtract(1, 'day').format('YYYY-MM-DD'))} />
            <DatePicker value={date} format="dd DD/MM/YYYY" allowClear={false} onChange={(d) => d && setParam('date', d.format('YYYY-MM-DD'))} />
            <Button icon={<RightOutlined />} onClick={() => setParam('date', date.add(1, 'day').format('YYYY-MM-DD'))} />
          </Space.Compact>
          <Button onClick={() => setParam('date', null)}>Hôm nay</Button>
          {canDispatch && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              Tạo chuyến thêm
            </Button>
          )}
        </Flex>
      </Flex>

      {isFetching && !runs.length && !byRoute.length ? (
        <Flex justify="center" style={{ padding: 48 }}>
          <Spin />
        </Flex>
      ) : !byRoute.length ? (
        <Card>
          <Empty description={<>Không có chuyến xe ghép ngày {date.format('DD/MM/YYYY')}. Khai báo tuyến và giờ chạy ở <Link to="/shuttle-routes">Danh mục → Tuyến xe ghép</Link>.</>} />
        </Card>
      ) : (
        <Card size="small">
          {/* Tất cả tuyến hiện đủ, tự xuống dòng (không ẩn tuyến vào nút "…") */}
          <div className="shuttle-route-grid">
            {byRoute.map((g) => {
              const live = g.runs.filter((r) => r.status !== 'HUY');
              const pending = g.runs.filter(needDispatch).length;
              const guests = live.reduce((n, r) => n + r.seatsConfirmed + r.seatsHeld, 0);
              const active = String(g.id) === routeKey;
              return (
                <button key={g.id} type="button" className={`shuttle-route-chip${active ? ' active' : ''}${live.length ? '' : ' empty'}`} onClick={() => setParam('route', String(g.id))}>
                  <span className="name">{g.name}</span>
                  <span className="meta">
                    {live.length ? `${live.length} chuyến · ${guests} khách` : 'Không có chuyến'}
                    {pending > 0 ? (
                      <Badge count={pending} size="small" title={`${pending} chuyến có khách chưa điều xe`} />
                    ) : live.some((r) => r.seatsConfirmed > 0) ? (
                      <CheckCircleFilled style={{ color: '#16a34a' }} title="Đã điều xe đủ" />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          {current && (
            <div style={{ marginTop: 12 }}>
              {current.runs.length ? (
                <RouteRuns key={current.id} runs={current.runs} onOpen={(id) => setParam('run', String(id))} />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Tuyến ${current.name} không có chuyến ngày ${date.format('DD/MM/YYYY')}`} />
              )}
            </div>
          )}
        </Card>
      )}

      <RunDrawer runId={openRun} canDispatch={canDispatch} onClose={() => setParam('run', null)} />
      <CreateRunModal open={creating} date={date} onClose={() => setCreating(false)} onCreated={(r) => setParams((p) => {
        const n = new URLSearchParams(p);
        n.set('date', dayjs(r.departAt).format('YYYY-MM-DD'));
        n.set('run', String(r.id));
        return n;
      })} />
    </Flex>
  );
}

/** Chuyến có khách đã xác nhận mà chưa điều xe (cần xử lý) */
const needDispatch = (r: ShuttleRun) => r.status !== 'HUY' && !r.vehicle && !r.partner && r.seatsConfirmed > 0;
const hasGuests = (r: ShuttleRun) => r.seatsConfirmed + r.seatsHeld > 0;

type RunFilter = 'guests' | 'pending' | 'all';

/** Nội dung một tab tuyến: cảnh báo gọn (bấm mới hiện các giờ chưa điều), lưới chuyến theo bộ lọc */
function RouteRuns({ runs, onOpen }: { runs: ShuttleRun[]; onOpen: (id: number) => void }) {
  const pending = runs.filter(needDispatch);
  const held = runs.filter((r) => r.status !== 'HUY' && !r.vehicle && !r.partner && r.seatsConfirmed === 0 && r.seatsHeld > 0);
  const withGuests = runs.filter(hasGuests);
  const [showPending, setShowPending] = useState(false);
  // Mặc định: chỉ chuyến có khách (tuyến chạy nhiều giờ không bị rối); chưa có khách thì hiện tất cả giờ
  const [filter, setFilter] = useState<RunFilter>(withGuests.length ? 'guests' : 'all');
  const shown = filter === 'pending' ? pending : filter === 'guests' ? withGuests : runs;
  const pax = (r: ShuttleRun) => r.seatsConfirmed + r.seatsHeld;

  return (
    <Flex vertical gap={12}>
      {pending.length > 0 ? (
        <Alert
          type="error"
          showIcon
          title={
            <Flex justify="space-between" align="center" wrap gap={8}>
              <span>
                <b>{pending.length}</b> chuyến có khách chưa điều xe ({pending.reduce((s, r) => s + pax(r), 0)} khách)
              </span>
              <Button size="small" type="link" icon={showPending ? <UpOutlined /> : <DownOutlined />} onClick={() => setShowPending((v) => !v)}>
                {showPending ? 'Ẩn' : 'Xem giờ chưa điều'}
              </Button>
            </Flex>
          }
          description={
            showPending && (
              <Flex gap={6} wrap style={{ marginTop: 4 }}>
                {pending.map((r) => (
                  <Tag key={r.id} color="red" style={{ cursor: 'pointer', fontSize: 14, padding: '2px 8px' }} onClick={() => onOpen(r.id)}>
                    <b>{hm(r.departAt)}</b> · {pax(r)} khách
                  </Tag>
                ))}
              </Flex>
            )
          }
        />
      ) : withGuests.length > 0 ? (
        <Alert type="success" showIcon title="Các chuyến có khách đã được điều xe" />
      ) : null}
      {held.length > 0 && (
        <Typography.Text type="secondary">
          {held.length} chuyến chỉ có khách giữ chỗ (booking chưa xác nhận): {held.map((r) => hm(r.departAt)).join(', ')}
        </Typography.Text>
      )}
      <Segmented<RunFilter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'guests', label: `Có khách (${withGuests.length})` },
          { value: 'pending', label: `Chưa điều xe (${pending.length})` },
          { value: 'all', label: `Tất cả giờ (${runs.length})` },
        ]}
        style={{ alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}
      />
      {shown.length ? (
        <Row gutter={[12, 12]}>
          {shown.map((r) => (
            <Col key={r.id} xs={12} sm={8} lg={6} xl={4}>
              <RunCard run={r} onClick={() => onOpen(r.id)} />
            </Col>
          ))}
        </Row>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={filter === 'pending' ? 'Không có chuyến nào cần điều xe' : 'Chưa có khách đặt chỗ trên tuyến này'} />
      )}
    </Flex>
  );
}

function RunCard({ run, onClick }: { run: ShuttleRun; onClick: () => void }) {
  const used = run.seatsConfirmed + run.seatsHeld;
  const assigned = run.vehicle ? `${run.vehicle.plateNumber}${run.driver ? ` · ${run.driver.fullName}` : ''}` : run.partner ? `${run.partner.name}${run.partnerPlate ? ` · ${run.partnerPlate}` : ''}` : null;
  return (
    <Card size="small" hoverable onClick={onClick} style={{ opacity: run.status === 'HUY' ? 0.5 : 1, borderColor: needDispatch(run) ? '#ef4444' : run.status === 'DONG_BAN' ? '#f0b05a' : undefined, background: needDispatch(run) ? '#fef2f2' : undefined }}>
      <Flex justify="space-between" align="baseline">
        <Typography.Title level={3} style={{ margin: 0 }}>
          {hm(run.departAt)}
        </Typography.Title>
        <Space size={4} wrap style={{ justifyContent: 'flex-end' }}>
          {run.status !== 'MO_BAN' && <Tag color={RUN_STATUS[run.status].color}>{RUN_STATUS[run.status].label}</Tag>}
          {run.tripStatus && run.tripStatus !== 'DA_DIEU' && run.tripStatus !== 'CHO_DIEU' && <Tag color={RUN_PROGRESS[run.tripStatus].color}>{RUN_PROGRESS[run.tripStatus].label}</Tag>}
          {!run.scheduleId && <Tag>Chuyến thêm</Tag>}
          {run.offSchedule && (
            <Tag color="red" title="Giờ chạy này đã bị tắt / đổi trong danh mục tuyến nhưng chuyến còn khách: chuyển khách sang giờ khác (sửa lượt đặt trong booking)">
              Đã bỏ khỏi lịch
            </Tag>
          )}
        </Space>
      </Flex>
      <Progress
        percent={Math.round((used / run.capacity) * 100)}
        success={{ percent: Math.round((run.seatsConfirmed / run.capacity) * 100) }}
        showInfo={false}
        size="small"
        style={{ margin: '6px 0 2px' }}
      />
      <Typography.Text>
        <b>{used}</b>/{run.capacity} ghế{run.seatsHeld ? <Typography.Text type="secondary"> ({run.seatsHeld} giữ chỗ)</Typography.Text> : null} · còn <b>{run.seatsLeft}</b>
      </Typography.Text>
      <div style={{ marginTop: 4, fontSize: 13 }}>
        {assigned ? <Typography.Text>🚐 {assigned}</Typography.Text> : used > 0 ? <Typography.Text type="warning">Chưa điều xe</Typography.Text> : <Typography.Text type="secondary">{run.vehicleType.name}</Typography.Text>}
      </div>
    </Card>
  );
}

function CreateRunModal({ open, date, onClose, onCreated }: { open: boolean; date: Dayjs; onClose: () => void; onCreated: (r: ShuttleRun) => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const { data: routes = [] } = useQuery({ queryKey: ['/shuttle/routes'], queryFn: () => api<ShuttleRoute[]>('/shuttle/routes'), enabled: open });
  const submit = async () => {
    let v;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    setBusy(true);
    try {
      const r = await api<ShuttleRun>('/shuttle/runs', { method: 'POST', body: { routeId: v.routeId, departAt: (v.departAt as Dayjs).toISOString(), capacity: v.capacity || undefined, note: v.note || null } });
      message.success('Đã tạo chuyến thêm');
      queryClient.invalidateQueries({ queryKey: ['/shuttle/runs'] });
      onClose();
      onCreated(r);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Tạo chuyến xe ghép thêm" open={open} onCancel={onClose} onOk={submit} okText="Tạo chuyến" cancelText="Hủy" confirmLoading={busy} destroyOnHidden afterOpenChange={(o) => o && form.setFieldsValue({ departAt: date.hour(8).minute(0) })}>
      <Typography.Paragraph type="secondary">Tăng chuyến ngoài lịch cố định, hoặc gom khách lẻ cùng khung giờ (vd khách ra sân bay).</Typography.Paragraph>
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="routeId" label="Tuyến" rules={[{ required: true, message: 'Chọn tuyến' }]}>
          <Select
            options={routes.map((r) => ({ value: r.id, label: r.name }))}
            onChange={(id: number) => form.setFieldValue('capacity', routes.find((r) => r.id === id)?.capacity)}
          />
        </Form.Item>
        <Row gutter={12}>
          <Col span={14}>
            <Form.Item name="departAt" label="Giờ xuất bến" rules={[{ required: true, message: 'Chọn giờ' }]}>
              <DatePicker showTime={{ format: 'HH:mm', minuteStep: 5 }} format="HH:mm DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="capacity" label="Số ghế bán">
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="note" label="Ghi chú">
          <Input placeholder="VD: tăng chuyến cao điểm" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function RunDrawer({ runId, canDispatch, onClose }: { runId: number | null; canDispatch: boolean; onClose: () => void }) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const copy = useCopyText();
  const mobile = Grid.useBreakpoint().md === false;
  const [form] = Form.useForm();
  const [busy, setBusy] = useState<string | null>(null);
  const [editAssign, setEditAssign] = useState(false);
  const mode: 'COMPANY' | 'PARTNER' = Form.useWatch('mode', form) ?? 'COMPANY';
  const pricing: 'PAX' | 'RUN' = Form.useWatch('partnerPricing', form) ?? 'PAX';
  const perPax: number | null = Form.useWatch('partnerPricePerPax', form) ?? null;
  const driverOptions = useCompanyDriverOptions();
  const partnerOptions = usePartnerOptions();
  const { data: vehicles = [] } = useQuery({ queryKey: ['/vehicles', { ownership: 'CONG_TY' }], queryFn: () => api<Vehicle[]>('/vehicles', { query: { ownership: 'CONG_TY' } }), enabled: !!runId && canDispatch });
  const { data: run, isLoading } = useQuery({ queryKey: ['/shuttle/runs', runId], queryFn: () => api<ShuttleRunDetail>(`/shuttle/runs/${runId}`), enabled: !!runId });

  const assigned = !!(run?.vehicle || run?.partner);
  const active = (run?.trips ?? []).filter((t) => t.status !== 'HUY' && t.booking.status !== 'HUY');
  const started = active.some((t) => ['DANG_DEN_DON', 'DA_DON_KHACH', 'HOAN_THANH'].includes(t.status));
  const done = active.length > 0 && active.every((t) => t.status === 'HOAN_THANH');
  const activePax = active.reduce((s, t) => s + t.passengers, 0);

  const refresh = (r?: ShuttleRunDetail) => {
    if (r) queryClient.setQueryData(['/shuttle/runs', runId], r);
    queryClient.invalidateQueries({ queryKey: ['/shuttle/runs'] });
    queryClient.invalidateQueries({ queryKey: ['/dispatch'] });
  };

  async function call(kind: string, path: string, method: string, body?: unknown, ok?: string) {
    setBusy(kind);
    try {
      const r = await api<ShuttleRunDetail>(path, { method, body });
      if (ok) message.success(ok);
      refresh(r);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.data?.needConfirm) {
        modal.confirm({
          title: 'Có cảnh báo, vẫn điều xe?',
          width: 520,
          content: (
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {e.data.warnings?.map((w) => <li key={w}>{w}</li>)}
            </ul>
          ),
          okText: 'Vẫn điều',
          cancelText: 'Xem lại',
          onOk: () => call(kind, path, method, { ...(body as object), force: true }, ok).then((x) => x && setEditAssign(false)),
        });
      } else {
        message.error((e as Error).message);
      }
      return false;
    } finally {
      setBusy(null);
    }
  }

  const [sendOpen, setSendOpen] = useState(false);
  const sendTargets: SendTarget[] = run?.driver
    ? [{ label: 'lái xe', name: run.driver.fullName, phone: run.driver.phone }]
    : run?.partner
      ? [
          { label: 'nhà xe', name: run.partner.name, phone: run.partner.phone },
          ...(run.partnerDriverName || run.partnerDriverPhone ? [{ label: 'tài xế nhà xe', name: run.partnerDriverName ?? '', phone: run.partnerDriverPhone }] : []),
        ]
      : [];

  const startAssign = () => {
    form.setFieldsValue(
      run?.partner
        ? { mode: 'PARTNER', partnerPricing: run.partnerPricePerPax != null ? 'PAX' : 'RUN', partnerPricePerPax: run.partnerPricePerPax != null ? Number(run.partnerPricePerPax) : null, partnerCost: run.partnerCost ? Number(run.partnerCost) : null, partnerPlate: run.partnerPlate, partnerDriverName: run.partnerDriverName, partnerDriverPhone: run.partnerDriverPhone, dispatchNote: run.dispatchNote }
        : { mode: 'COMPANY', vehicleId: run?.vehicle?.id, driverId: run?.driver?.id, estimatedCost: run?.estimatedCost ? Number(run.estimatedCost) : null, dispatchNote: run?.dispatchNote },
    );
    setEditAssign(true);
  };

  const submitAssign = async () => {
    const { partnerPricing, ...v } = await form.validateFields();
    if (v.mode === 'PARTNER') {
      if (partnerPricing === 'PAX') v.partnerCost = null;
      else v.partnerPricePerPax = null;
    }
    const ok = await call('assign', `/shuttle/runs/${runId}/assign`, 'POST', v, 'Đã điều xe cho cả chuyến');
    if (ok) {
      setEditAssign(false);
      setSendOpen(true);
    }
  };

  // Danh sách khách theo điểm đón (thứ tự đón)
  const groups = useMemo(() => {
    const m = new Map<string, { stop: string; time: string; trips: ShuttleRunTrip[] }>();
    for (const t of active) {
      const key = String(t.shuttlePickupStop?.id ?? 0);
      const g = m.get(key) ?? { stop: t.shuttlePickupStop?.name ?? '—', time: hm(t.pickupTime), trips: [] };
      g.trips.push(t);
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => a.time.localeCompare(b.time));
  }, [active]);

  const manifestText = () => {
    if (!run) return '';
    const lines = [
      `CHUYẾN XE GHÉP – ${run.route.name}`,
      `Xuất bến: ${dayjs(run.departAt).format('HH:mm DD/MM/YYYY')} · ${active.reduce((s, t) => s + t.passengers, 0)} khách / ${active.length} lượt`,
      run.vehicle ? `Xe: ${run.vehicle.plateNumber}${run.driver ? ` – ${run.driver.fullName} ${run.driver.phone}` : ''}` : run.partner ? `Nhà xe: ${run.partner.name}${run.partnerPlate ? ` – ${run.partnerPlate}` : ''}${run.partnerDriverName ? ` – ${run.partnerDriverName} ${run.partnerDriverPhone ?? ''}` : ''}` : '',
      partnerSafe(run.dispatchNote) ? `Lưu ý: ${partnerSafe(run.dispatchNote)}` : '',
    ].filter(Boolean);
    for (const g of groups) {
      lines.push('', `📍 ${g.time} – ${g.stop}`);
      g.trips.forEach((t, i) => {
        const c = contactOf(t);
        lines.push(
          `${i + 1}. ${c.name} – ${c.phone} · ${paxText(t)}`,
          `   Đón: ${t.pickupAddress}${t.dropoffAddress ? ` → Trả: ${t.dropoffAddress}` : ''}${t.flightNumber ? ` · ✈ ${t.flightNumber}` : ''}${t.departureFlight ? ` · ✈ ${t.departureFlight}` : ''}`,
          ...(t.collectAmount ? [`   Thu khách: ${formatVnd(t.collectAmount)}đ`] : []),
          ...(safeNote(t) ? [`   Ghi chú: ${safeNote(t)}`] : []),
        );
      });
    }
    return lines.join('\n');
  };

  /**
   * Lệnh gửi nhà xe cung cấp (xe ghép giao nhà xe): tuyến, giờ khởi hành, khách theo điểm đón (tên + SĐT để gọi đón),
   * điểm trả, giá mỗi khách và tổng tiền – không có mã booking, công ty / đại lý đặt, kênh bán.
   */
  const supplierText = () => {
    if (!run) return '';
    const pax = active.reduce((s, t) => s + t.passengers, 0);
    const kids = active.reduce((s, t) => s + t.childCount, 0);
    const per = run.partnerPricePerPax != null ? Number(run.partnerPricePerPax) : null;
    const count = (list: ShuttleRunTrip[], key: (t: ShuttleRunTrip) => string) => {
      const m = new Map<string, number>();
      for (const t of list) m.set(key(t), (m.get(key(t)) ?? 0) + t.passengers);
      return [...m.entries()];
    };
    const lines = [
      `GIAO KHÁCH XE GHÉP – ${run.route.name}`,
      `Khởi hành: ${dayjs(run.departAt).format('HH:mm DD/MM/YYYY')}`,
      `Số khách: ${pax}${kids ? ` (trong đó ${kids} trẻ em)` : ''}`,
      '',
      'Đón:',
      ...groups.flatMap((g) => [
        `• ${g.time} – ${g.stop}: ${g.trips.reduce((s, t) => s + t.passengers, 0)} khách`,
        ...g.trips.flatMap((t) => {
          const c = guestOf(t);
          const list = t.booking.passengers ?? [];
          // Liên hệ đón (trưởng đoàn / khách có SĐT) + từng khách đi: tên, giới tính, năm sinh, quốc tịch, SĐT
          return [
            `   ▸ ${[c.name, c.phone].filter(Boolean).join(' – ')} · ${paxText(t)}${t.flightNumber ? ` · ✈ ${t.flightNumber}` : ''}`,
            ...list.map((p, i) => `      ${i + 1}. ${paxLine(p)}`),
            ...(list.length && list.length < t.passengers ? [`      (+${t.passengers - list.length} khách chưa có tên)`] : []),
          ];
        }),
      ]),
      'Trả:',
      ...count(active, (t) => t.shuttleDropoffStop?.name ?? '—').map(([stop, n]) => `• ${stop}: ${n} khách`),
      '',
      per != null ? `Giá: ${formatVnd(per)}đ/khách × ${pax} khách = ${formatVnd(per * pax)}đ` : run.partnerCost ? `Giá cả chuyến: ${formatVnd(run.partnerCost)}đ` : '',
      partnerSafe(run.dispatchNote) ? `Lưu ý: ${partnerSafe(run.dispatchNote)}` : '',
    ];
    return lines.filter((x, i) => x !== '' || lines[i - 1] !== '').join('\n').trim();
  };
  const toPartner = !!run?.partner;

  const exportExcel = () =>
    run &&
    downloadExcel(`xe-ghep_${run.route.name.replace(/[^\p{L}\p{N}]+/gu, '-')}_${dayjs(run.departAt).format('YYYYMMDD-HHmm')}.xlsx`, [
      {
        name: 'Danh sách khách',
        title: `CHUYẾN XE GHÉP – ${run.route.name.toUpperCase()}`,
        info: [`Xuất bến ${dayjs(run.departAt).format('HH:mm DD/MM/YYYY')} · ${run.capacity} ghế`, run.vehicle ? `Xe ${run.vehicle.plateNumber}${run.driver ? ` – ${run.driver.fullName}` : ''}` : run.partner ? `Nhà xe ${run.partner.name}` : 'Chưa điều xe'],
        headers: ['Giờ đón', 'Điểm đón', 'Địa chỉ đón', 'Điểm trả', 'Booking', 'Khách / trưởng đoàn', 'SĐT', 'Số khách', 'Trẻ em', 'Chuyến bay', 'Thu khách', 'Ghi chú', 'Trạng thái'],
        sumColumns: [7, 8, 10],
        totalLabel: 'Tổng cộng',
        rows: groups.flatMap((g) =>
          g.trips.map((t) => {
            const c = contactOf(t);
            return [hm(t.pickupTime), g.stop, t.pickupAddress, t.shuttleDropoffStop?.name ?? t.dropoffAddress, t.booking.code, c.name, c.phone, t.passengers, t.childCount, [t.flightNumber, t.departureFlight].filter(Boolean).join(' / '), t.collectAmount ? Number(t.collectAmount) : null, safeNote(t), TRIP_STATUS[t.status].label];
          }),
        ),
      },
    ]);

  const used = (run?.seatsConfirmed ?? 0) + (run?.seatsHeld ?? 0);
  return (
    <Drawer
      open={!!runId}
      onClose={() => {
        setEditAssign(false);
        onClose();
      }}
      size={mobile ? '100%' : 860}
      title={run ? `${run.route.name} · ${dayjs(run.departAt).format('HH:mm dd DD/MM/YYYY')}` : 'Chuyến xe ghép'}
      extra={
        run && (
          <Space wrap>
            {toPartner && (
              <Button icon={<CopyOutlined />} disabled={!active.length} onClick={() => copy(supplierText(), 'Đã sao chép lệnh gửi nhà xe (khách, SĐT, giá). Dán vào Zalo của nhà xe.')}>
                Chép gửi nhà xe
              </Button>
            )}
            <Button icon={<CopyOutlined />} disabled={!active.length} onClick={() => copy(manifestText(), 'Đã sao chép danh sách khách. Dán vào Zalo của lái xe / nhà xe.')}>
              Chép danh sách
            </Button>
            <Button icon={<FileExcelOutlined style={{ color: '#15803d' }} />} disabled={!active.length} onClick={exportExcel}>
              Excel
            </Button>
            <Button icon={<FileProtectOutlined />} href={`/transport-orders/run/${run.id}`} target="_blank">
              Lệnh vận chuyển
            </Button>
          </Space>
        )
      }
    >
      {isLoading || !run ? (
        <Spin />
      ) : (
        <Flex vertical gap={16}>
          <Descriptions size="small" bordered column={mobile ? 1 : 2}>
            <Descriptions.Item label="Ghế">
              <b>{used}</b>/{run.capacity} · đã xác nhận {run.seatsConfirmed}
              {run.seatsHeld ? ` · giữ chỗ ${run.seatsHeld}` : ''} · còn <b>{run.seatsLeft}</b>
            </Descriptions.Item>
            <Descriptions.Item label="Bán vé">
              <Tag color={RUN_STATUS[run.status].color}>{RUN_STATUS[run.status].label}</Tag>
              {canDispatch && run.status !== 'HUY' && (
                <Button size="small" type="link" loading={busy === 'sale'} onClick={() => call('sale', `/shuttle/runs/${run.id}`, 'PATCH', { status: run.status === 'MO_BAN' ? 'DONG_BAN' : 'MO_BAN' }, run.status === 'MO_BAN' ? 'Đã đóng bán' : 'Đã mở bán')}>
                  {run.status === 'MO_BAN' ? 'Đóng bán' : 'Mở bán lại'}
                </Button>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Xe">
              {run.vehicle ? (
                <>
                  🚐 {run.vehicle.plateNumber}
                  {run.driver ? ` · ${run.driver.fullName} (${run.driver.phone})` : ' · chưa chọn lái xe'}
                  {run.estimatedCost ? <Typography.Text type="secondary"> · chi phí {formatVnd(run.estimatedCost)}đ</Typography.Text> : null}
                </>
              ) : run.partner ? (
                <>
                  🤝 {run.partner.name}
                  {run.partnerPlate ? ` · ${run.partnerPlate}` : ''}
                  {run.partnerDriverName ? ` · ${run.partnerDriverName} ${run.partnerDriverPhone ?? ''}` : ''}
                  {run.partnerPricePerPax != null ? (
                    <Typography.Text type="secondary">
                      {' '}
                      · {formatVnd(run.partnerPricePerPax)}đ/khách × {active.reduce((s, t) => s + t.passengers, 0)} khách = {formatVnd(Number(run.partnerPricePerPax) * active.reduce((s, t) => s + t.passengers, 0))}đ
                    </Typography.Text>
                  ) : run.partnerCost ? (
                    <Typography.Text type="secondary"> · giá thuê cả chuyến {formatVnd(run.partnerCost)}đ</Typography.Text>
                  ) : null}
                </>
              ) : (
                <Typography.Text type="warning">Chưa điều xe · {run.vehicleType.name}</Typography.Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Ghi chú">{[run.note, run.dispatchNote && `Lưu ý lái xe: ${run.dispatchNote}`].filter(Boolean).join(' · ') || '—'}</Descriptions.Item>
          </Descriptions>

          {canDispatch && run.status !== 'HUY' && !editAssign && (
            <Flex gap={8} wrap>
              {!started && (
                <Button type="primary" onClick={startAssign}>
                  {assigned ? 'Đổi xe / nhà xe' : 'Điều xe cả chuyến'}
                </Button>
              )}
              {assigned && !started && (
                <Popconfirm title="Hủy điều xe cả chuyến?" description="Các lượt khách trở về chờ điều." okText="Hủy điều xe" cancelText="Không" onConfirm={() => call('unassign', `/shuttle/runs/${run.id}/unassign`, 'POST', undefined, 'Đã hủy điều xe')}>
                  <Button danger loading={busy === 'unassign'}>
                    Hủy điều xe
                  </Button>
                </Popconfirm>
              )}
              {assigned && !started && (
                <Button loading={busy === 'start'} onClick={() => call('start', `/shuttle/runs/${run.id}/progress`, 'POST', { step: 'DANG_CHAY' }, 'Chuyến bắt đầu chạy')}>
                  Bắt đầu chạy
                </Button>
              )}
              {assigned && !done && active.length > 0 && (
                <Popconfirm title="Hoàn thành cả chuyến?" description="Mọi lượt khách của chuyến chuyển Hoàn thành; booking xong hết chuyến tự Hoàn thành." okText="Hoàn thành" cancelText="Không" onConfirm={() => call('done', `/shuttle/runs/${run.id}/progress`, 'POST', { step: 'HOAN_THANH' }, 'Đã hoàn thành chuyến')}>
                  <Button loading={busy === 'done'}>Hoàn thành chuyến</Button>
                </Popconfirm>
              )}
              {!used && (
                <Popconfirm title="Hủy chuyến này?" okText="Hủy chuyến" cancelText="Không" onConfirm={() => call('cancel', `/shuttle/runs/${run.id}`, 'PATCH', { status: 'HUY' }, 'Đã hủy chuyến')}>
                  <Button danger type="text" loading={busy === 'cancel'}>
                    Hủy chuyến
                  </Button>
                </Popconfirm>
              )}
            </Flex>
          )}

          {editAssign && (
            <Card size="small" title="Điều xe cho cả chuyến">
              <Form form={form} layout="vertical" initialValues={{ mode: 'COMPANY' }}>
                <Form.Item name="mode">
                  <Radio.Group optionType="button" buttonStyle="solid" options={[{ value: 'COMPANY', label: 'Xe công ty' }, { value: 'PARTNER', label: 'Nhà xe đối tác' }]} />
                </Form.Item>
                {mode === 'COMPANY' ? (
                  <Row gutter={12}>
                    <Col xs={24} md={8}>
                      <Form.Item name="vehicleId" label="Xe" rules={[{ required: true, message: 'Chọn xe' }]}>
                        <Select
                          showSearch
                          optionFilterProp="label"
                          options={vehicles.map((v) => ({ value: v.id, label: `${v.plateNumber} · ${v.vehicleType.name}` }))}
                          onChange={(id: number) => {
                            const v = vehicles.find((x) => x.id === id);
                            if (v?.defaultDriver && !form.getFieldValue('driverId')) form.setFieldValue('driverId', v.defaultDriver.id);
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item name="driverId" label="Lái xe">
                        <Select allowClear showSearch optionFilterProp="label" options={driverOptions} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item name="estimatedCost" label="Chi phí dự kiến cả chuyến" tooltip="Xăng, cầu đường, tiền chuyến lái xe… chia cho từng lượt khách theo số khách để tính lợi nhuận">
                        <MoneyInput />
                      </Form.Item>
                    </Col>
                  </Row>
                ) : (
                  <Row gutter={12}>
                    <Col xs={24} md={12}>
                      <Form.Item name="partnerId" label="Nhà xe" rules={[{ required: true, message: 'Chọn nhà xe' }]}>
                        <Select showSearch optionFilterProp="label" options={partnerOptions} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="partnerPricing" label="Tính tiền nhà xe" initialValue="PAX">
                        <Radio.Group optionType="button" options={[{ value: 'PAX', label: 'Theo đầu khách' }, { value: 'RUN', label: 'Cả chuyến' }]} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      {pricing === 'RUN' ? (
                        <Form.Item name="partnerCost" label="Giá thuê cả chuyến (chưa thuế)" tooltip="Chia cho từng lượt khách theo số khách; công nợ nhà xe cộng đủ cả chuyến">
                          <MoneyInput />
                        </Form.Item>
                      ) : (
                        <Form.Item
                          name="partnerPricePerPax"
                          label="Giá mỗi khách (chưa thuế)"
                          tooltip="Tiền trả nhà xe = số khách × giá mỗi khách, tự tính lại khi khách thêm / bớt"
                          extra={perPax ? `${activePax} khách × ${formatVnd(perPax)}đ = ${formatVnd(activePax * Number(perPax))}đ` : undefined}
                          rules={[{ required: true, message: 'Nhập giá mỗi khách' }]}
                        >
                          <MoneyInput />
                        </Form.Item>
                      )}
                    </Col>
                    <Col xs={8}>
                      <Form.Item name="partnerPlate" label="Biển số">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={8}>
                      <Form.Item name="partnerDriverName" label="Tài xế">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={8}>
                      <Form.Item name="partnerDriverPhone" label="SĐT tài xế">
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                )}
                <Form.Item name="dispatchNote" label="Lưu ý cho lái xe / nhà xe">
                  <Input placeholder="VD: đón đúng thứ tự, gọi khách trước 15 phút" />
                </Form.Item>
                <Flex gap={8}>
                  <Button type="primary" loading={busy === 'assign'} onClick={submitAssign}>
                    Lưu điều xe
                  </Button>
                  <Button onClick={() => setEditAssign(false)}>Thôi</Button>
                </Flex>
              </Form>
            </Card>
          )}

          <Typography.Title level={5} style={{ margin: 0 }}>
            Danh sách khách ({active.reduce((s, t) => s + t.passengers, 0)} khách · {active.length} lượt)
          </Typography.Title>
          {!active.length && <Empty description="Chưa có khách đặt chỗ. Nhập khách bằng dịch vụ 'Xe ghép' trong booking." />}
          {groups.map((g) => (
            <div key={g.stop + g.time}>
              <Typography.Text strong>
                📍 {g.time} · {g.stop} ({g.trips.reduce((s, t) => s + t.passengers, 0)} khách)
              </Typography.Text>
              {g.trips.map((t) => {
                const c = contactOf(t);
                return (
                  <Card key={t.id} size="small" style={{ marginTop: 6 }}>
                    <Flex justify="space-between" wrap gap={8}>
                      <div>
                        <b>{c.name}</b> · <a href={`tel:${c.phone}`}>{c.phone}</a> · {paxText(t)}
                        <div style={{ fontSize: 13 }}>
                          Đón: {t.pickupAddress}
                          {t.dropoffAddress ? ` → Trả: ${t.dropoffAddress}` : ''}
                          {t.flightNumber ? ` · ✈ ${t.flightNumber}` : ''}
                          {t.departureFlight ? ` · ✈ ${t.departureFlight}` : ''}
                        </div>
                        {t.notes && <Typography.Text type="secondary" style={{ fontSize: 13 }}>Ghi chú: {t.notes}</Typography.Text>}
                      </div>
                      <Flex vertical align="flex-end" gap={2}>
                        <Link to={`/bookings/${t.booking.id}`}>{t.booking.code}</Link>
                        <Space size={4}>
                          {t.booking.status !== 'XAC_NHAN' && t.booking.status !== 'HOAN_THANH' && <Tag color="gold">Giữ chỗ</Tag>}
                          <Tag color={TRIP_STATUS[t.status].color}>{TRIP_STATUS[t.status].label}</Tag>
                        </Space>
                        {t.booking.balance > 0 && <Typography.Text type="danger" style={{ fontSize: 12 }}>Booking còn nợ {formatVnd(t.booking.balance)}đ</Typography.Text>}
                        {t.collectAmount && <Typography.Text style={{ fontSize: 12 }}>Lái xe thu: {formatVnd(t.collectAmount)}đ</Typography.Text>}
                      </Flex>
                    </Flex>
                  </Card>
                );
              })}
            </div>
          ))}
        </Flex>
      )}
      <SendOrderModal open={sendOpen} text={sendOpen ? (toPartner ? supplierText() : manifestText()) : ''} targets={sendTargets} onClose={() => setSendOpen(false)} />
    </Drawer>
  );
}
