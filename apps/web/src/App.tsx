import { Button, Flex, Result, Spin } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { AppLayout } from './components/AppLayout';
import CustomersPage from './pages/CustomersPage';
import DashboardPage from './pages/DashboardPage';
import DriversPage from './pages/DriversPage';
import LocationsPage from './pages/LocationsPage';
import LoginPage from './pages/LoginPage';
import PartnersPage from './pages/PartnersPage';
import UsersPage from './pages/UsersPage';
import VehicleTypesPage from './pages/VehicleTypesPage';
import VehiclesPage from './pages/VehiclesPage';

export default function App() {
  const { user, loading, logout, hasRole } = useAuth();

  if (loading) {
    return (
      <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
        <Spin size="large" />
      </Flex>
    );
  }

  if (!user) return <LoginPage />;

  if (!hasRole('ADMIN', 'DIEU_HANH', 'KINH_DOANH', 'KE_TOAN')) {
    return (
      <Result
        status="info"
        title="Tài khoản lái xe"
        subTitle="Vui lòng dùng ứng dụng trên điện thoại để nhận chuyến."
        extra={<Button onClick={logout}>Đăng xuất</Button>}
      />
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="vehicles" element={<VehiclesPage />} />
        <Route path="drivers" element={<DriversPage />} />
        <Route path="partners" element={<PartnersPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="locations" element={<LocationsPage />} />
        <Route path="vehicle-types" element={<VehicleTypesPage />} />
        {hasRole('ADMIN') && <Route path="users" element={<UsersPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
