import { CarOutlined, IdcardOutlined, ShopOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Empty, Row, Statistic, Table, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ExpiryCell } from '../components/common';
import type { Customer, Driver, ExpiryAlert, Partner, Vehicle } from '../types';

export default function DashboardPage() {
  const vehicles = useQuery({ queryKey: ['/vehicles', {}], queryFn: () => api<Vehicle[]>('/vehicles') });
  const drivers = useQuery({ queryKey: ['/drivers', {}], queryFn: () => api<Driver[]>('/drivers') });
  const partners = useQuery({ queryKey: ['/partners', {}], queryFn: () => api<Partner[]>('/partners') });
  const customers = useQuery({ queryKey: ['/customers', {}], queryFn: () => api<Customer[]>('/customers') });
  const alerts = useQuery({ queryKey: ['/alerts/expiring'], queryFn: () => api<ExpiryAlert[]>('/alerts/expiring') });

  const companyVehicles = vehicles.data?.filter((v) => v.ownership === 'CONG_TY') ?? [];
  const ready = companyVehicles.filter((v) => v.status === 'SAN_SANG').length;
  const companyDrivers = drivers.data?.filter((d) => !d.partnerId && d.status === 'DANG_LAM').length ?? 0;

  const stats = [
    { title: 'Xe công ty', value: companyVehicles.length, suffix: `(${ready} sẵn sàng)`, icon: <CarOutlined />, to: '/vehicles' },
    { title: 'Lái xe công ty đang làm', value: companyDrivers, icon: <IdcardOutlined />, to: '/drivers' },
    { title: 'Nhà xe đối tác', value: partners.data?.filter((p) => p.isActive).length ?? 0, icon: <ShopOutlined />, to: '/partners' },
    { title: 'Khách hàng', value: customers.data?.filter((c) => c.isActive).length ?? 0, icon: <TeamOutlined />, to: '/customers' },
  ];

  return (
    <>
      <Row gutter={[16, 16]}>
        {stats.map((s) => (
          <Col xs={12} lg={6} key={s.title}>
            <Link to={s.to}>
              <Card hoverable>
                <Statistic title={s.title} value={s.value} prefix={s.icon} suffix={s.suffix && <small>{s.suffix}</small>} />
              </Card>
            </Link>
          </Col>
        ))}
      </Row>

      <Card style={{ marginTop: 16 }}>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Giấy tờ hết hạn hoặc sắp hết hạn (30 ngày tới)
        </Typography.Title>
        <Table<ExpiryAlert>
          rowKey={(r) => `${r.kind}-${r.id}-${r.document}`}
          size="small"
          loading={alerts.isLoading}
          dataSource={alerts.data}
          pagination={false}
          locale={{ emptyText: <Empty description="Không có giấy tờ nào sắp hết hạn" /> }}
          columns={[
            { title: 'Loại', dataIndex: 'kind', render: (v) => (v === 'XE' ? <Tag color="blue">Xe</Tag> : <Tag color="orange">Lái xe</Tag>) },
            {
              title: 'Xe / Lái xe',
              dataIndex: 'name',
              render: (v, r) => <Link to={r.kind === 'XE' ? '/vehicles' : '/drivers'}>{v}</Link>,
            },
            { title: 'Giấy tờ', dataIndex: 'document' },
            { title: 'Ngày hết hạn', dataIndex: 'expiry', render: (v) => <ExpiryCell value={v} /> },
            {
              title: 'Còn lại',
              dataIndex: 'daysLeft',
              render: (d: number) => (d < 0 ? <Tag color="red">Quá hạn {-d} ngày</Tag> : `${d} ngày`),
            },
          ]}
        />
      </Card>
    </>
  );
}
