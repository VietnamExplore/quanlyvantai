import { Col, Form, Input, Rate, Row, Select, Switch, Tag } from 'antd';
import { useAuth } from '../auth';
import { CrudPage } from '../components/CrudPage';
import { useVehicleTypeOptions } from '../components/common';
import type { Partner } from '../types';

export default function PartnersPage() {
  const { hasRole } = useAuth();
  const { codeOptions } = useVehicleTypeOptions();

  return (
    <CrudPage<Partner>
      title="Nhà xe đối tác"
      endpoint="/partners"
      canEdit={hasRole('ADMIN', 'DIEU_HANH')}
      searchPlaceholder="Tên nhà xe, người liên hệ, SĐT"
      newDefaults={{ isActive: true, vehicleTypeCodes: [] }}
      renderFilters={(f, set) => (
        <Select allowClear placeholder="Cung cấp loại xe" style={{ width: 170 }} options={codeOptions} value={f.vehicleType} onChange={(v) => set('vehicleType', v)} />
      )}
      columns={[
        { title: 'Nhà xe', dataIndex: 'name', render: (v, r) => (r.isActive ? <b>{v}</b> : <s>{v}</s>) },
        { title: 'Người liên hệ', dataIndex: 'contactName' },
        { title: 'SĐT', dataIndex: 'phone' },
        { title: 'Zalo', dataIndex: 'zalo' },
        { title: 'Loại xe cung cấp', dataIndex: 'vehicleTypeCodes', render: (codes: string[]) => codes.map((c) => <Tag key={c}>{c}</Tag>) },
        { title: 'Đánh giá', dataIndex: 'rating', render: (v) => (v ? <Rate disabled value={v} style={{ fontSize: 14 }} /> : null) },
        { title: 'Xe / Lái xe', render: (_, r) => `${r._count?.vehicles ?? 0} / ${r._count?.drivers ?? 0}` },
        { title: 'Hợp tác', dataIndex: 'isActive', render: (v) => (v ? <Tag color="green">Đang hợp tác</Tag> : <Tag>Ngừng</Tag>) },
      ]}
      renderForm={() => (
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="name" label="Tên nhà xe" rules={[{ required: true, message: 'Nhập tên nhà xe' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="contactName" label="Người liên hệ">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="phone" label="SĐT">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="zalo" label="Zalo">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="taxCode" label="Mã số thuế">
              <Input />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="address" label="Địa chỉ">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="bankName" label="Ngân hàng">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="bankAccount" label="Số tài khoản">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={16}>
            <Form.Item name="vehicleTypeCodes" label="Loại xe cung cấp được">
              <Select mode="multiple" options={codeOptions} />
            </Form.Item>
          </Col>
          <Col xs={12} md={4}>
            <Form.Item name="rating" label="Đánh giá" normalize={(v) => v || null}>
              <Rate />
            </Form.Item>
          </Col>
          <Col xs={12} md={4}>
            <Form.Item name="isActive" label="Đang hợp tác" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="notes" label="Ghi chú">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>
      )}
    />
  );
}
