import { CalculatorOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Checkbox,
  Col,
  DatePicker,
  Divider,
  Dropdown,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { newKey, tripAmount, type TripDraft } from '../booking-utils';
import { RENTAL_SERVICES, SERVICE_TYPE, toOptions } from '../labels';
import type { PriceLine, PriceResult, RoutePrice, Surcharge } from '../types';
import { Money, MoneyInput, useLocations, useVehicleTypeOptions } from './common';

const CALC_KEYS = ['serviceType', 'vehicleTypeId', 'routePriceId', 'pickupTime', 'days', 'halfDay', 'extraKm', 'extraHours'];
const DATETIME_FORMAT = 'HH:mm DD/MM/YYYY';

interface Props {
  open: boolean;
  trip: TripDraft | null;
  onCancel: () => void;
  onSave: (trip: TripDraft) => void;
}

export function TripModal({ open, trip, onCancel, onSave }: Props) {
  const [form] = Form.useForm();
  const { vehicleTypes } = useVehicleTypeOptions();
  const locations = useLocations();
  const { data: routes = [] } = useQuery({ queryKey: ['/route-prices', {}], queryFn: () => api<RoutePrice[]>('/route-prices') });
  const { data: surchargeList = [] } = useQuery({ queryKey: ['/surcharges', {}], queryFn: () => api<Surcharge[]>('/surcharges') });

  const [breakdown, setBreakdown] = useState<PriceLine[]>([]);
  const [partnerCost, setPartnerCost] = useState<number | null>(null);
  const [calcMsg, setCalcMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [calculating, setCalculating] = useState(false);

  const serviceType = Form.useWatch('serviceType', form);
  const vehicleTypeId = Form.useWatch('vehicleTypeId', form);
  const routePriceId = Form.useWatch('routePriceId', form);
  const days = Form.useWatch('days', form);
  const unitPrice = Form.useWatch('unitPrice', form) ?? 0;
  const surcharges: PriceLine[] = Form.useWatch('surcharges', form) ?? [];

  const isRental = RENTAL_SERVICES.includes(serviceType);
  const vehicleType = vehicleTypes.find((t) => t.id === vehicleTypeId);
  const amount = tripAmount({ unitPrice, surcharges });
  const estimatedCost: number | null | undefined = Form.useWatch('estimatedCost', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setBreakdown([]);
    setPartnerCost(null);
    setCalcMsg(trip?.id ? { type: 'info', text: 'Giá đã lưu. Thay đổi loại xe, tuyến hoặc giờ đón để tính lại.' } : null);
    form.setFieldsValue(
      trip
        ? { ...trip, pickupTime: dayjs(trip.pickupTime), endTime: trip.endTime ? dayjs(trip.endTime) : null }
        : { serviceType: 'DON_TIEN_SAN_BAY', passengers: 1, days: 1, extraKm: 0, extraHours: 0, unitPrice: 0, surcharges: [] },
    );
  }, [open, trip, form]);

  const routeOptions = routes
    .filter((r) => r.isActive && (!vehicleTypeId || r.items.some((i) => i.vehicleTypeId === vehicleTypeId)))
    .map((r) => {
      const item = r.items.find((i) => i.vehicleTypeId === vehicleTypeId);
      return { value: r.id, label: item ? `${r.name} — ${Number(item.price).toLocaleString('vi-VN')}đ` : r.name };
    });

  async function recalc() {
    const v = form.getFieldsValue();
    if (!v.serviceType || !v.vehicleTypeId || !v.pickupTime) return;
    if (!v.routePriceId && !RENTAL_SERVICES.includes(v.serviceType)) {
      setBreakdown([]);
      setCalcMsg({ type: 'info', text: 'Chọn tuyến để hệ thống tự tính giá, hoặc nhập giá tay bên dưới.' });
      return;
    }
    setCalculating(true);
    try {
      const res = await api<PriceResult>('/pricing/calculate', {
        method: 'POST',
        body: {
          serviceType: v.serviceType,
          vehicleTypeId: v.vehicleTypeId,
          routePriceId: v.routePriceId ?? null,
          pickupTime: (v.pickupTime as Dayjs).toISOString(),
          days: v.days || 1,
          halfDay: !!v.halfDay,
          extraKm: v.extraKm || 0,
          extraHours: v.extraHours || 0,
        },
      });
      const manual = ((v.surcharges ?? []) as PriceLine[]).filter((s) => !s.auto);
      form.setFieldsValue({ unitPrice: res.unitPrice, endTime: dayjs(res.endTime), surcharges: [...res.surcharges, ...manual] });
      // Tự điền chi phí = giá mua đối tác của tuyến, trừ khi nhân viên đã tự nhập con số khác
      const curCost = v.estimatedCost;
      if (res.partnerCost !== null && (curCost === null || curCost === undefined || curCost === partnerCost)) {
        form.setFieldsValue({ estimatedCost: res.partnerCost });
      }
      setBreakdown(res.breakdown);
      setPartnerCost(res.partnerCost);
      setCalcMsg(null);
    } catch (e) {
      setBreakdown([]);
      setCalcMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setCalculating(false);
    }
  }

  const onValuesChange = (changed: Record<string, unknown>) => {
    if ('routePriceId' in changed && changed.routePriceId) {
      // Chọn tuyến: tự điền điểm đón / trả nếu còn trống
      const route = routes.find((r) => r.id === changed.routePriceId);
      const cur = form.getFieldsValue();
      if (route?.fromLocation && !cur.pickupAddress) form.setFieldsValue({ pickupLocationId: route.fromLocation.id, pickupAddress: route.fromLocation.name });
      if (route?.toLocation && !cur.dropoffAddress) form.setFieldsValue({ dropoffLocationId: route.toLocation.id, dropoffAddress: route.toLocation.name });
    }
    if ('vehicleTypeId' in changed) {
      // Tuyến đang chọn không có giá cho loại xe mới thì bỏ chọn
      const route = routes.find((r) => r.id === form.getFieldValue('routePriceId'));
      if (route && !route.items.some((i) => i.vehicleTypeId === changed.vehicleTypeId)) form.setFieldsValue({ routePriceId: null });
    }
    if (Object.keys(changed).some((k) => CALC_KEYS.includes(k))) recalc();
  };

  const pickLocation = (field: 'pickup' | 'dropoff', id: number | undefined) => {
    const loc = locations.find((l) => l.id === id);
    if (loc) form.setFieldsValue({ [`${field}Address`]: loc.address ? `${loc.name} (${loc.address})` : loc.name });
  };

  const addManualSurcharge = (s?: Surcharge) => {
    const current: PriceLine[] = form.getFieldValue('surcharges') ?? [];
    const line: PriceLine = s
      ? { name: s.name, amount: s.isPercent ? Math.round((unitPrice * Number(s.value)) / 100 / 1000) * 1000 : Number(s.value) }
      : { name: '', amount: 0 };
    form.setFieldsValue({ surcharges: [...current, line] });
  };

  const submit = async () => {
    let v;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    const { halfDay: _h, ...rest } = v;
    onSave({
      ...trip,
      ...rest,
      key: trip?.key ?? newKey(),
      vehicleTypeName: vehicleType?.name,
      pickupTime: (v.pickupTime as Dayjs).toISOString(),
      endTime: v.endTime ? (v.endTime as Dayjs).toISOString() : null,
      routePriceId: v.routePriceId ?? null,
      pickupLocationId: v.pickupLocationId ?? null,
      dropoffLocationId: v.dropoffLocationId ?? null,
      dropoffAddress: v.dropoffAddress || null,
      flightNumber: v.flightNumber || null,
      itinerary: v.itinerary || null,
      notes: v.notes || null,
      days: v.days || 1,
      estimatedCost: v.estimatedCost ?? null,
      extraKm: v.extraKm || 0,
      extraHours: v.extraHours || 0,
      surcharges: ((v.surcharges ?? []) as PriceLine[]).filter((s) => s.name?.trim()).map((s) => ({ ...s, amount: Number(s.amount || 0) })),
    });
  };

  const locationOptions = locations.map((l) => ({ value: l.id, label: l.name }));
  const manualSurcharges = surchargeList.filter((s) => s.isActive && s.rule === 'THU_CONG');

  return (
    <Modal
      title={trip?.id ? 'Sửa chuyến' : 'Thêm chuyến'}
      open={open}
      onCancel={onCancel}
      onOk={submit}
      okText="Xong"
      cancelText="Hủy"
      width={900}
      forceRender
      styles={{ body: { maxHeight: '75vh', overflowY: 'auto', overflowX: 'hidden' } }}
    >
      <Form form={form} layout="vertical" onValuesChange={onValuesChange}>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="serviceType" label="Dịch vụ" rules={[{ required: true }]}>
              <Select options={toOptions(SERVICE_TYPE)} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="pickupTime" label="Giờ đón" rules={[{ required: true, message: 'Chọn giờ đón' }]}>
              <DatePicker showTime={{ format: 'HH:mm', minuteStep: 5 }} format={DATETIME_FORMAT} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="endTime" label="Kết thúc dự kiến" tooltip="Tự tính theo tuyến / số ngày thuê. Dùng để kiểm tra trùng lịch khi điều xe.">
              <DatePicker showTime={{ format: 'HH:mm', minuteStep: 5 }} format={DATETIME_FORMAT} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={14} md={8}>
            <Form.Item name="vehicleTypeId" label="Loại xe" rules={[{ required: true, message: 'Chọn loại xe' }]}>
              <Select showSearch optionFilterProp="label" options={vehicleTypes.filter((t) => t.isActive).map((t) => ({ value: t.id, label: `${t.name} (tối đa ${t.maxPassengers} khách)` }))} />
            </Form.Item>
          </Col>
          <Col xs={10} md={4}>
            <Form.Item
              name="passengers"
              label="Số khách"
              rules={[
                { required: true, message: 'Nhập số khách' },
                {
                  validator: (_, v) =>
                    !vehicleType || !v || v <= vehicleType.maxPassengers
                      ? Promise.resolve()
                      : Promise.reject(new Error(`Tối đa ${vehicleType.maxPassengers} khách`)),
                },
              ]}
            >
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="routePriceId" label={isRental ? 'Tuyến / gói (không bắt buộc)' : 'Tuyến'} extra={isRental ? 'Bỏ trống để tính theo giá thuê ngày' : undefined}>
              <Select allowClear showSearch optionFilterProp="label" options={routeOptions} placeholder="Chọn tuyến có giá cho loại xe này" />
            </Form.Item>
          </Col>

          {isRental && !routePriceId && (
            <>
              <Col xs={8} md={4}>
                <Form.Item name="days" label="Số ngày">
                  <InputNumber min={1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              {(days ?? 1) === 1 && serviceType !== 'TOUR_NHIEU_NGAY' && (
                <Col xs={16} md={6}>
                  <Form.Item name="halfDay" label=" " valuePropName="checked">
                    <Checkbox>Thuê nửa ngày</Checkbox>
                  </Form.Item>
                </Col>
              )}
            </>
          )}
          <Col xs={12} md={4}>
            <Form.Item name="extraKm" label="Vượt km">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={4}>
            <Form.Item name="extraHours" label="Vượt giờ">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Divider titlePlacement="start" style={{ margin: '4px 0 12px' }}>Hành trình</Divider>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="pickupLocationId" label="Điểm đón (chọn nhanh)">
              <Select allowClear showSearch optionFilterProp="label" options={locationOptions} onChange={(id) => pickLocation('pickup', id)} />
            </Form.Item>
          </Col>
          <Col xs={24} md={16}>
            <Form.Item name="pickupAddress" label="Địa chỉ đón" rules={[{ required: true, message: 'Nhập điểm đón' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="dropoffLocationId" label="Điểm trả (chọn nhanh)">
              <Select allowClear showSearch optionFilterProp="label" options={locationOptions} onChange={(id) => pickLocation('dropoff', id)} />
            </Form.Item>
          </Col>
          <Col xs={24} md={16}>
            <Form.Item name="dropoffAddress" label="Địa chỉ trả">
              <Input />
            </Form.Item>
          </Col>
          {serviceType === 'DON_TIEN_SAN_BAY' && (
            <Col xs={24} md={8}>
              <Form.Item name="flightNumber" label="Số hiệu chuyến bay">
                <Input placeholder="VN123" />
              </Form.Item>
            </Col>
          )}
          {isRental && (
            <Col span={24}>
              <Form.Item name="itinerary" label="Lịch trình">
                <Input.TextArea rows={3} placeholder={'Ngày 1: Sài Gòn – Phan Thiết\nNgày 2: Mũi Né – Bàu Trắng'} />
              </Form.Item>
            </Col>
          )}
          <Col span={24}>
            <Form.Item name="notes" label="Ghi chú chuyến">
              <Input placeholder="Ví dụ: khách có trẻ em, cần ghế trẻ em; đón tại cột số 5…" />
            </Form.Item>
          </Col>
        </Row>

        <Divider titlePlacement="start" style={{ margin: '4px 0 12px' }}>
          Giá{' '}
          <Button size="small" type="link" icon={<CalculatorOutlined />} loading={calculating} onClick={recalc}>
            Tính lại
          </Button>
        </Divider>
        {calcMsg && <Alert type={calcMsg.type} title={calcMsg.text} showIcon style={{ marginBottom: 12 }} />}
        {breakdown.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {breakdown.map((b, i) => (
              <Flex key={i} justify="space-between">
                <Typography.Text type="secondary">{b.name}</Typography.Text>
                <Money value={b.amount} />
              </Flex>
            ))}
          </div>
        )}
        <Row gutter={16}>
          <Col xs={24} md={10}>
            <Form.Item name="unitPrice" label="Giá chuyến" rules={[{ required: true, message: 'Nhập giá' }]} extra="Có thể sửa tay">
              <MoneyInput />
            </Form.Item>
          </Col>
          <Col xs={24} md={10}>
            <Form.Item
              name="estimatedCost"
              label="Chi phí dự kiến"
              tooltip="Giá thuê xe đối tác, hoặc chi phí xăng dầu + lương tài xế nếu chạy xe công ty. Dùng để tính lợi nhuận."
              extra={partnerCost !== null ? `Giá mua đối tác của tuyến: ${partnerCost.toLocaleString('vi-VN')}đ` : 'Để trống nếu chưa biết'}
            >
              <MoneyInput />
            </Form.Item>
          </Col>
        </Row>

        <Form.List name="surcharges">
          {(fields, { remove }) => (
            <>
              {fields.map((f) => {
                const isAuto = surcharges[f.name]?.auto;
                return (
                  <Row gutter={8} key={f.key} align="middle" style={{ marginBottom: 8 }}>
                    <Col flex="auto">
                      <Form.Item name={[f.name, 'name']} noStyle rules={[{ required: true, message: 'Nhập tên phụ thu' }]}>
                        <Input placeholder="Tên phụ thu" prefix={isAuto ? <Tag color="geekblue">Tự động</Tag> : undefined} />
                      </Form.Item>
                    </Col>
                    <Col style={{ width: 200 }}>
                      <Form.Item name={[f.name, 'amount']} noStyle>
                        <MoneyInput />
                      </Form.Item>
                    </Col>
                    <Col>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
                    </Col>
                  </Row>
                );
              })}
            </>
          )}
        </Form.List>
        <Dropdown
          menu={{
            items: [
              ...manualSurcharges.map((s) => ({
                key: String(s.id),
                label: `${s.name} (${s.isPercent ? `${Number(s.value)}%` : `${Number(s.value).toLocaleString('vi-VN')}đ`})`,
                onClick: () => addManualSurcharge(s),
              })),
              { type: 'divider' as const },
              { key: 'other', label: 'Phụ thu khác (nhập tay)', onClick: () => addManualSurcharge() },
            ],
          }}
        >
          <Button icon={<PlusOutlined />} size="small">
            Thêm phụ thu
          </Button>
        </Dropdown>

        <Flex justify="flex-end" align="baseline" gap={16} wrap style={{ marginTop: 16 }}>
          {estimatedCost !== null && estimatedCost !== undefined && (
            <Tag color={amount - estimatedCost >= 0 ? 'green' : 'red'} style={{ fontSize: 14, padding: '2px 8px' }}>
              Lãi dự kiến: {(amount - estimatedCost).toLocaleString('vi-VN')} đ
            </Tag>
          )}
          <Typography.Title level={4} style={{ margin: 0 }}>
            Thành tiền: <Money value={amount} />
          </Typography.Title>
        </Flex>
      </Form>
    </Modal>
  );
}
