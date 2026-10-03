import {
  BankOutlined,
  CalendarOutlined,
  CarOutlined,
  FileTextOutlined,
  NodeIndexOutlined,
  PercentageOutlined,
  PlusOutlined,
  ScheduleOutlined,
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
import { QUICK_ENTITIES, QuickCreateModal, type QuickEntity } from './QuickCreate';

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  roles?: Role[];
}

const NAV_GROUPS: { label?: string; roles?: Role[]; items: NavItem[] }[] = [
  {
    items: [
      { key: '/', label: 'Tổng quan', icon: <DashboardOutlined /> },
      { key: '/bookings', label: 'Booking', icon: <FileTextOutlined /> },
      { key: '/dispatch', label: 'Điều xe', icon: <ScheduleOutlined /> },
    ],
  },
  {
    label: 'Bảng giá',
    items: [
      { key: '/route-prices', label: 'Giá theo tuyến', icon: <NodeIndexOutlined /> },
      { key: '/rental-rates', label: 'Giá thuê theo ngày', icon: <CalendarOutlined /> },
      { key: '/surcharges', label: 'Phụ thu & ngày lễ', icon: <PercentageOutlined /> },
    ],
  },
  {
    label: 'Danh mục',
    items: [
      { key: '/vehicles', label: 'Xe', icon: <CarOutlined /> },
      { key: '/drivers', label: 'Lái xe', icon: <IdcardOutlined /> },
      { key: '/partners', label: 'Nhà xe đối tác', icon: <ShopOutlined /> },
      { key: '/customers', label: 'Khách hàng', icon: <TeamOutlined /> },
      { key: '/locations', label: 'Địa điểm', icon: <EnvironmentOutlined /> },
      { key: '/vehicle-types', label: 'Loại xe', icon: <SettingOutlined /> },
    ],
  },
  {
    label: 'Hệ thống',
    roles: ['ADMIN'],
    items: [
      { key: '/users', label: 'Người dùng', icon: <UserOutlined /> },
      { key: '/settings', label: 'Thông tin công ty', icon: <BankOutlined /> },
    ],
  },
];

const NAV = NAV_GROUPS.flatMap((g) => g.items);

export function AppLayout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [quickEntity, setQuickEntity] = useState<QuickEntity | null>(null);

  // Menu "Tạo nhanh": chỉ hiện mục người dùng có quyền tạo
  const quickItems = [
    ...(hasRole('ADMIN', 'DIEU_HANH', 'KINH_DOANH')
      ? [{ key: 'booking', icon: <FileTextOutlined />, label: 'Booking mới', onClick: () => navigate('/bookings/new') }, { type: 'divider' as const }]
      : []),
    ...(
      [
        ['customer', <TeamOutlined key="c" />, 'Khách hàng'],
        ['vehicle', <CarOutlined key="v" />, 'Xe'],
        ['driver', <IdcardOutlined key="d" />, 'Lái xe'],
        ['partner', <ShopOutlined key="p" />, 'Nhà xe đối tác'],
        ['location', <EnvironmentOutlined key="l" />, 'Địa điểm'],
      ] as [QuickEntity, ReactNode, string][]
    )
      .filter(([e]) => hasRole(...QUICK_ENTITIES[e].roles))
      .map(([e, icon, label]) => ({ key: e, icon, label, onClick: () => setQuickEntity(e) })),
  ];

  const items = NAV_GROUPS.filter((g) => !g.roles || hasRole(...g.roles)).map((g, i) => {
    const children = g.items.map(({ key, label, icon }) => ({ key, label, icon }));
    return g.label ? { type: 'group' as const, key: `g${i}`, label: g.label, children } : { type: 'group' as const, key: `g${i}`, children };
  });
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
          <Space size={isMobile ? 8 : 16}>
          {quickItems.length > 0 && (
            <Dropdown menu={{ items: quickItems }} trigger={['click']}>
              <Button type="primary" icon={<PlusOutlined />}>
                {isMobile ? '' : 'Tạo nhanh'}
              </Button>
            </Dropdown>
          )}
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
          </Space>
        </Layout.Header>
        <Layout.Content style={{ padding: isMobile ? 12 : 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
      <QuickCreateModal entity={quickEntity} open={!!quickEntity} onClose={() => setQuickEntity(null)} />
    </Layout>
  );
}
