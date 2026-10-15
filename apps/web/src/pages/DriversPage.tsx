import { QuickSelect } from '../components/QuickCreate';
import { DollarOutlined } from '@ant-design/icons';
import { Button, Col, DatePicker, Form, Input, Row, Select, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useAuth } from '../auth';
import { CrudPage } from '../components/CrudPage';
import { DriverAppCard } from '../components/DriverAppCard';
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

  return (
    <>
    <DriverAppCard />
    <CrudPage<Driver>
      title="Lái xe"
      endpoint="/drivers"
      canEdit={hasRole('ADMIN', 'DIEU_HANH')}
      canDelete={hasRole('ADMIN', 'DIEU_HANH')}
      searchPlaceholder="Tên, SĐT, số bằng"
      dateFields={['licenseExpiry', 'healthCheckExpiry']}
      newDefaults={{ status: 'DANG_LAM' }}
      sections={[
        { key: 'cong-ty', label: 'Lái xe công ty', match: (r) => !r.partner, hideColumns: ['Thuộc'] },
        { key: 'nha-xe', label: 'Lái xe nhà xe đối tác', match: (r) => !!r.partner, hideColumns: ['Lương (tháng này)', 'Xe mặc định'], partnerOf: (r) => r.partner?.id },
      ]}
      renderFilters={(f, set) => (
        <>
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
      renderForm={({ section }) => (
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
          {section === 'nha-xe' && (
            <Col xs={24} md={12}>
              <Form.Item name="partnerId" label="Nhà xe đối tác" rules={[{ required: true, message: 'Chọn nhà xe' }]}>
                <QuickSelect entity="partner" options={partnerOptions} />
              </Form.Item>
            </Col>
          )}
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
