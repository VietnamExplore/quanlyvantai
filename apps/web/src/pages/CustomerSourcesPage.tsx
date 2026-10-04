import { Col, Form, Input, InputNumber, Row, Switch, Tag } from 'antd';
import { useAuth } from '../auth';
import { CrudPage } from '../components/CrudPage';
import type { CustomerSource } from '../types';

export default function CustomerSourcesPage() {
  const { hasRole } = useAuth();
  return (
    <CrudPage<CustomerSource>
      title="Nguồn khách"
      endpoint="/customer-sources"
      idField="code"
      canEdit={hasRole('ADMIN')}
      modalWidth={520}
      newDefaults={{ isActive: true }}
      columns={[
        { title: 'Nguồn khách', dataIndex: 'name', render: (v, r) => (r.isActive ? <b>{v}</b> : <s>{v}</s>) },
        { title: 'Mã', dataIndex: 'code', render: (v) => <code>{v}</code> },
        { title: 'Thứ tự', dataIndex: 'sortOrder', align: 'right' },
        { title: 'Số booking', render: (_, r) => r._count?.bookings ?? 0, align: 'right' },
        { title: 'Sử dụng', dataIndex: 'isActive', render: (v) => (v ? null : <Tag>Ngừng</Tag>) },
      ]}
      renderForm={({ editing }) => (
        <Row gutter={12}>
          <Col span={24}>
            <Form.Item name="name" label="Tên nguồn khách" rules={[{ required: true, whitespace: true, message: 'Nhập tên' }]}>
              <Input placeholder="Ví dụ: OTA, Facebook, Khách quen giới thiệu…" />
            </Form.Item>
          </Col>
          {!editing && (
            <Col span={24}>
              <Form.Item name="code" label="Mã (không bắt buộc)" extra="Bỏ trống để hệ thống tự tạo từ tên. Mã không đổi được sau khi tạo.">
                <Input placeholder="VD: FACEBOOK" />
              </Form.Item>
            </Col>
          )}
          <Col span={12}>
            <Form.Item name="sortOrder" label="Thứ tự hiển thị">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="isActive" label="Đang sử dụng" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      )}
    />
  );
}
