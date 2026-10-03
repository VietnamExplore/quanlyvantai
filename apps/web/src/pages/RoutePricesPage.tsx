import { Col, Divider, Form, Input, InputNumber, Row, Select, Switch, Table, Tag, Typography } from 'antd';
import { useAuth } from '../auth';
import { CrudPage } from '../components/CrudPage';
import { EnumTag, Money, MoneyInput, useLocations, useVehicleTypeOptions } from '../components/common';
import { SERVICE_TYPE, toOptions } from '../labels';
import type { RoutePrice } from '../types';

type PriceMap = Record<string, { price?: number | null; partnerCost?: number | null }>;

export default function RoutePricesPage() {
  const { hasRole } = useAuth();
  const { vehicleTypes } = useVehicleTypeOptions();
  const locations = useLocations();
  const locationOptions = locations.map((l) => ({ value: l.id, label: l.name }));

  return (
    <CrudPage<RoutePrice>
      title="Giá theo tuyến"
      endpoint="/route-prices"
      canEdit={hasRole('ADMIN', 'KE_TOAN')}
      canDelete={hasRole('ADMIN', 'KE_TOAN')}
      searchPlaceholder="Tên tuyến"
      modalWidth={820}
      newDefaults={{ serviceType: 'DON_TIEN_SAN_BAY', isActive: true }}
      toFormValues={(r) => ({
        durationHours: r.durationHours === null ? null : Number(r.durationHours),
        prices: Object.fromEntries(
          r.items.map((i) => [i.vehicleTypeId, { price: Number(i.price), partnerCost: i.partnerCost === null ? null : Number(i.partnerCost) }]),
        ),
      })}
      toPayload={({ prices, ...rest }) => ({
        ...rest,
        items: Object.entries((prices ?? {}) as PriceMap)
          .filter(([, p]) => p?.price !== null && p?.price !== undefined)
          .map(([vehicleTypeId, p]) => ({ vehicleTypeId: Number(vehicleTypeId), price: p.price, partnerCost: p.partnerCost ?? null })),
      })}
      renderFilters={(f, set) => (
        <Select allowClear placeholder="Dịch vụ" style={{ width: 170 }} options={toOptions(SERVICE_TYPE)} value={f.serviceType} onChange={(v) => set('serviceType', v)} />
      )}
      columns={[
        { title: 'Tuyến', dataIndex: 'name', render: (v, r) => (r.isActive ? <b>{v}</b> : <s>{v}</s>) },
        { title: 'Dịch vụ', dataIndex: 'serviceType', render: (v) => <EnumTag labels={SERVICE_TYPE} value={v} /> },
        { title: 'Km', dataIndex: 'distanceKm', align: 'right' },
        { title: 'Giờ chạy', dataIndex: 'durationHours', align: 'right', render: (v) => (v ? Number(v) : '') },
        {
          title: 'Giá bán theo loại xe',
          render: (_, r) =>
            [...r.items]
              .sort((a, b) => a.vehicleType.seats - b.vehicleType.seats)
              .map((i) => (
                <Tag key={i.vehicleTypeId} style={{ marginBottom: 4 }}>
                  {i.vehicleType.name}: <Money value={i.price} strong />
                </Tag>
              )),
        },
        { title: 'Sử dụng', dataIndex: 'isActive', render: (v) => (v ? null : <Tag>Ngừng</Tag>) },
      ]}
      renderForm={() => (
        <>
          <Row gutter={16}>
            <Col xs={24} md={16}>
              <Form.Item name="name" label="Tên tuyến" rules={[{ required: true, message: 'Nhập tên tuyến' }]}>
                <Input placeholder="Sân bay Tân Sơn Nhất → Trung tâm Quận 1" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="serviceType" label="Dịch vụ">
                <Select options={toOptions(SERVICE_TYPE)} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="fromLocationId" label="Điểm đi">
                <Select allowClear showSearch optionFilterProp="label" options={locationOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="toLocationId" label="Điểm đến">
                <Select allowClear showSearch optionFilterProp="label" options={locationOptions} />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item name="distanceKm" label="Số km">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item name="durationHours" label="Giờ chạy" tooltip="Dùng để tính giờ xe rảnh khi điều phối">
                <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider titlePlacement="start" style={{ marginTop: 0 }}>
            Giá theo loại xe <Typography.Text type="secondary">(để trống loại xe không chạy tuyến này)</Typography.Text>
          </Divider>
          <Table
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={vehicleTypes.filter((t) => t.isActive)}
            columns={[
              { title: 'Loại xe', dataIndex: 'name', width: 160 },
              {
                title: 'Giá bán',
                render: (_, t) => (
                  <Form.Item name={['prices', String(t.id), 'price']} noStyle>
                    <MoneyInput />
                  </Form.Item>
                ),
              },
              {
                title: 'Giá mua đối tác (tham khảo)',
                render: (_, t) => (
                  <Form.Item name={['prices', String(t.id), 'partnerCost']} noStyle>
                    <MoneyInput />
                  </Form.Item>
                ),
              },
            ]}
          />

          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col xs={24} md={18}>
              <Form.Item name="notes" label="Ghi chú">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="isActive" label="Đang áp dụng" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </>
      )}
    />
  );
}
