import { QuickSelect } from '../components/QuickCreate';
import { Col, Form, Input, InputNumber, Row, Select, Switch, Tag } from 'antd';
import { useAuth } from '../auth';
import { CrudPage } from '../components/CrudPage';
import { EnumTag, formatVnd, useSalesStaffOptions } from '../components/common';
import { CUSTOMER_TYPE, toOptions } from '../labels';
import type { Customer } from '../types';

export default function CustomersPage() {
  const { hasRole, user } = useAuth();
  const salesOptions = useSalesStaffOptions();

  return (
    <CrudPage<Customer>
      title="Khách hàng"
      endpoint="/customers"
      canEdit={hasRole('ADMIN', 'KINH_DOANH')}
      searchPlaceholder="Tên, SĐT, email, MST"
      newDefaults={{
        type: 'KHACH_LE',
        isActive: true,
        // Nhân viên kinh doanh tạo khách thì mặc định là người phụ trách
        salesUserId: user?.roles.includes('KINH_DOANH') ? user.id : undefined,
      }}
      toFormValues={(r) => ({
        creditLimit: r.creditLimit === null ? null : Number(r.creditLimit),
        discountPercent: r.discountPercent === null ? null : Number(r.discountPercent),
      })}
      renderFilters={(f, set) => (
        <>
          <Select allowClear placeholder="Loại khách" style={{ width: 150 }} options={toOptions(CUSTOMER_TYPE)} value={f.type} onChange={(v) => set('type', v)} />
          <Select allowClear placeholder="NV phụ trách" style={{ width: 170 }} options={salesOptions} value={f.salesUserId} onChange={(v) => set('salesUserId', v)} />
        </>
      )}
      columns={[
        { title: 'Khách hàng', dataIndex: 'name', render: (v, r) => (r.isActive ? <b>{v}</b> : <s>{v}</s>) },
        { title: 'Loại', dataIndex: 'type', render: (v) => <EnumTag labels={CUSTOMER_TYPE} value={v} /> },
        { title: 'SĐT', dataIndex: 'phone' },
        { title: 'Email', dataIndex: 'email' },
        { title: 'MST', dataIndex: 'taxCode' },
        { title: 'NV phụ trách', render: (_, r) => r.salesUser?.fullName },
        { title: 'Hạn mức công nợ', dataIndex: 'creditLimit', align: 'right', render: (v) => formatVnd(v) },
        { title: 'Chiết khấu', dataIndex: 'discountPercent', align: 'right', render: (v) => (v ? `${Number(v)}%` : '') },
        { title: 'Ngày công nợ', dataIndex: 'paymentTermDays', align: 'right', render: (v) => (v ? `${v} ngày` : '') },
        { title: 'Trạng thái', dataIndex: 'isActive', render: (v) => (v ? null : <Tag>Ngừng giao dịch</Tag>) },
      ]}
      renderForm={() => (
        <Row gutter={16}>
          <Col xs={24} md={16}>
            <Form.Item name="name" label="Tên khách hàng / công ty" rules={[{ required: true, message: 'Nhập tên khách hàng' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="type" label="Loại khách">
              <Select options={toOptions(CUSTOMER_TYPE)} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="phone" label="SĐT">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
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
          <Col xs={24} md={8}>
            <Form.Item name="salesUserId" label="NV kinh doanh phụ trách">
              <QuickSelect entity="salesUser" allowClear options={salesOptions} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="creditLimit" label="Hạn mức công nợ (đ)">
              <InputNumber<number>
                min={0}
                step={1_000_000}
                style={{ width: '100%' }}
                formatter={(v) => formatVnd(v)}
                parser={(v) => Number((v ?? '').replace(/\D/g, ''))}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={5}>
            <Form.Item name="discountPercent" label="Chiết khấu (%)">
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="paymentTermDays" label="Số ngày công nợ" tooltip="Hạn thanh toán = ngày kết thúc chuyến cuối + số ngày này. 0 = thanh toán ngay khi xong chuyến.">
              <InputNumber min={0} style={{ width: '100%' }} addonAfter="ngày" />
            </Form.Item>
          </Col>
          <Col xs={24} md={5}>
            <Form.Item name="isActive" label="Đang giao dịch" valuePropName="checked">
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
