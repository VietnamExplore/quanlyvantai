import { Col, Form, Input, InputNumber, Row, Select, Switch, Tag } from 'antd';
import { useAuth } from '../auth';
import { CrudPage } from '../components/CrudPage';
import { ForeignNamesFields } from '../components/ForeignNames';
import type { VehicleType } from '../types';

const LICENSE_CLASSES = ['B', 'C1', 'C', 'D1', 'D2', 'D', 'BE', 'C1E', 'CE', 'D1E', 'D2E', 'DE'];

export default function VehicleTypesPage() {
  const { hasRole } = useAuth();

  return (
    <CrudPage<VehicleType>
      title="Loại xe"
      endpoint="/vehicle-types"
      canEdit={hasRole('ADMIN')}
      newDefaults={{ isActive: true, licenseClasses: [] }}
      columns={[
        { title: 'Mã', dataIndex: 'code', render: (v) => <b>{v}</b> },
        { title: 'Tên', dataIndex: 'name' },
        { title: 'Tên ngoại ngữ', render: (_, r) => <span style={{ fontSize: 12, color: '#666' }}>{Object.values(r.names ?? {}).filter(Boolean).join(' · ')}</span> },
        { title: 'Số chỗ', dataIndex: 'seats', align: 'right' },
        { title: 'Khách tối đa', dataIndex: 'maxPassengers', align: 'right' },
        { title: 'Định mức xăng', dataIndex: 'fuelNorm', align: 'right', render: (v) => `${v ? Number(v) : 11} L/100km` },
        { title: 'Hạng bằng phù hợp', dataIndex: 'licenseClasses', render: (v: string[]) => v.map((c) => <Tag key={c}>{c}</Tag>) },
        { title: 'Số xe', render: (_, r) => r._count?.vehicles ?? 0, align: 'right' },
        { title: 'Sử dụng', dataIndex: 'isActive', render: (v) => (v ? null : <Tag>Ngừng</Tag>) },
      ]}
      renderForm={({ editing }) => (
        <Row gutter={16}>
          <Col xs={12} md={8}>
            <Form.Item name="code" label="Mã" rules={[{ required: true, message: 'Nhập mã' }]}>
              <Input placeholder="XE16" disabled={!!editing} />
            </Form.Item>
          </Col>
          <Col xs={12} md={16}>
            <Form.Item name="name" label="Tên" rules={[{ required: true, message: 'Nhập tên' }]}>
              <Input placeholder="Xe 16 chỗ" />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="seats" label="Số chỗ (gồm ghế lái)" rules={[{ required: true, message: 'Nhập số chỗ' }]}>
              <InputNumber min={2} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="maxPassengers" label="Số khách tối đa" rules={[{ required: true, message: 'Nhập số khách' }]}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="fuelNorm"
              label="Định mức xăng dầu (lít/100km)"
              tooltip="Áp dụng cho các xe thuộc loại này (xe nào cài định mức riêng thì theo xe). Bỏ trống = 11 lít/100km. Chuyến đã ghi km giữ định mức cũ."
            >
              <InputNumber min={1} max={100} step={0.5} placeholder="11" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="isActive" label="Đang sử dụng" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              name="licenseClasses"
              label="Hạng bằng lái phù hợp"
              extra="Dùng để cảnh báo khi điều phối lái xe không đủ hạng bằng. Có thể gõ thêm hạng bằng khác."
            >
              <Select mode="tags" options={LICENSE_CLASSES.map((c) => ({ value: c, label: c }))} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <ForeignNamesFields
              hint="Bỏ trống thì giấy tờ ngoại ngữ tự ghi theo số chỗ, ví dụ: 16-seat vehicle, 16인승 차량, 16座车, 16人乗り車両."
              placeholders={{ en: '16-seat Ford Transit', ko: '16인승 포드 트랜짓', zh: '16座福特全顺', ja: '16人乗りフォード・トランジット' }}
            />
          </Col>
        </Row>
      )}
    />
  );
}
