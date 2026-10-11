import { Button, Flex, Result, Spin } from 'antd';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { isPartnerArea } from './api';
import { isPartnerOnly, useAuth } from './auth';
import { AppLayout } from './components/AppLayout';
import AdvancesPage from './pages/AdvancesPage';
import AuditLogPage from './pages/AuditLogPage';
import SystemPage from './pages/SystemPage';
import PartnerPortalPage from './pages/PartnerPortalPage';
import BookingEditPage from './pages/BookingEditPage';
import BookingsPage from './pages/BookingsPage';
import CostCategoriesPage from './pages/CostCategoriesPage';
import CustomersPage from './pages/CustomersPage';
import LedgerPage from './pages/LedgerPage';
import ReportsPage from './pages/ReportsPage';
import PayablesPage from './pages/PayablesPage';
import ReceivablesPage from './pages/ReceivablesPage';
import DashboardPage from './pages/DashboardPage';
import DispatchPage from './pages/DispatchPage';
import DriversPage from './pages/DriversPage';
import LocationsPage from './pages/LocationsPage';
import LoginPage from './pages/LoginPage';
import PartnersPage from './pages/PartnersPage';
import PassengerListPage from './pages/PassengerListPage';
import QuotePage from './pages/QuotePage';
import ContractPage from './pages/ContractPage';
import PublicContractPage from './pages/PublicContractPage';
import TransportOrderPage from './pages/TransportOrderPage';
import RentalRatesPage from './pages/RentalRatesPage';
import RoutePricesPage from './pages/RoutePricesPage';
import ServicesPage from './pages/ServicesPage';
import ShuttlePage from './pages/ShuttlePage';
import FieldPage from './pages/FieldPage';
import GpsPage from './pages/GpsPage';
import ShuttleRoutesPage from './pages/ShuttleRoutesPage';
import CustomerSourcesPage from './pages/CustomerSourcesPage';
import CustomerTypesPage from './pages/CustomerTypesPage';
import SettingsPage from './pages/SettingsPage';
import SignPage from './pages/SignPage';
import SurchargesPage from './pages/SurchargesPage';
import UsersPage from './pages/UsersPage';
import VehicleTypesPage from './pages/VehicleTypesPage';
import VehiclesPage from './pages/VehiclesPage';

export default function App() {
  const { user, loading, logout, hasRole } = useAuth();
  const { pathname } = useLocation();

  // Hợp đồng vận chuyển điện tử: mở bằng mã bí mật, không cần đăng nhập (lái xe xuất trình, khách xác nhận)
  const publicContract = /^\/e\/hd\/([A-Za-z0-9_-]+)\/?$/.exec(pathname);
  if (publicContract) return <PublicContractPage token={publicContract[1]} />;
  // Lệnh vận chuyển điện tử (lái xe mở từ app)
  const publicOrder = /^\/e\/lvc\/(trip|run)\/(\d+)\/([\w-]+)\/?$/.exec(pathname);
  if (publicOrder) return <TransportOrderPage publicOrder={{ kind: publicOrder[1], id: publicOrder[2], sig: publicOrder[3] }} />;

  if (loading) {
    return (
      <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
        <Spin size="large" />
      </Flex>
    );
  }

  if (!user) return <LoginPage />;

  // Cổng nhà xe (/partner) có phiên riêng: tài khoản văn phòng đăng nhập ở đây thì hướng dẫn mở phần mềm văn phòng
  if (isPartnerArea() && !isPartnerOnly(user)) {
    return (
      <Result
        status="info"
        title="Đây là cổng dành cho nhà xe đối tác"
        subTitle={`Tài khoản ${user.fullName} là tài khoản văn phòng. Mở phần mềm văn phòng, hoặc đăng xuất để đăng nhập bằng tài khoản nhà xe.`}
        extra={[
          <Button key="office" type="primary" href="/">
            Mở phần mềm văn phòng
          </Button>,
          <Button key="out" onClick={logout}>
            Đăng xuất khỏi cổng nhà xe
          </Button>,
        ]}
      />
    );
  }

  // Tài khoản nhà xe đối tác: chỉ có cổng nhận chuyến của nhà xe
  if (hasRole('NHA_XE') && !hasRole('ADMIN', 'DIEU_HANH', 'KINH_DOANH', 'KE_TOAN')) {
    return (
      <Routes>
        <Route path="partner" element={<PartnerPortalPage />} />
        <Route path="*" element={<Navigate to="/partner" replace />} />
      </Routes>
    );
  }

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
      <Route path="bookings/:id/contract" element={<ContractPage />} />
      <Route path="transport-orders/:kind/:id" element={<TransportOrderPage />} />
      <Route path="bookings/:id/sign" element={<SignPage />} />
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="bookings/:id" element={<BookingEditPage />} />
        <Route path="dispatch" element={<DispatchPage />} />
        <Route path="shuttle" element={<ShuttlePage />} />
        <Route path="field" element={<FieldPage />} />
        <Route path="gps" element={<GpsPage />} />
        <Route path="shuttle-routes" element={<ShuttleRoutesPage />} />
        <Route path="reports" element={<ReportsPage />} />
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
        <Route path="cost-categories" element={<CostCategoriesPage />} />
        <Route path="customer-sources" element={<CustomerSourcesPage />} />
        <Route path="customer-types" element={<CustomerTypesPage />} />
        <Route path="finance/receivables" element={<ReceivablesPage />} />
        {hasRole('ADMIN', 'KE_TOAN', 'DIEU_HANH') && <Route path="finance/payables" element={<PayablesPage />} />}
        {hasRole('ADMIN', 'KE_TOAN', 'DIEU_HANH') && <Route path="finance/ledger" element={<LedgerPage />} />}
        {hasRole('ADMIN', 'KE_TOAN') && <Route path="finance/advances" element={<AdvancesPage />} />}
        {hasRole('ADMIN') && <Route path="users" element={<UsersPage />} />}
        {hasRole('ADMIN') && <Route path="settings" element={<SettingsPage />} />}
        {hasRole('ADMIN') && <Route path="audit-logs" element={<AuditLogPage />} />}
        {hasRole('ADMIN') && <Route path="system" element={<SystemPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
