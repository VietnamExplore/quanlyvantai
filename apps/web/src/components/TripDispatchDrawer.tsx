import { AimOutlined, CarOutlined, CopyOutlined, FileProtectOutlined, RollbackOutlined, ShopOutlined, SwapOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SignoffBlock, TripIncidentList } from './FieldParts';
import { SendOrderModal, type SendTarget } from './SendOrderModal';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
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
import { TripOdometer } from './TripOdometer';
import { PARTNER_ISSUE, PartnerCostAdjust } from './PartnerCostAdjust';
import { ExtraStatusTag, PartnerExtraReviewModal } from './PartnerExtraReview';
import { useCopyText } from '../clipboard';
import { buildDispatchText, NEXT_ACTION, TRIP_FLOW } from '../dispatch-utils';
import { TRIP_STATUS } from '../labels';
import type { DispatchOptions, DispatchTrip, Partner } from '../types';
import { EnumTag, Money, MoneyInput } from './common';
import { TripCostsSection } from './finance';
import { QuickSelect } from './QuickCreate';

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
  const copy = useCopyText();

  /** Văn phòng đã nhận lại tiền lái xe thu hộ khách */
  async function settleCollect(settled: boolean) {
    if (!trip) return;
    try {
      await api(`/trips/${trip.id}/collect-settle`, { method: 'POST', body: { settled } });
      message.success(settled ? 'Đã ghi nhận văn phòng nhận tiền' : 'Đã hủy xác nhận');
      queryClient.invalidateQueries({ queryKey: ['/dispatch'] });
      queryClient.invalidateQueries({ queryKey: ['/bookings'] });
    } catch (e) {
      message.error((e as Error).message);
    }
  }
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
        partnerInvoice: !!trip.partnerInvoice,
        partnerInvoiceNote: trip.partnerInvoiceNote,
        partnerVatPercent: Number(trip.partnerVatPercent ?? 0),
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
      // Tự sao chép lệnh điều xe + mở hộp gửi Zalo (nhóm lái xe, lái xe / nhà xe)
      setSendTrip(updated);
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

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [sendTrip, setSendTrip] = useState<DispatchTrip | null>(null);
  const sendTargets = (t: DispatchTrip): SendTarget[] =>
    t.driver
      ? [{ label: 'lái xe', name: t.driver.fullName, phone: t.driver.phone }]
      : t.partner
        ? [
            { label: 'nhà xe', name: t.partner.name, phone: t.partner.phone },
            ...(t.partnerDriverName || t.partnerDriverPhone ? [{ label: 'tài xế nhà xe', name: t.partnerDriverName ?? '', phone: t.partnerDriverPhone }] : []),
          ]
        : [];
  const [reviewOpen, setReviewOpen] = useState(false);

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
    await copy(buildDispatchText(trip), 'Đã sao chép lệnh điều xe. Dán vào Zalo của tài xế / nhà xe.');
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
        <QuickSelect
          entity="vehicle"
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
        <QuickSelect
          entity="driver"
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
          partnerInvoice: !!v.partnerInvoice,
          partnerInvoiceNote: v.partnerInvoice ? v.partnerInvoiceNote || null : null,
          partnerVatPercent: v.partnerInvoice ? Number(v.partnerVatPercent ?? 0) : 0,
          dispatchNote: v.dispatchNote || null,
        })
      }
      initialValues={{ partnerInvoice: !!trip?.partnerInvoice, partnerInvoiceNote: trip?.partnerInvoiceNote, partnerVatPercent: Number(trip?.partnerVatPercent ?? 0) }}
    >
      <Form.Item name="partnerId" label="Nhà xe đối tác" rules={[{ required: true, message: 'Chọn nhà xe' }]}>
        <QuickSelect
          entity="partner"
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
        <Form.Item name="partnerCost" label="Giá thuê (chưa thuế)" rules={[{ required: true, message: 'Nhập giá thuê' }]} style={{ flex: 1 }}>
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
      <Form.Item name="partnerInvoice" valuePropName="checked" style={{ marginBottom: 8 }}>
        <Checkbox>🧾 Yêu cầu nhà xe xuất hóa đơn cho công ty</Checkbox>
      </Form.Item>
      <Form.Item noStyle dependencies={['partnerInvoice']}>
        {({ getFieldValue }) =>
          getFieldValue('partnerInvoice') ? (
            <>
            <Form.Item name="partnerVatPercent" label="Thuế suất hóa đơn nhà xe" extra="Giá thuê nhập là giá chưa thuế; công nợ nhà xe = giá thuê + thuế">
              <Select options={[0, 5, 8, 10].map((x) => ({ value: x, label: `${x}%` }))} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item
              name="partnerInvoiceNote"
              label="Ghi chú xuất hóa đơn"
              extra="Nhà xe thấy kèm tên công ty, MST, địa chỉ và email nhận hóa đơn (sửa ở Thông tin công ty)"
            >
              <Input placeholder="VD: nội dung 'Cước vận chuyển khách'" />
            </Form.Item>
            </>
          ) : null
        }
      </Form.Item>
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
      extra={
        trip &&
        trip.status !== 'CHO_DIEU' && (
          <Space wrap>
            <Button icon={<CopyOutlined />} onClick={copyOrder}>
              Sao chép lệnh điều xe
            </Button>
            <Button icon={<AimOutlined />} href={`/gps?view=track&trip=${trip.id}`}>
              Lộ trình GPS
            </Button>
            {/* Lệnh vận chuyển theo mẫu TT 36/2024 (kèm QR hợp đồng điện tử nếu booking đã lập hợp đồng) */}
            <Button icon={<FileProtectOutlined />} href={`/transport-orders/trip/${trip.id}`} target="_blank">
              Lệnh vận chuyển
            </Button>
          </Space>
        )
      }
    >
      {isLoading || !trip ? (
        <Flex justify="center" style={{ padding: 48 }}>
          <Spin />
        </Flex>
      ) : (
        <>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Dịch vụ">{trip.service?.name ?? trip.serviceType}</Descriptions.Item>
            <Descriptions.Item label="Thời gian">
              <b>{fmtTime(trip.pickupTime)}</b> → {dayjs(trip.endTime).format('HH:mm DD/MM')}
            </Descriptions.Item>
            <Descriptions.Item label="Hành trình">
              {routeText(trip)}
              {trip.flightNumber && <Tag color="blue" style={{ marginLeft: 6 }}>✈ Đón {trip.flightNumber}</Tag>}
              {trip.departureFlight && <Tag color="purple" style={{ marginLeft: 6 }}>✈ Tiễn {trip.departureFlight}</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Khách">
              {trip.booking.customer?.name ? `${trip.booking.customer.name} · ` : ''}
              {trip.booking.contactName} – {trip.booking.contactPhone}
            </Descriptions.Item>
            {(trip.booking.leaderName || trip.booking.leaderPhone) && (
              <Descriptions.Item label={trip.booking.leaderRole === "HDV" ? "Hướng dẫn viên" : "Trưởng đoàn"}>
                <b>{trip.booking.leaderName}</b>
                {trip.booking.leaderPhone && ` – ${trip.booking.leaderPhone}`}
              </Descriptions.Item>
            )}
            {trip.booking.passengers?.[0] && (
              <Descriptions.Item label="Khách đi xe">
                {trip.booking.passengers[0].fullName}
                {trip.booking.passengers[0].phone && ` – ${trip.booking.passengers[0].phone}`}
                <Typography.Text type="secondary"> (hành khách đầu tiên, dùng trong lệnh điều xe)</Typography.Text>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Yêu cầu xe">
              <b>{trip.vehicleType.name}</b> · {trip.passengers} khách{trip.days > 1 ? ` · ${trip.days} ngày` : ''}
            </Descriptions.Item>
            {trip.itinerary && <Descriptions.Item label="Lịch trình"><div style={{ whiteSpace: 'pre-wrap' }}>{trip.itinerary}</div></Descriptions.Item>}
            {trip.notes && <Descriptions.Item label="Ghi chú">{trip.notes}</Descriptions.Item>}
            {!!trip.collectAmount && (
              <Descriptions.Item label="Nhờ lái xe thu">
                <Space direction="vertical" size={4}>
                  <span>
                    <b>{Number(trip.collectAmount).toLocaleString('vi-VN')} đ</b>
                    {trip.collectNote && <Typography.Text type="secondary"> · {trip.collectNote}</Typography.Text>}
                  </span>
                  {!trip.collectedAt ? (
                    <Tag color="orange">Lái xe chưa thu</Tag>
                  ) : (
                    <Space wrap>
                      <Tag color="gold">
                        Lái xe đã thu {Number(trip.collectedAmount).toLocaleString('vi-VN')} đ ({trip.collectMethod === 'CHUYEN_KHOAN' ? 'chuyển khoản' : 'tiền mặt'}) lúc {dayjs(trip.collectedAt).format('HH:mm DD/MM')}
                      </Tag>
                      {trip.collectSettledAt ? (
                        <Tag color="green">Văn phòng đã nhận tiền {dayjs(trip.collectSettledAt).format('DD/MM')}</Tag>
                      ) : (
                        <Popconfirm title="Xác nhận văn phòng đã nhận lại tiền từ lái xe?" okText="Đã nhận" cancelText="Không" onConfirm={() => settleCollect(true)}>
                          <Button size="small" type="primary" ghost>
                            Đã nhận tiền từ lái xe
                          </Button>
                        </Popconfirm>
                      )}
                    </Space>
                  )}
                </Space>
              </Descriptions.Item>
            )}
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
                  {trip.partnerInvoice && (
                    <Descriptions.Item label="Hóa đơn">
                      <Tag color="purple">🧾 Nhà xe xuất hóa đơn · VAT {Number(trip.partnerVatPercent ?? 0)}%</Tag>
                      {trip.partnerInvoiceNote}
                    </Descriptions.Item>
                  )}
                  <Descriptions.Item label="Giá thuê">
                    <Money value={trip.partnerCost} /> · lãi <Money value={amount - Number(trip.partnerCost ?? 0)} strong />
                    {canDispatch && (
                      <Button size="small" type="link" onClick={() => setAdjustOpen(true)}>
                        Điều chỉnh giá nhà xe
                      </Button>
                    )}
                  </Descriptions.Item>
                  {(Number(trip.partnerExtraUp ?? 0) > 0 || Number(trip.partnerExtraDown ?? 0) > 0) && (
                    <Descriptions.Item label="Phát sinh">
                      {Number(trip.partnerExtraUp ?? 0) > 0 && <Tag color="orange">+{Number(trip.partnerExtraUp).toLocaleString('vi-VN')}đ</Tag>}
                      {Number(trip.partnerExtraDown ?? 0) > 0 && <Tag color="green">−{Number(trip.partnerExtraDown).toLocaleString('vi-VN')}đ</Tag>}
                      <ExtraStatusTag status={trip.partnerExtraStatus} note={trip.partnerExtraReviewNote} />
                      {trip.partnerExtraNote}
                      {trip.partnerExtraStatus === 'CHO_DUYET' && <div style={{ fontSize: 12, color: '#b45309' }}>Chưa tính công nợ cho đến khi được duyệt</div>}
                      {trip.partnerExtraReviewedBy && trip.partnerExtraStatus !== 'CHO_DUYET' && (
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          {trip.partnerExtraReviewedBy}
                          {trip.partnerExtraReviewNote ? ` · ${trip.partnerExtraReviewNote}` : ''}
                        </div>
                      )}
                      {canDispatch && trip.partnerExtraStatus && (
                        <Button size="small" type={trip.partnerExtraStatus === 'CHO_DUYET' ? 'primary' : 'link'} style={{ marginTop: 4 }} onClick={() => setReviewOpen(true)}>
                          {trip.partnerExtraStatus === 'CHO_DUYET' ? 'Duyệt phát sinh' : 'Duyệt lại'}
                        </Button>
                      )}
                    </Descriptions.Item>
                  )}
                  {(trip.partnerIssue || trip.partnerAdjustNote) && (
                    <Descriptions.Item label="Điều chỉnh">
                      {trip.partnerIssue && PARTNER_ISSUE[trip.partnerIssue] && <Tag color={PARTNER_ISSUE[trip.partnerIssue].color}>{PARTNER_ISSUE[trip.partnerIssue].label}</Tag>}
                      {trip.partnerAdjustNote}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              )}
              {trip.partnerId && (
                <PartnerCostAdjust
                  open={adjustOpen}
                  partnerName={trip.partner?.name ?? ''}
                  currentCost={Number(trip.partnerCost ?? 0)}
                  invoice={!!trip.partnerInvoice}
                  vatPercent={Number(trip.partnerVatPercent ?? 0)}
                  extraUp={Number(trip.partnerExtraUp ?? 0)}
                  extraDown={Number(trip.partnerExtraDown ?? 0)}
                  busy={busy}
                  onCancel={() => setAdjustOpen(false)}
                  onSubmit={(v) => post('partner-cost', v, 'Đã điều chỉnh giá nhà xe').then(() => setAdjustOpen(false))}
                />
              )}
              {trip.partnerId && trip.partnerExtraStatus && (
                <PartnerExtraReviewModal
                  open={reviewOpen}
                  title={`Duyệt phát sinh · ${trip.partner?.name ?? ''}`}
                  partnerCost={Number(trip.partnerCost ?? 0)}
                  extraUp={Number(trip.partnerExtraUp ?? 0)}
                  extraDown={Number(trip.partnerExtraDown ?? 0)}
                  extraNote={trip.partnerExtraNote}
                  invoice={!!trip.partnerInvoice}
                  vatPercent={Number(trip.partnerVatPercent ?? 0)}
                  busy={busy}
                  onCancel={() => setReviewOpen(false)}
                  onSubmit={(v) => post('partner-extra', v, v.approve ? 'Đã duyệt phát sinh' : 'Đã từ chối phát sinh').then(() => setReviewOpen(false))}
                />
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

          {trip.vehicle && trip.status !== 'CHO_DIEU' && <TripOdometer trip={trip} canEdit={hasRole('ADMIN', 'KE_TOAN', 'DIEU_HANH')} />}

          <SignoffBlock trip={trip} />
          <TripIncidentList tripId={trip.id} />

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

          {trip.status !== 'CHO_DIEU' && (
            <>
              <Divider titlePlacement="start">Chi phí chuyến</Divider>
              <TripCostsSection
                tripId={trip.id}
                amount={amount}
                partnerCost={trip.partnerId && trip.partnerCost !== null ? Number(trip.partnerCost) : null}
                estimatedCost={trip.estimatedCost === null ? null : Number(trip.estimatedCost)}
              />
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
      <SendOrderModal open={!!sendTrip} text={sendTrip ? buildDispatchText(sendTrip) : ''} targets={sendTrip ? sendTargets(sendTrip) : []} onClose={() => setSendTrip(null)} />
    </Drawer>
  );
}
