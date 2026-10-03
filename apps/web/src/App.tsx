import { Button, Flex, Result, Spin } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { AppLayout } from './components/AppLayout';
import BookingEditPage from './pages/BookingEditPage';
import BookingsPage from './pages/BookingsPage';
import CustomersPage from './pages/CustomersPage';
import DashboardPage from './pages/DashboardPage';
import DispatchPage from './pages/DispatchPage';
import DriversPage from './pages/DriversPage';
import LocationsPage from './pages/LocationsPage';
import LoginPage from './pages/LoginPage';
import PartnersPage from './pages/PartnersPage';
import PassengerListPage from './pages/PassengerListPage';
import QuotePage from './pages/QuotePage';
import RentalRatesPage from './pages/RentalRatesPage';
import RoutePricesPage from './pages/RoutePricesPage';
import ServicesPage from './pages/ServicesPage';
import SettingsPage from './pages/SettingsPage';
import SignPage from './pages/SignPage';
import SurchargesPage from './pages/SurchargesPage';
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
      {/* Trang in báo giá: không có menu */}
      <Route path="bookings/:id/quote" element={<QuotePage />} />
      <Route path="bookings/:id/passengers" element={<PassengerListPage />} />
      <Route path="bookings/:id/sign" element={<SignPage />} />
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="bookings/:id" element={<BookingEditPage />} />
        <Route path="dispatch" element={<DispatchPage />} />
        <Route path="route-prices" element={<RoutePricesPage />} />
        <Route path="rental-rates" element={<RentalRatesPage />} />
        <Route path="surcharges" element={<SurchargesPage />} />
        <Route path="vehicles" element={<VehiclesPage />} />
        <Route path="drivers" element={<DriversPage />} />
        <Route path="partners" element={<PartnersPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="locations" element={<LocationsPage />} />
        <Route path="vehicle-types" element={<VehicleTypesPage />} />
        <Route path="services" element={<ServicesPage />} />
        {hasRole('ADMIN') && <Route path="users" element={<UsersPage />} />}
        {hasRole('ADMIN') && <Route path="settings" element={<SettingsPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
