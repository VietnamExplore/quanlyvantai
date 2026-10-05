import { QuickSelect } from '../components/QuickCreate';
import { DollarOutlined } from '@ant-design/icons';
import { Button, Col, DatePicker, Form, Input, InputNumber, Row, Select, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useAuth } from '../auth';
import { CrudPage } from '../components/CrudPage';
import { DATE_FORMAT, EnumTag, ExpiryCell, usePartnerOptions } from '../components/common';
import { DRIVER_STATUS, toOptions } from '../labels';
import { DriverSalaryModal, salaryText, useCurrentSalaries } from '../components/DriverSalary';
import type { Driver } from '../types';

export default function DriversPage() {
  const { hasRole } = useAuth();
  const partnerOptions = usePartnerOptions();
  // Lương lái xe: chỉ Admin, Kế toán xem / sửa
  const canSalary = hasRole('ADMIN', 'KE_TOAN');
  const salaries = useCurrentSalaries(canSalary);
  const [salaryDriver, setSalaryDriver] = useState<Driver | null>(null);
  const ownerOptions = [{ value: 'company', label: 'Lái xe công ty' }, ...partnerOptions.map((p) => ({ value: String(p.value), label: p.label }))];

  return (
    <>
    <CrudPage<Driver>
      title="Lái xe"
      endpoint="/drivers"
      canEdit={hasRole('ADMIN', 'DIEU_HANH')}
      canDelete={hasRole('ADMIN', 'DIEU_HANH')}
      searchPlaceholder="Tên, SĐT, số bằng"
      dateFields={['licenseExpiry', 'healthCheckExpiry']}
      newDefaults={{ status: 'DANG_LAM' }}
      renderFilters={(f, set) => (
        <>
          <Select allowClear placeholder="Thuộc" style={{ width: 180 }} options={ownerOptions} value={f.owner} onChange={(v) => set('owner', v)} />
          <Select allowClear placeholder="Trạng thái" style={{ width: 140 }} options={toOptions(DRIVER_STATUS)} value={f.status} onChange={(v) => set('status', v)} />
        </>
      )}
      columns={[
        { title: 'Họ tên', dataIndex: 'fullName', render: (v) => <b>{v}</b> },
        { title: 'SĐT', dataIndex: 'phone' },
        { title: 'Thuộc', render: (_, r) => (r.partner ? <Tag color="gold">{r.partner.name}</Tag> : <Tag color="blue">Công ty</Tag>) },
        { title: 'Hạng bằng', dataIndex: 'licenseClass' },
        { title: 'Hạn bằng lái', dataIndex: 'licenseExpiry', render: (v) => <ExpiryCell value={v} /> },
        { title: 'Hạn khám SK', dataIndex: 'healthCheckExpiry', render: (v) => <ExpiryCell value={v} /> },
        { title: 'Xe mặc định', render: (_, r) => r.defaultVehicles.map((v) => v.plateNumber).join(', ') },
        { title: 'Định mức xăng', dataIndex: 'fuelNorm', render: (v, r) => (r.partner ? '' : v ? `${Number(v)} L/100km` : <Typography.Text type="secondary">Chung</Typography.Text>) },
        { title: 'Trạng thái', dataIndex: 'status', render: (v) => <EnumTag labels={DRIVER_STATUS} value={v} /> },
        ...(canSalary
          ? [
              {
                title: 'Lương (tháng này)',
                render: (_: unknown, r: Driver) =>
                  r.partner ? null : (
                    <Button
                      size="small"
                      type={salaries?.[r.id] ? 'text' : 'dashed'}
                      className="btn-wrap"
                      icon={<DollarOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSalaryDriver(r);
                      }}
                    >
                      {salaryText(salaries?.[r.id]) ?? <Typography.Text type="warning">Cài lương</Typography.Text>}
                    </Button>
                  ),
              },
            ]
          : []),
        {
          title: 'Tài khoản app',
          render: (_, r) => (r.user ? <Tag color={r.user.isActive ? 'green' : 'default'}>{r.user.username}</Tag> : <span style={{ color: '#bbb' }}>Chưa có</span>),
        },
      ]}
      renderForm={() => (
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="fullName" label="Họ tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="phone" label="Số điện thoại" rules={[{ required: true, message: 'Nhập số điện thoại' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="partnerId" label="Thuộc nhà xe đối tác" extra="Để trống nếu là lái xe công ty">
              <QuickSelect entity="partner" allowClear options={partnerOptions} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="idCardNumber" label="Số CCCD">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="licenseClass" label="Hạng bằng">
              <Input placeholder="D1" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="licenseNumber" label="Số bằng lái">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="licenseExpiry" label="Hạn bằng lái">
              <DatePicker format={DATE_FORMAT} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="healthCheckExpiry" label="Hạn khám sức khỏe">
              <DatePicker format={DATE_FORMAT} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="fuelNorm"
              label="Định mức xăng dầu (lít/100km)"
              tooltip="Bỏ trống = dùng định mức chung ở Thông tin công ty (mặc định 11). Áp dụng cho các chuyến ghi km từ lúc lưu."
            >
              <InputNumber min={1} max={100} step={0.5} placeholder="Định mức chung" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="status" label="Trạng thái">
              <Select options={toOptions(DRIVER_STATUS)} />
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
    <DriverSalaryModal driver={salaryDriver} onClose={() => setSalaryDriver(null)} />
    </>
  );
}
