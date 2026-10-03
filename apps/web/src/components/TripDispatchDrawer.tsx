import { CarOutlined, CopyOutlined, RollbackOutlined, ShopOutlined, SwapOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Spin,
  Steps,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { fmtTime, routeText } from '../booking-utils';
import { buildDispatchText, NEXT_ACTION, TRIP_FLOW } from '../dispatch-utils';
import { SERVICE_TYPE, TRIP_STATUS } from '../labels';
import type { DispatchOptions, DispatchTrip, Partner } from '../types';
import { EnumTag, Money, MoneyInput } from './common';

interface Props {
  tripId: number | null;
  onClose: () => void;
}

const conflictText = (c: { code: string; pickupTime: string; endTime: string }[]) =>
  c.map((x) => `${x.code} ${dayjs(x.pickupTime).format('HH:mm')}–${dayjs(x.endTime).format('HH:mm DD/MM')}`).join(', ');

export function TripDispatchDrawer({ tripId, onClose }: Props) {
  const { hasRole } = useAuth();
  const canDispatch = hasRole('ADMIN', 'DIEU_HANH');
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [companyForm] = Form.useForm();
  const [partnerForm] = Form.useForm();
  const [changing, setChanging] = useState(false);
  const [tab, setTab] = useState<'COMPANY' | 'PARTNER'>('COMPANY');
  const [check, setCheck] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: trip, isLoading } = useQuery({
    queryKey: ['/dispatch/trips', tripId],
    queryFn: () => api<DispatchTrip>(`/dispatch/trips/${tripId}`),
    enabled: !!tripId,
  });
  const closed = trip?.status === 'HOAN_THANH' || trip?.status === 'HUY';
  const showAssignForm = canDispatch && !!trip && !closed && (trip.status === 'CHO_DIEU' || changing);

  const { data: options } = useQuery({
    queryKey: ['/dispatch/options', tripId],
    queryFn: () => api<DispatchOptions>(`/dispatch/trips/${tripId}/options`),
    enabled: !!tripId && showAssignForm,
  });
  const { data: partners = [] } = useQuery({ queryKey: ['/partners', {}], queryFn: () => api<Partner[]>('/partners'), enabled: showAssignForm });

  // Mở chuyến khác: đặt lại form
  useEffect(() => {
    setChanging(false);
    setCheck(null);
    companyForm.resetFields();
    partnerForm.resetFields();
  }, [tripId, companyForm, partnerForm]);

  // Đổi xe: điền sẵn phương án đang gán
  useEffect(() => {
    if (!trip || !showAssignForm) return;
    if (trip.partnerId) {
      setTab('PARTNER');
      partnerForm.setFieldsValue({
        partnerId: trip.partnerId,
        partnerPlate: trip.partnerPlate,
        partnerDriverName: trip.partnerDriverName,
        partnerDriverPhone: trip.partnerDriverPhone,
        partnerCost: trip.partnerCost === null ? undefined : Number(trip.partnerCost),
        dispatchNote: trip.dispatchNote,
      });
    } else {
      setTab('COMPANY');
      companyForm.setFieldsValue({ vehicleId: trip.vehicleId ?? undefined, driverId: trip.driverId ?? undefined, dispatchNote: trip.dispatchNote });
      if (trip.vehicleId) runCheck(trip.vehicleId, trip.driverId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, showAssignForm]);

  function refresh(updated?: DispatchTrip) {
    if (updated) queryClient.setQueryData(['/dispatch/trips', updated.id], updated);
    queryClient.invalidateQueries({ queryKey: ['/dispatch'] });
    queryClient.invalidateQueries({ queryKey: ['/dispatch/options'] });
    queryClient.invalidateQueries({ queryKey: ['/bookings'] });
    queryClient.invalidateQueries({ queryKey: ['/reports/summary'] });
  }

  async function runCheck(vehicleId?: number, driverId?: number | null) {
    if (!vehicleId || !tripId) return setCheck(null);
    try {
      setCheck(await api(`/dispatch/trips/${tripId}/check`, { method: 'POST', body: { vehicleId, driverId: driverId ?? null } }));
    } catch {
      setCheck(null);
    }
  }

  async function assign(body: Record<string, unknown>, force = false) {
    setBusy(true);
    try {
      const updated = await api<DispatchTrip>(`/dispatch/trips/${tripId}/assign`, { method: 'POST', body: { ...body, force } });
      message.success(body.mode === 'COMPANY' ? 'Đã gán xe' : 'Đã giao nhà xe đối tác');
      setChanging(false);
      refresh(updated);
    } catch (e) {
      if (e instanceof ApiError && e.data?.needConfirm) {
        modal.confirm({
          title: 'Có cảnh báo, vẫn gán xe?',
          width: 520,
          content: (
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {e.data.warnings?.map((w) => <li key={w}>{w}</li>)}
            </ul>
          ),
          okText: 'Vẫn gán',
          cancelText: 'Xem lại',
          onOk: () => assign(body, true),
        });
      } else {
        message.error((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function post(path: string, body?: unknown, okMsg?: string) {
    setBusy(true);
    try {
      const updated = await api<DispatchTrip>(`/dispatch/trips/${tripId}/${path}`, { method: 'POST', body });
      if (okMsg) message.success(okMsg);
      refresh(updated);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyOrder() {
    if (!trip) return;
    try {
      await navigator.clipboard.writeText(buildDispatchText(trip));
      message.success('Đã sao chép lệnh điều xe. Dán (Ctrl+V) vào Zalo của tài xế / nhà xe.');
    } catch {
      message.error('Trình duyệt chặn sao chép');
    }
  }

  const vehicleOptions = (options?.vehicles ?? []).map((v) => ({
    value: v.id,
    label: `${v.plateNumber} · ${v.vehicleType.name}`,
    data: v,
  }));
  const driverOptions = (options?.drivers ?? []).map((d) => ({ value: d.id, label: d.fullName, data: d }));
  const matchingPartners = partners
    .filter((p) => p.isActive)
    .sort((a, b) => Number(b.vehicleTypeCodes.includes(trip?.vehicleType.code ?? '')) - Number(a.vehicleTypeCodes.includes(trip?.vehicleType.code ?? '')));
  const partnerCost = Form.useWatch('partnerCost', partnerForm);
  const amount = Number(trip?.amount ?? 0);

  const companyTab = (
    <Form
      form={companyForm}
      name="dispatch_company"
      layout="vertical"
      onValuesChange={(changed, all) => {
        if ('vehicleId' in changed) {
          const v = options?.vehicles.find((x) => x.id === changed.vehicleId);
          // Chọn xe: tự điền lái xe mặc định của xe nếu chưa chọn lái xe
          if (v?.defaultDriver && !all.driverId) companyForm.setFieldsValue({ driverId: v.defaultDriver.id });
        }
        const v = companyForm.getFieldsValue();
        runCheck(v.vehicleId, v.driverId);
      }}
      onFinish={(v) => assign({ mode: 'COMPANY', vehicleId: v.vehicleId, driverId: v.driverId ?? null, dispatchNote: v.dispatchNote || null })}
    >
      <Form.Item name="vehicleId" label="Xe công ty" rules={[{ required: true, message: 'Chọn xe' }]}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder={options ? 'Chọn xe' : 'Đang tải...'}
          options={vehicleOptions}
          notFoundContent="Không có xe công ty đủ chỗ"
          optionRender={(o) => {
            const v = o.data.data;
            return (
              <Flex justify="space-between" gap={8}>
                <span>
                  <b>{v.plateNumber}</b> · {v.vehicleType.name}
                  {v.defaultDriver && <Typography.Text type="secondary"> · {v.defaultDriver.fullName}</Typography.Text>}
                </span>
                <span>
                  {v.exactType && <Tag color="blue">Đúng loại</Tag>}
                  {v.status !== 'SAN_SANG' && <Tag color="orange">{v.status === 'BAO_DUONG' ? 'Bảo dưỡng' : 'Ngừng'}</Tag>}
                  {v.conflicts.length ? <Tag color="red">Trùng: {conflictText(v.conflicts)}</Tag> : <Tag color="green">Rảnh</Tag>}
                </span>
              </Flex>
            );
          }}
        />
      </Form.Item>
      <Form.Item name="driverId" label="Lái xe">
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Chọn lái xe"
          options={driverOptions}
          optionRender={(o) => {
            const d = o.data.data;
            return (
              <Flex justify="space-between" gap={8}>
                <span>
                  {d.fullName} <Typography.Text type="secondary">· {d.phone} · bằng {d.licenseClass ?? '?'}</Typography.Text>
                </span>
                <span>
                  {d.status !== 'DANG_LAM' && <Tag color="orange">Nghỉ phép</Tag>}
                  {d.conflicts.length ? <Tag color="red">Trùng lịch</Tag> : <Tag color="green">Rảnh</Tag>}
                </span>
              </Flex>
            );
          }}
        />
      </Form.Item>
      {check?.errors.map((e) => <Alert key={e} type="error" showIcon title={e} style={{ marginBottom: 8 }} />)}
      {check?.warnings.map((w) => <Alert key={w} type="warning" showIcon title={w} style={{ marginBottom: 8 }} />)}
      {check && !check.errors.length && !check.warnings.length && <Alert type="success" showIcon title="Xe và lái xe phù hợp, không trùng lịch" style={{ marginBottom: 8 }} />}
      <Form.Item name="dispatchNote" label="Ghi chú cho lái xe">
        <Input.TextArea rows={2} placeholder="Ví dụ: có mặt trước 15 phút, mang bảng tên đón khách" />
      </Form.Item>
      <Button type="primary" htmlType="submit" icon={<CarOutlined />} loading={busy} disabled={!!check?.errors.length} block>
        Gán xe công ty
      </Button>
    </Form>
  );

  const partnerTab = (
    <Form
      form={partnerForm}
      name="dispatch_partner"
      layout="vertical"
      onFinish={(v) =>
        assign({
          mode: 'PARTNER',
          partnerId: v.partnerId,
          partnerPlate: v.partnerPlate || null,
          partnerDriverName: v.partnerDriverName || null,
          partnerDriverPhone: v.partnerDriverPhone || null,
          partnerCost: v.partnerCost,
          dispatchNote: v.dispatchNote || null,
        })
      }
    >
      <Form.Item name="partnerId" label="Nhà xe đối tác" rules={[{ required: true, message: 'Chọn nhà xe' }]}>
        <Select
          showSearch
          optionFilterProp="label"
          options={matchingPartners.map((p) => ({ value: p.id, label: p.name, data: p }))}
          optionRender={(o) => {
            const p = o.data.data as Partner;
            return (
              <Flex justify="space-between">
                <span>
                  {p.name}
                  {p.phone && <Typography.Text type="secondary"> · {p.phone}</Typography.Text>}
                </span>
                {p.vehicleTypeCodes.includes(trip?.vehicleType.code ?? '') && <Tag color="blue">Có {trip?.vehicleType.name}</Tag>}
              </Flex>
            );
          }}
          notFoundContent={<Link to="/partners">Chưa có nhà xe đối tác, thêm tại đây</Link>}
        />
      </Form.Item>
      <Flex gap={12}>
        <Form.Item name="partnerPlate" label="Biển số xe" style={{ flex: 1 }}>
          <Input placeholder="51F-123.45" />
        </Form.Item>
        <Form.Item name="partnerCost" label="Giá thuê đối tác" rules={[{ required: true, message: 'Nhập giá thuê' }]} style={{ flex: 1 }}>
          <MoneyInput />
        </Form.Item>
      </Flex>
      <Flex gap={12}>
        <Form.Item name="partnerDriverName" label="Tài xế" style={{ flex: 1 }}>
          <Input />
        </Form.Item>
        <Form.Item name="partnerDriverPhone" label="SĐT tài xế" style={{ flex: 1 }}>
          <Input />
        </Form.Item>
      </Flex>
      {partnerCost !== undefined && partnerCost !== null && (
        <Alert
          type={amount - partnerCost >= 0 ? 'success' : 'error'}
          showIcon
          style={{ marginBottom: 12 }}
          title={`Giá bán ${amount.toLocaleString('vi-VN')}đ − giá thuê ${Number(partnerCost).toLocaleString('vi-VN')}đ = lãi ${(amount - partnerCost).toLocaleString('vi-VN')}đ`}
        />
      )}
      <Form.Item name="dispatchNote" label="Ghi chú cho nhà xe">
        <Input.TextArea rows={2} />
      </Form.Item>
      <Button type="primary" htmlType="submit" icon={<ShopOutlined />} loading={busy} block>
        Giao nhà xe đối tác
      </Button>
    </Form>
  );

  const next = trip ? NEXT_ACTION[trip.status] : undefined;
  const flowIndex = trip ? TRIP_FLOW.indexOf(trip.status) : -1;

  return (
    <Drawer
      open={!!tripId}
      onClose={onClose}
      size={620}
      title={
        trip ? (
          <Space wrap>
            <span>Chuyến của</span>
            <Link to={`/bookings/${trip.bookingId}`}>{trip.booking.code}</Link>
            <EnumTag labels={TRIP_STATUS} value={trip.status} />
          </Space>
        ) : (
          'Chuyến'
        )
      }
      extra={trip && trip.status !== 'CHO_DIEU' && <Button icon={<CopyOutlined />} onClick={copyOrder}>Sao chép lệnh điều xe</Button>}
    >
      {isLoading || !trip ? (
        <Flex justify="center" style={{ padding: 48 }}>
          <Spin />
        </Flex>
      ) : (
        <>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Dịch vụ">{SERVICE_TYPE[trip.serviceType].label}</Descriptions.Item>
            <Descriptions.Item label="Thời gian">
              <b>{fmtTime(trip.pickupTime)}</b> → {dayjs(trip.endTime).format('HH:mm DD/MM')}
            </Descriptions.Item>
            <Descriptions.Item label="Hành trình">
              {routeText(trip)}
              {trip.flightNumber && <Tag style={{ marginLeft: 6 }}>✈ {trip.flightNumber}</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Khách">
              {trip.booking.customer?.name ? `${trip.booking.customer.name} · ` : ''}
              {trip.booking.contactName} – {trip.booking.contactPhone}
            </Descriptions.Item>
            <Descriptions.Item label="Yêu cầu xe">
              <b>{trip.vehicleType.name}</b> · {trip.passengers} khách{trip.days > 1 ? ` · ${trip.days} ngày` : ''}
            </Descriptions.Item>
            {trip.itinerary && <Descriptions.Item label="Lịch trình"><div style={{ whiteSpace: 'pre-wrap' }}>{trip.itinerary}</div></Descriptions.Item>}
            {trip.notes && <Descriptions.Item label="Ghi chú">{trip.notes}</Descriptions.Item>}
            <Descriptions.Item label="Giá bán / chi phí">
              <Money value={trip.amount} strong /> / {trip.estimatedCost === null ? <Typography.Text type="warning">chưa có chi phí</Typography.Text> : <Money value={trip.estimatedCost} />}
            </Descriptions.Item>
          </Descriptions>

          {trip.status !== 'CHO_DIEU' && (trip.vehicle || trip.partner) && (
            <Card size="small" style={{ marginTop: 16 }} title={trip.vehicle ? 'Xe công ty' : 'Nhà xe đối tác'}>
              {trip.vehicle ? (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Xe">
                    <b>{trip.vehicle.plateNumber}</b> ({trip.vehicle.vehicleType.name})
                  </Descriptions.Item>
                  <Descriptions.Item label="Lái xe">{trip.driver ? `${trip.driver.fullName} – ${trip.driver.phone}` : <Typography.Text type="warning">Chưa có</Typography.Text>}</Descriptions.Item>
                </Descriptions>
              ) : (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Nhà xe">
                    <b>{trip.partner!.name}</b> {trip.partner!.phone && `– ${trip.partner!.phone}`}
                  </Descriptions.Item>
                  <Descriptions.Item label="Xe / tài xế">{[trip.partnerPlate, trip.partnerDriverName, trip.partnerDriverPhone].filter(Boolean).join(' · ') || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Giá thuê">
                    <Money value={trip.partnerCost} /> · lãi <Money value={amount - Number(trip.partnerCost ?? 0)} strong />
                  </Descriptions.Item>
                </Descriptions>
              )}
              {trip.dispatchNote && <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>Ghi chú: {trip.dispatchNote}</Typography.Paragraph>}
              {canDispatch && !closed && !changing && (
                <Space wrap style={{ marginTop: 12 }}>
                  <Button icon={<SwapOutlined />} onClick={() => setChanging(true)}>Đổi xe</Button>
                  <Popconfirm title="Hủy điều xe, đưa chuyến về chờ điều?" okText="Hủy điều xe" cancelText="Không" onConfirm={() => post('unassign', undefined, 'Đã hủy điều xe')}>
                    <Button danger icon={<RollbackOutlined />}>Hủy điều xe</Button>
                  </Popconfirm>
                </Space>
              )}
            </Card>
          )}

          {flowIndex >= 0 && (
            <>
              <Divider titlePlacement="start">Tiến trình chuyến</Divider>
              <Steps
                size="small"
                orientation="vertical"
                current={flowIndex}
                items={TRIP_FLOW.map((s) => ({ title: TRIP_STATUS[s].label }))}
              />
              {canDispatch && next && !changing && (
                <Flex vertical gap={4}>
                  <Button type="primary" ghost loading={busy} onClick={() => post('status', { status: next.status }, `Đã cập nhật: ${next.label}`)}>
                    Cập nhật: {next.label}
                  </Button>
                  {trip.vehicle && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Khi có app lái xe (Bước 5), lái xe sẽ tự cập nhật các bước này.
                    </Typography.Text>
                  )}
                </Flex>
              )}
            </>
          )}

          {showAssignForm && (
            <>
              <Divider titlePlacement="start">{trip.status === 'CHO_DIEU' ? 'Điều xe' : 'Đổi xe'}</Divider>
              {trip.booking.status !== 'XAC_NHAN' ? (
                <Alert type="info" showIcon title="Booking chưa được khách xác nhận nên chưa điều xe được." />
              ) : (
                <Tabs
                  activeKey={tab}
                  onChange={(k) => setTab(k as 'COMPANY' | 'PARTNER')}
                  items={[
                    { key: 'COMPANY', label: <span><CarOutlined /> Xe công ty</span>, children: companyTab },
                    { key: 'PARTNER', label: <span><ShopOutlined /> Xe đối tác</span>, children: partnerTab },
                  ]}
                />
              )}
              {changing && (
                <Button type="link" onClick={() => setChanging(false)} style={{ paddingLeft: 0, marginTop: 8 }}>
                  Thôi, giữ xe hiện tại
                </Button>
              )}
            </>
          )}

          <Divider titlePlacement="start">Nhật ký</Divider>
          {trip.events?.length ? (
            <Timeline
              items={trip.events.map((e) => ({
                content: (
                  <>
                    <b>{TRIP_STATUS[e.status].label}</b>
                    <Typography.Text type="secondary">
                      {' '}
                      · {dayjs(e.createdAt).format('HH:mm DD/MM/YYYY')}
                      {e.user && ` · ${e.user.fullName}`}
                    </Typography.Text>
                    {e.note && <div>{e.note}</div>}
                  </>
                ),
              }))}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có thay đổi" />
          )}
        </>
      )}
    </Drawer>
  );
}
