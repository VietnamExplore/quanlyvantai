import { QuickSelect } from '../components/QuickCreate';
import { Checkbox, Col, Form, Input, Row, Select, Switch, Tag } from 'antd';
import { CrudPage } from '../components/CrudPage';
import { EnumTag, useCompanyDriverOptions } from '../components/common';
import { ROLE, toOptions } from '../labels';
import type { Role, User } from '../types';

export default function UsersPage() {
  const driverOptions = useCompanyDriverOptions();

  return (
    <CrudPage<User>
      title="Người dùng"
      endpoint="/users"
      canEdit
      searchPlaceholder="Tên đăng nhập, họ tên, SĐT"
      newDefaults={{ isActive: true, roles: [] }}
      toFormValues={(r) => ({ driverId: r.driver?.id ?? null, password: undefined })}
      modalWidth={640}
      renderFilters={(f, set) => (
        <Select allowClear placeholder="Vai trò" style={{ width: 150 }} options={toOptions(ROLE)} value={f.role} onChange={(v) => set('role', v)} />
      )}
      columns={[
        { title: 'Tên đăng nhập', dataIndex: 'username', render: (v, r) => (r.isActive ? <b>{v}</b> : <s>{v}</s>) },
        { title: 'Họ tên', dataIndex: 'fullName' },
        { title: 'SĐT', dataIndex: 'phone' },
        { title: 'Vai trò', dataIndex: 'roles', render: (roles: Role[]) => roles.map((r) => <EnumTag key={r} labels={ROLE} value={r} />) },
        { title: 'Hồ sơ lái xe', render: (_, r) => r.driver?.fullName },
        { title: 'Trạng thái', dataIndex: 'isActive', render: (v) => (v ? <Tag color="green">Hoạt động</Tag> : <Tag>Đã khóa</Tag>) },
      ]}
      renderForm={({ editing }) => (
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="username" label="Tên đăng nhập" extra="Nên dùng số điện thoại" rules={[{ required: !editing, message: 'Nhập tên đăng nhập' }]}>
              <Input disabled={!!editing} autoComplete="off" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="password"
              label={editing ? 'Đặt lại mật khẩu' : 'Mật khẩu'}
              extra={editing ? 'Để trống nếu không đổi' : undefined}
              rules={[{ required: !editing, message: 'Nhập mật khẩu' }, { min: 6, message: 'Tối thiểu 6 ký tự' }]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="fullName" label="Họ tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="phone" label="SĐT">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="isActive" label="Hoạt động" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="roles" label="Vai trò" rules={[{ required: true, type: 'array', min: 1, message: 'Chọn ít nhất một vai trò' }]}>
              <Checkbox.Group options={toOptions(ROLE)} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item noStyle dependencies={['roles']}>
              {({ getFieldValue }) =>
                (getFieldValue('roles') ?? []).includes('LAI_XE') ? (
                  <Form.Item name="driverId" label="Liên kết hồ sơ lái xe" extra="Lái xe sẽ thấy các chuyến được giao cho hồ sơ này trên app">
                    <QuickSelect entity="driver" allowClear options={driverOptions} />
                  </Form.Item>
                ) : null
              }
            </Form.Item>
          </Col>
        </Row>
      )}
    />
  );
}
