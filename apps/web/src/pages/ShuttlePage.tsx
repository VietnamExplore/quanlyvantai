import { CopyOutlined, FileExcelOutlined, LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, DatePicker, Descriptions, Drawer, Empty, Flex, Form, Grid, Input, InputNumber, Modal, Popconfirm, Progress, Radio, Row, Select, Space, Spin, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { useCopyText } from '../clipboard';
import { MoneyInput, formatVnd, useCompanyDriverOptions, usePartnerOptions } from '../components/common';
import { downloadExcel } from '../excel';
import { TRIP_STATUS } from '../labels';
import { RUN_PROGRESS, RUN_STATUS, type ShuttleRoute, type ShuttleRun, type ShuttleRunDetail, type ShuttleRunTrip } from '../shuttle-types';
import type { Vehicle } from '../types';

const hm = (d: string) => dayjs(d).format('HH:mm');
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
  const byRoute = useMemo(() => {
    const m = new Map<number, { name: string; runs: ShuttleRun[] }>();
    for (const r of runs) {
      const g = m.get(r.routeId) ?? { name: r.route.name, runs: [] };
      g.runs.push(r);
      m.set(r.routeId, g);
    }
    return [...m.values()];
  }, [runs]);
  const total = runs.filter((r) => r.status !== 'HUY').reduce((s, r) => ({ sold: s.sold + r.seatsConfirmed + r.seatsHeld, cap: s.cap + r.capacity }), { sold: 0, cap: 0 });

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

      {isFetching && !runs.length ? (
        <Flex justify="center" style={{ padding: 48 }}>
          <Spin />
        </Flex>
      ) : !runs.length ? (
        <Card>
          <Empty description={<>Không có chuyến xe ghép ngày {date.format('DD/MM/YYYY')}. Khai báo tuyến và giờ chạy ở <Link to="/shuttle-routes">Danh mục → Tuyến xe ghép</Link>.</>} />
        </Card>
      ) : (
        byRoute.map((g) => (
          <Card key={g.name} size="small" title={g.name}>
            <Row gutter={[12, 12]}>
              {g.runs.map((r) => (
                <Col key={r.id} xs={24} sm={12} lg={8} xl={6}>
                  <RunCard run={r} onClick={() => setParam('run', String(r.id))} />
                </Col>
              ))}
            </Row>
          </Card>
        ))
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

function RunCard({ run, onClick }: { run: ShuttleRun; onClick: () => void }) {
  const used = run.seatsConfirmed + run.seatsHeld;
  const assigned = run.vehicle ? `${run.vehicle.plateNumber}${run.driver ? ` · ${run.driver.fullName}` : ''}` : run.partner ? `${run.partner.name}${run.partnerPlate ? ` · ${run.partnerPlate}` : ''}` : null;
  return (
    <Card size="small" hoverable onClick={onClick} style={{ opacity: run.status === 'HUY' ? 0.5 : 1, borderColor: run.status === 'DONG_BAN' ? '#f0b05a' : undefined }}>
      <Flex justify="space-between" align="baseline">
        <Typography.Title level={3} style={{ margin: 0 }}>
          {hm(run.departAt)}
        </Typography.Title>
        <Space size={4} wrap style={{ justifyContent: 'flex-end' }}>
          {run.status !== 'MO_BAN' && <Tag color={RUN_STATUS[run.status].color}>{RUN_STATUS[run.status].label}</Tag>}
          {run.tripStatus && run.tripStatus !== 'DA_DIEU' && <Tag color={RUN_PROGRESS[run.tripStatus].color}>{RUN_PROGRESS[run.tripStatus].label}</Tag>}
          {!run.scheduleId && <Tag>Chuyến thêm</Tag>}
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
  const driverOptions = useCompanyDriverOptions();
  const partnerOptions = usePartnerOptions();
  const { data: vehicles = [] } = useQuery({ queryKey: ['/vehicles', { ownership: 'CONG_TY' }], queryFn: () => api<Vehicle[]>('/vehicles', { query: { ownership: 'CONG_TY' } }), enabled: !!runId && canDispatch });
  const { data: run, isLoading } = useQuery({ queryKey: ['/shuttle/runs', runId], queryFn: () => api<ShuttleRunDetail>(`/shuttle/runs/${runId}`), enabled: !!runId });

  const assigned = !!(run?.vehicle || run?.partner);
  const active = (run?.trips ?? []).filter((t) => t.status !== 'HUY' && t.booking.status !== 'HUY');
  const started = active.some((t) => ['DANG_DEN_DON', 'DA_DON_KHACH', 'HOAN_THANH'].includes(t.status));
  const done = active.length > 0 && active.every((t) => t.status === 'HOAN_THANH');

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

  const startAssign = () => {
    form.setFieldsValue(
      run?.partner
        ? { mode: 'PARTNER', partnerId: run.partner.id, partnerCost: run.partnerCost ? Number(run.partnerCost) : null, partnerPlate: run.partnerPlate, partnerDriverName: run.partnerDriverName, partnerDriverPhone: run.partnerDriverPhone, dispatchNote: run.dispatchNote }
        : { mode: 'COMPANY', vehicleId: run?.vehicle?.id, driverId: run?.driver?.id, estimatedCost: run?.estimatedCost ? Number(run.estimatedCost) : null, dispatchNote: run?.dispatchNote },
    );
    setEditAssign(true);
  };

  const submitAssign = async () => {
    const v = await form.validateFields();
    const ok = await call('assign', `/shuttle/runs/${runId}/assign`, 'POST', v, 'Đã điều xe cho cả chuyến');
    if (ok) setEditAssign(false);
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
      run.dispatchNote ? `Lưu ý: ${run.dispatchNote}` : '',
    ].filter(Boolean);
    for (const g of groups) {
      lines.push('', `📍 ${g.time} – ${g.stop}`);
      g.trips.forEach((t, i) => {
        const c = contactOf(t);
        lines.push(
          `${i + 1}. ${c.name} – ${c.phone} · ${paxText(t)}`,
          `   Đón: ${t.pickupAddress}${t.dropoffAddress ? ` → Trả: ${t.dropoffAddress}` : ''}${t.flightNumber ? ` · ✈ ${t.flightNumber}` : ''}${t.departureFlight ? ` · ✈ ${t.departureFlight}` : ''}`,
          ...(t.collectAmount ? [`   Thu khách: ${formatVnd(t.collectAmount)}đ`] : []),
          ...(t.notes ? [`   Ghi chú: ${t.notes}`] : []),
        );
      });
    }
    return lines.join('\n');
  };

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
            return [hm(t.pickupTime), g.stop, t.pickupAddress, t.shuttleDropoffStop?.name ?? t.dropoffAddress, t.booking.code, c.name, c.phone, t.passengers, t.childCount, [t.flightNumber, t.departureFlight].filter(Boolean).join(' / '), t.collectAmount ? Number(t.collectAmount) : null, t.notes, TRIP_STATUS[t.status].label];
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
            <Button icon={<CopyOutlined />} disabled={!active.length} onClick={() => copy(manifestText(), 'Đã sao chép danh sách khách. Dán vào Zalo của lái xe / nhà xe.')}>
              Chép danh sách
            </Button>
            <Button icon={<FileExcelOutlined style={{ color: '#15803d' }} />} disabled={!active.length} onClick={exportExcel}>
              Excel
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
                  {run.partnerCost ? <Typography.Text type="secondary"> · giá thuê cả chuyến {formatVnd(run.partnerCost)}đ</Typography.Text> : null}
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
                      <Form.Item name="partnerCost" label="Giá thuê cả chuyến (chưa thuế)" tooltip="Chia cho từng lượt khách theo số khách; công nợ nhà xe cộng đủ cả chuyến">
                        <MoneyInput />
                      </Form.Item>
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
    </Drawer>
  );
}
