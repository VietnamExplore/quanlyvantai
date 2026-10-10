import { Col, Form, Input, InputNumber, Row, Select, Switch, Tag } from 'antd';
import { useAuth } from '../auth';
import { CrudPage } from '../components/CrudPage';
import type { CustomerKind } from '../types';

const COLORS = ['blue', 'cyan', 'green', 'gold', 'orange', 'red', 'magenta', 'purple', 'geekblue', 'lime', 'volcano'];

export default function CustomerTypesPage() {
  const { hasRole } = useAuth();
  return (
    <CrudPage<CustomerKind>
      title="Loại khách hàng"
      endpoint="/customer-types"
      idField="code"
      canEdit={hasRole('ADMIN')}
      modalWidth={520}
      newDefaults={{ isActive: true, isAgent: false }}
      columns={[
        { title: 'Loại khách hàng', dataIndex: 'name', render: (v, r) => (r.isActive ? <Tag color={r.color ?? undefined}>{v}</Tag> : <s>{v}</s>) },
        { title: 'Mã', dataIndex: 'code', render: (v) => <code>{v}</code> },
        { title: 'Giá đại lý', dataIndex: 'isAgent', render: (v) => (v ? <Tag color="purple">Có</Tag> : null) },
        { title: 'Thứ tự', dataIndex: 'sortOrder', align: 'right' },
        { title: 'Số khách hàng', render: (_, r) => r._count?.customers ?? 0, align: 'right' },
        { title: 'Sử dụng', dataIndex: 'isActive', render: (v) => (v ? null : <Tag>Ngừng</Tag>) },
      ]}
      renderForm={({ editing }) => (
        <Row gutter={12}>
          <Col span={24}>
            <Form.Item name="name" label="Tên loại khách hàng" rules={[{ required: true, whitespace: true, message: 'Nhập tên' }]}>
              <Input placeholder="Ví dụ: Công ty du lịch, Khách VIP, Trường học…" />
            </Form.Item>
          </Col>
          {!editing && (
            <Col span={24}>
              <Form.Item name="code" label="Mã (không bắt buộc)" extra="Bỏ trống để hệ thống tự tạo từ tên. Mã không đổi được sau khi tạo.">
                <Input placeholder="VD: CONG_TY_DU_LICH" />
              </Form.Item>
            </Col>
          )}
          <Col span={12}>
            <Form.Item name="color" label="Màu thẻ">
              <Select allowClear placeholder="Mặc định" options={COLORS.map((c) => ({ value: c, label: <Tag color={c}>{c}</Tag> }))} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="sortOrder" label="Thứ tự hiển thị">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="isAgent" label="Hưởng giá đại lý" valuePropName="checked" extra="Giá đại lý xe ghép, nguồn booking mặc định Đại lý">
              <Switch />
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
