import { EnvironmentOutlined } from '@ant-design/icons';
import { Col, Form, Input, InputNumber, Row, Select, Switch } from 'antd';
import { useAuth } from '../auth';
import { CrudPage } from '../components/CrudPage';
import { EnumTag } from '../components/common';
import { LOCATION_TYPE, toOptions } from '../labels';
import type { Location } from '../types';

const mapUrl = (r: Location) =>
  r.lat !== null && r.lng !== null
    ? `https://www.google.com/maps?q=${r.lat},${r.lng}&hl=vi&gl=vn`
    : `https://www.google.com/maps/search/${encodeURIComponent(r.address || r.name)}?hl=vi&gl=vn`;

export default function LocationsPage() {
  const { hasRole } = useAuth();

  return (
    <CrudPage<Location>
      title="Địa điểm"
      endpoint="/locations"
      canEdit={hasRole('ADMIN', 'DIEU_HANH', 'KINH_DOANH')}
      searchPlaceholder="Tên, địa chỉ"
      newDefaults={{ type: 'KHACH_SAN', isActive: true }}
      renderFilters={(f, set) => (
        <Select allowClear placeholder="Loại địa điểm" style={{ width: 160 }} options={toOptions(LOCATION_TYPE)} value={f.type} onChange={(v) => set('type', v)} />
      )}
      columns={[
        { title: 'Địa điểm', dataIndex: 'name', render: (v) => <b>{v}</b> },
        { title: 'Loại', dataIndex: 'type', render: (v) => <EnumTag labels={LOCATION_TYPE} value={v} /> },
        { title: 'Địa chỉ', dataIndex: 'address' },
        {
          title: 'Bản đồ',
          render: (_, r) => (
            <a href={mapUrl(r)} target="_blank" rel="noreferrer">
              <EnvironmentOutlined /> Xem
            </a>
          ),
        },
      ]}
      renderForm={() => (
        <Row gutter={16}>
          <Col xs={24} md={16}>
            <Form.Item name="name" label="Tên địa điểm" rules={[{ required: true, message: 'Nhập tên địa điểm' }]}>
              <Input placeholder="Sân bay Tân Sơn Nhất - Ga quốc nội" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="type" label="Loại">
              <Select options={toOptions(LOCATION_TYPE)} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="address" label="Địa chỉ">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="lat" label="Vĩ độ" extra="Lấy từ Google Maps (không bắt buộc)">
              <InputNumber min={-90} max={90} step={0.000001} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="lng" label="Kinh độ">
              <InputNumber min={-180} max={180} step={0.000001} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="isActive" label="Đang sử dụng" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      )}
    />
  );
}
