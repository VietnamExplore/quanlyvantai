import {
  AppstoreOutlined,
  BarChartOutlined,
  BankOutlined,
  BookOutlined,
  TagsOutlined,
  WalletOutlined,
  DollarOutlined,
  DatabaseOutlined,
  HistoryOutlined,
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
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Drawer, Dropdown, Flex, Grid, Layout, Menu, Space } from 'antd';
import { useState, type ReactNode, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ROLE } from '../labels';
import type { Role } from '../types';
import { BRAND } from '../theme';
import { ChangePasswordModal } from './ChangePasswordModal';
import { NotificationBell } from './NotificationBell';
import { useSettings } from './common';
import { logoUrl } from './PrintDoc';
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
      { key: '/shuttle', label: 'Xe ghép', icon: <NodeIndexOutlined /> },
      { key: '/reports', label: 'Báo cáo', icon: <BarChartOutlined /> },
    ],
  },
  {
    label: 'Tài chính',
    items: [
      { key: '/finance/receivables', label: 'Công nợ khách hàng', icon: <WalletOutlined /> },
      { key: '/finance/payables', label: 'Công nợ nhà xe', icon: <ShopOutlined />, roles: ['ADMIN', 'KE_TOAN', 'DIEU_HANH'] },
      { key: '/finance/ledger', label: 'Sổ thu chi', icon: <BookOutlined />, roles: ['ADMIN', 'KE_TOAN', 'DIEU_HANH'] },
      { key: '/finance/advances', label: 'Tạm ứng lái xe', icon: <DollarOutlined />, roles: ['ADMIN', 'KE_TOAN'] },
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
      { key: '/services', label: 'Dịch vụ', icon: <AppstoreOutlined /> },
      { key: '/shuttle-routes', label: 'Tuyến xe ghép', icon: <NodeIndexOutlined /> },
      { key: '/cost-categories', label: 'Loại chi phí', icon: <TagsOutlined /> },
      { key: '/customer-sources', label: 'Nguồn khách', icon: <TagsOutlined /> },
    ],
  },
  {
    label: 'Hệ thống',
    roles: ['ADMIN'],
    items: [
      { key: '/users', label: 'Người dùng', icon: <UserOutlined /> },
      { key: '/settings', label: 'Thông tin công ty', icon: <BankOutlined /> },
      { key: '/audit-logs', label: 'Nhật ký thao tác', icon: <HistoryOutlined /> },
      { key: '/system', label: 'Sao lưu & dọn dẹp', icon: <DatabaseOutlined /> },
    ],
  },
];

const NAV = NAV_GROUPS.flatMap((g) => g.items.map((n) => ({ ...n, group: g.label })));

const COLLAPSE_KEY = 'app_sider_collapsed';
/** Màn hình rộng dưới mức này: menu trái mặc định thu gọn để nhường chỗ cho bảng */
const AUTO_COLLAPSE_WIDTH = 1440;
const savedCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY);
  } catch {
    return null;
  }
};
// Người dùng đã tự chọn thì giữ theo lựa chọn; chưa chọn thì tùy độ rộng cửa sổ
const readCollapsed = () => {
  const saved = savedCollapsed();
  return saved === null ? window.innerWidth < AUTO_COLLAPSE_WIDTH : saved === '1';
};

/** Chữ viết tắt cho ảnh đại diện: "Nguyễn Tiến Vũ" → "NV" */
const initials = (name?: string) => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts.length > 1 ? parts[parts.length - 1][0] : '') + parts[0][0]).toUpperCase();
};

/** Biểu tượng thương hiệu: logo công ty nếu đã tải lên, không thì biểu tượng xe */
function BrandMark({ size = 36 }: { size?: number }) {
  const settings = useSettings();
  const logo = logoUrl(settings);
  return (
    <span
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: 10,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: logo ? '#ffffff' : `linear-gradient(135deg, ${BRAND.primary}, #60a5fa)`,
        boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
        overflow: 'hidden',
      }}
    >
      {logo ? <img src={logo} alt="" style={{ width: '86%', height: '86%', objectFit: 'contain' }} /> : <CarOutlined style={{ color: '#fff', fontSize: size * 0.5 }} />}
    </span>
  );
}

export function AppLayout() {
  const { user, logout, hasRole } = useAuth();
  const settings = useSettings();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // Đổi kích thước cửa sổ: menu tự thu gọn / mở rộng theo (nếu người dùng chưa tự chọn)
  useEffect(() => {
    const onResize = () => savedCollapsed() === null && setCollapsed(window.innerWidth < AUTO_COLLAPSE_WIDTH);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [quickEntity, setQuickEntity] = useState<QuickEntity | null>(null);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* bỏ qua */
      }
      return !c;
    });

  // Menu "Tạo nhanh": chỉ hiện mục người dùng có quyền tạo
  const docItems = [
    ...(hasRole('ADMIN', 'DIEU_HANH', 'KINH_DOANH')
      ? [
          { key: 'booking', icon: <FileTextOutlined />, label: 'Booking mới', onClick: () => navigate('/bookings/new') },
          { key: 'dispatch', icon: <ScheduleOutlined />, label: 'Lệnh điều xe', onClick: () => navigate('/dispatch?create=1') },
        ]
      : []),
    ...(hasRole('ADMIN', 'KE_TOAN', 'DIEU_HANH')
      ? [{ key: 'voucher', icon: <BookOutlined />, label: 'Phiếu thu chi', onClick: () => navigate('/finance/ledger?create=1') }]
      : []),
  ];
  const quickItems = [
    ...docItems,
    ...(docItems.length ? [{ type: 'divider' as const }] : []),
    ...(
      [
        ['customer', <TeamOutlined key="c" />, 'Khách hàng'],
        ['vehicle', <CarOutlined key="v" />, 'Xe'],
        ['driver', <IdcardOutlined key="d" />, 'Lái xe'],
        ['partner', <ShopOutlined key="p" />, 'Nhà xe đối tác'],
        ['location', <EnvironmentOutlined key="l" />, 'Địa điểm'],
        ['service', <AppstoreOutlined key="s" />, 'Dịch vụ'],
      ] as [QuickEntity, ReactNode, string][]
    )
      .filter(([e]) => hasRole(...QUICK_ENTITIES[e].roles))
      .map(([e, icon, label]) => ({ key: e, icon, label, onClick: () => setQuickEntity(e) })),
  ];

  // Số đề nghị tạm ứng chờ duyệt: hiện cạnh menu, tự cập nhật mỗi phút
  const canApprove = hasRole('ADMIN', 'KE_TOAN');
  const { data: advancePending } = useQuery({
    queryKey: ['/advance-requests', 'pending-count'],
    queryFn: () => api<{ count: number }>('/advance-requests/pending-count'),
    enabled: canApprove,
    refetchInterval: 60_000,
  });
  const badge = (key: string, label: string) =>
    key === '/finance/advances' && advancePending?.count ? (
      <Flex justify="space-between" align="center" gap={8}>
        {label}
        <Badge count={advancePending.count} size="small" />
      </Flex>
    ) : (
      label
    );
  const items = NAV_GROUPS.filter((g) => !g.roles || hasRole(...g.roles)).map((g, i) => {
    const children = g.items.filter((n) => !n.roles || hasRole(...n.roles)).map(({ key, label, icon }) => ({ key, label: badge(key, label), icon }));
    return g.label ? { type: 'group' as const, key: `g${i}`, label: g.label, children } : { type: 'group' as const, key: `g${i}`, children };
  });
  const matched = NAV.filter((n) => (n.key === '/' ? pathname === '/' : pathname.startsWith(n.key))).sort((a, b) => b.key.length - a.key.length);
  const current = matched[0];
  const selected = current ? [current.key] : [pathname];

  // Tiêu đề trên thanh trên cùng
  const pageTitle =
    pathname === '/bookings/new' ? 'Booking mới' : /^\/bookings\/\d+/.test(pathname) ? 'Chi tiết booking' : (current?.label ?? 'Quản lý vận tải');
  const pageGroup = /^\/bookings\/(new|\d+)/.test(pathname) ? 'Booking' : current?.group;

  const narrow = collapsed && !isMobile;
  const brand = (
    <Flex align="center" gap={12} style={{ padding: narrow ? '18px 0' : '18px 20px', justifyContent: narrow ? 'center' : 'flex-start', cursor: 'pointer' }} onClick={() => navigate('/')}>
      <BrandMark />
      {!narrow && (
        <div style={{ minWidth: 0, lineHeight: 1.25 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>Quản lý vận tải</div>
          <div style={{ color: 'rgba(148,163,184,.85)', fontSize: 12, lineHeight: 1.35, marginTop: 2, wordBreak: 'break-word' }}>
            {settings.companyName || 'Vận chuyển hành khách'}
          </div>
        </div>
      )}
    </Flex>
  );

  const menu = (
    <Menu
      theme="dark"
      mode="inline"
      inlineCollapsed={narrow}
      items={items}
      selectedKeys={selected}
      onClick={({ key }) => {
        navigate(key);
        setDrawerOpen(false);
      }}
      style={{ borderInlineEnd: 0, background: 'transparent' }}
    />
  );

  const roleText = user?.roles.map((r) => ROLE[r].label).join(', ');

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Layout.Sider
          className="app-sider"
          width={256}
          collapsedWidth={80}
          collapsed={collapsed}
          trigger={null}
          style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}
        >
          {brand}
          <div className="app-sider-scroll">{menu}</div>
          <Flex
            align="center"
            justify={narrow ? 'center' : 'flex-start'}
            gap={10}
            onClick={toggleCollapsed}
            style={{ padding: '14px 24px', borderTop: '1px solid rgba(148,163,184,.12)', color: 'rgba(226,232,240,.6)', cursor: 'pointer', fontSize: 13 }}
          >
            {narrow ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            {!narrow && 'Thu gọn menu'}
          </Flex>
        </Layout.Sider>
      )}
      <Drawer
        className="app-sider"
        open={isMobile && drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="left"
        size={270}
        styles={{ body: { padding: 0, background: BRAND.navy }, header: { display: 'none' } }}
        closable={false}
      >
        {brand}
        {menu}
      </Drawer>

      <Layout style={{ minWidth: 0 }}>
        <Layout.Header className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: isMobile ? '0 12px' : '0 24px' }}>
          <Flex align="center" gap={12} style={{ minWidth: 0 }}>
            {isMobile && <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />}
            <div style={{ minWidth: 0, lineHeight: 1.2 }}>
              {pageGroup && !isMobile && <div style={{ fontSize: 12, color: BRAND.muted }}>{pageGroup}</div>}
              <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: BRAND.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pageTitle}</div>
            </div>
          </Flex>
          <Space size={isMobile ? 8 : 14}>
            <NotificationBell />
            {quickItems.length > 0 && (
              <Dropdown menu={{ items: quickItems }} trigger={['click']} placement="bottomRight">
                <Button type="primary" icon={<PlusOutlined />}>
                  {isMobile ? '' : 'Tạo nhanh'}
                </Button>
              </Dropdown>
            )}
            <Dropdown
              placement="bottomRight"
              menu={{
                items: [
                  { key: 'me', label: <div style={{ padding: '2px 0' }}><b>{user?.fullName}</b><div style={{ fontSize: 12, color: BRAND.muted }}>{roleText}</div></div>, disabled: true },
                  { type: 'divider' },
                  { key: 'pwd', icon: <KeyOutlined />, label: 'Đổi mật khẩu', onClick: () => setPwdOpen(true) },
                  { type: 'divider' },
                  { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true, onClick: logout },
                ],
              }}
            >
              <Flex align="center" gap={10} style={{ cursor: 'pointer', padding: '4px 6px 4px 4px', borderRadius: 999 }}>
                <Avatar style={{ background: `linear-gradient(135deg, ${BRAND.primary}, #7c3aed)`, fontWeight: 600 }}>{initials(user?.fullName)}</Avatar>
                {!isMobile && (
                  <div style={{ lineHeight: 1.2, maxWidth: 220 }}>
                    <div style={{ fontWeight: 600, color: BRAND.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.fullName}</div>
                    <div style={{ fontSize: 12, color: BRAND.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{roleText}</div>
                  </div>
                )}
              </Flex>
            </Dropdown>
          </Space>
        </Layout.Header>
        <Layout.Content className="app-content" style={{ padding: isMobile ? 12 : screens.xxl ? 24 : 16 }}>
          <div key={pathname} className="app-page-enter" style={{ maxWidth: 2000, margin: '0 auto' }}>
            <Outlet />
          </div>
        </Layout.Content>
      </Layout>
      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
      <QuickCreateModal entity={quickEntity} open={!!quickEntity} onClose={() => setQuickEntity(null)} />
    </Layout>
  );
}
