import { Col, Form, Input, InputNumber, Row, Switch, Tag } from 'antd';
import { useAuth } from '../auth';
import { CrudPage } from '../components/CrudPage';
import type { CostCategory } from '../types';

export default function CostCategoriesPage() {
  const { hasRole } = useAuth();
  return (
    <CrudPage<CostCategory>
      title="Loại chi phí"
      endpoint="/cost-categories"
      idField="code"
      canEdit={hasRole('ADMIN', 'KE_TOAN')}
      modalWidth={520}
      newDefaults={{ isActive: true, driverVisible: true }}
      columns={[
        { title: 'Loại chi phí', dataIndex: 'name', render: (v, r) => (r.isActive ? <b>{v}</b> : <s>{v}</s>) },
        { title: 'Mã', dataIndex: 'code', render: (v) => <code>{v}</code> },
        { title: 'Thứ tự', dataIndex: 'sortOrder', align: 'right' },
        { title: 'Số lần dùng', render: (_, r) => r._count?.costs ?? 0, align: 'right' },
        {
          title: 'App lái xe',
          dataIndex: 'driverVisible',
          render: (v) => (v ? <Tag color="blue">Lái xe chọn được</Tag> : <Tag>Chỉ văn phòng</Tag>),
        },
        { title: 'Sử dụng', dataIndex: 'isActive', render: (v) => (v ? null : <Tag>Ngừng</Tag>) },
      ]}
      renderForm={() => (
        <Row gutter={12}>
          <Col span={24}>
            <Form.Item name="name" label="Tên loại chi phí" rules={[{ required: true, message: 'Nhập tên' }]}>
              <Input />
            </Form.Item>
          </Col>
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
          <Col span={24}>
            <Form.Item
              name="driverVisible"
              label="Lái xe được chọn trên app"
              valuePropName="checked"
              tooltip="Tắt với các khoản do văn phòng nhập (lương, tiền chuyến, tạm ứng…): lái xe sẽ không thấy loại này khi nhập chi phí trên app."
            >
              <Switch checkedChildren="Có" unCheckedChildren="Không" />
            </Form.Item>
          </Col>
        </Row>
      )}
    />
  );
}
