import { QuickSelect } from '../components/QuickCreate';
import { Checkbox, Col, Form, Input, Row, Select, Switch, Tag } from 'antd';
import { CrudPage } from '../components/CrudPage';
import { EnumTag, useCompanyDriverOptions, usePartnerOptions } from '../components/common';
import { ROLE, toOptions } from '../labels';
import type { Role, User } from '../types';

export default function UsersPage() {
  const driverOptions = useCompanyDriverOptions();
  const partnerOptions = usePartnerOptions();

  return (
    <CrudPage<User>
      title="Người dùng"
      endpoint="/users"
      canEdit
      canDelete
      deleteConfirm="Xóa người dùng này? Tài khoản đã có dữ liệu (booking, phiếu thu chi, điều xe…) sẽ được khóa và ẩn đi, chứng từ cũ vẫn giữ tên người tạo."
      searchPlaceholder="Tên đăng nhập, họ tên, SĐT"
      newDefaults={{ isActive: true, roles: [] }}
      toFormValues={(r) => ({ driverId: r.driver?.id ?? null, partnerId: r.partner?.id ?? null, password: undefined })}
      modalWidth={640}
      renderFilters={(f, set) => (
        <Select allowClear placeholder="Vai trò" style={{ width: 150 }} options={toOptions(ROLE)} value={f.role} onChange={(v) => set('role', v)} />
      )}
      columns={[
        { title: 'Tên đăng nhập', dataIndex: 'username', render: (v, r) => (r.isActive ? <b>{v}</b> : <s>{v}</s>) },
        { title: 'Họ tên', dataIndex: 'fullName' },
        { title: 'SĐT', dataIndex: 'phone' },
        { title: 'Vai trò', dataIndex: 'roles', render: (roles: Role[]) => roles.map((r) => <EnumTag key={r} labels={ROLE} value={r} />) },
        { title: 'Liên kết', render: (_, r) => r.driver?.fullName ?? (r.partner ? <Tag color="purple">{r.partner.name}</Tag> : null) },
        { title: 'Trạng thái', dataIndex: 'isActive', render: (v) => (v ? <Tag color="green">Hoạt động</Tag> : <Tag>Đã khóa</Tag>) },
      ]}
      renderForm={({ editing }) => (
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="username"
              label="Tên đăng nhập"
              extra={editing ? 'Đổi tên: người dùng đăng nhập lần sau bằng tên mới (mật khẩu giữ nguyên)' : 'Nên dùng số điện thoại'}
              normalize={(v?: string) => v?.replace(/\s/g, '')}
              rules={[
                { required: true, message: 'Nhập tên đăng nhập' },
                { min: 3, message: 'Tối thiểu 3 ký tự' },
                { max: 50, message: 'Tối đa 50 ký tự' },
              ]}
            >
              <Input autoComplete="off" />
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
            <Form.Item name="phone" label="SĐT" extra="Người dùng đăng nhập được bằng số này (mỗi số chỉ cho một tài khoản)">
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
                ) : (getFieldValue('roles') ?? []).includes('NHA_XE') ? (
                  <Form.Item
                    name="partnerId"
                    label="Thuộc nhà xe đối tác"
                    rules={[{ required: true, message: 'Chọn nhà xe' }]}
                    extra="Tài khoản này chỉ thấy cổng nhà xe: nhận / từ chối chuyến giao cho nhà xe, nhập xe & tài xế, xem công nợ. Không kèm vai trò khác."
                  >
                    <QuickSelect entity="partner" options={partnerOptions} />
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
