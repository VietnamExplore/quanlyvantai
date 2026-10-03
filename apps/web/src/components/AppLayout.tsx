import {
  CarOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  IdcardOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuOutlined,
  SettingOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Drawer, Dropdown, Grid, Layout, Menu, Space, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { ROLE } from '../labels';
import type { Role } from '../types';
import { ChangePasswordModal } from './ChangePasswordModal';

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  roles?: Role[];
}

const NAV: NavItem[] = [
  { key: '/', label: 'Tổng quan', icon: <DashboardOutlined /> },
  { key: '/vehicles', label: 'Xe', icon: <CarOutlined /> },
  { key: '/drivers', label: 'Lái xe', icon: <IdcardOutlined /> },
  { key: '/partners', label: 'Nhà xe đối tác', icon: <ShopOutlined /> },
  { key: '/customers', label: 'Khách hàng', icon: <TeamOutlined /> },
  { key: '/locations', label: 'Địa điểm', icon: <EnvironmentOutlined /> },
  { key: '/vehicle-types', label: 'Loại xe', icon: <SettingOutlined /> },
  { key: '/users', label: 'Người dùng', icon: <UserOutlined />, roles: ['ADMIN'] },
];

export function AppLayout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  const items = NAV.filter((n) => !n.roles || hasRole(...n.roles)).map(({ key, label, icon }) => ({ key, label, icon }));
  const selected = NAV.filter((n) => n.key !== '/' && pathname.startsWith(n.key)).map((n) => n.key);

  const menu = (
    <Menu
      mode="inline"
      items={items}
      selectedKeys={selected.length ? selected : [pathname]}
      onClick={({ key }) => {
        navigate(key);
        setDrawerOpen(false);
      }}
      style={{ borderInlineEnd: 0 }}
    />
  );

  const brand = (
    <Typography.Title level={5} style={{ margin: 0, padding: '16px 24px', whiteSpace: 'nowrap' }}>
      🚐 Quản lý vận tải
    </Typography.Title>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Layout.Sider width={220} theme="light" style={{ borderRight: '1px solid var(--ant-color-border-secondary)' }}>
          {brand}
          {menu}
        </Layout.Sider>
      )}
      <Drawer open={isMobile && drawerOpen} onClose={() => setDrawerOpen(false)} placement="left" size={240} styles={{ body: { padding: 0 } }} title={null} closable={false}>
        {brand}
        {menu}
      </Drawer>

      <Layout>
        <Layout.Header
          style={{
            background: 'var(--ant-color-bg-container)',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--ant-color-border-secondary)',
          }}
        >
          {isMobile ? <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} /> : <span />}
          <Dropdown
            menu={{
              items: [
                { key: 'pwd', icon: <KeyOutlined />, label: 'Đổi mật khẩu', onClick: () => setPwdOpen(true) },
                { type: 'divider' },
                { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true, onClick: logout },
              ],
            }}
          >
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} />
              {!isMobile && (
                <span>
                  <b>{user?.fullName}</b>{' '}
                  <Typography.Text type="secondary">· {user?.roles.map((r) => ROLE[r].label).join(', ')}</Typography.Text>
                </span>
              )}
            </Space>
          </Dropdown>
        </Layout.Header>
        <Layout.Content style={{ padding: isMobile ? 12 : 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </Layout>
  );
}
