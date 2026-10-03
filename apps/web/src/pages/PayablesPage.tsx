import { DeleteOutlined, DollarOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Flex, Popconfirm, Row, Statistic, Table, Tabs, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { fmtTime } from '../booking-utils';
import { DATE_FORMAT, EnumTag, formatVnd, Money } from '../components/common';
import { PaymentModal } from '../components/finance';
import { downloadExcel } from '../excel';
import { PAYMENT_METHOD, TRIP_STATUS } from '../labels';
import type { Payment, TripStatus } from '../types';

interface PayTrip {
  id: number;
  pickupTime: string;
  pickupAddress: string;
  dropoffAddress: string | null;
  partnerPlate: string | null;
  partnerCost: string | null;
  status: TripStatus;
  booking: { id: number; code: string };
  vehicleType: { name: string };
}

interface PayPartner {
  id: number;
  name: string;
  phone: string | null;
  bankName: string | null;
  bankAccount: string | null;
  tripCount: number;
  totalCost: number;
  totalPaid: number;
  balance: number;
  trips: PayTrip[];
  payments: Payment[];
}

export default function PayablesPage() {
  const { hasRole } = useAuth();
  const canPay = hasRole('ADMIN', 'KE_TOAN');
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState<PayPartner | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['/finance', 'payables'],
    queryFn: () => api<{ totalBalance: number; partners: PayPartner[] }>('/finance/payables'),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/finance'] });
    queryClient.invalidateQueries({ queryKey: ['/reports/summary'] });
  };

  async function removePayment(id: number) {
    try {
      await api(`/partner-payments/${id}`, { method: 'DELETE' });
      message.success('Đã xóa');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  function exportCsv() {
    downloadExcel(`cong-no-nha-xe-${dayjs().format('YYYYMMDD')}.xlsx`, [
      {
        name: 'Công nợ nhà xe',
        title: `CÔNG NỢ NHÀ XE ĐỐI TÁC – ngày ${dayjs().format('DD/MM/YYYY')}`,
        headers: ['Nhà xe', 'Ngày chạy', 'Booking', 'Hành trình', 'Biển số', 'Giá thuê', 'Trạng thái'],
        sumColumns: [5],
        totalLabel: 'Tổng cộng',
        rows: (data?.partners ?? []).flatMap((p) =>
          p.trips.map((t) => [
            p.name,
            dayjs(t.pickupTime).format('DD/MM/YYYY HH:mm'),
            t.booking.code,
            [t.pickupAddress, t.dropoffAddress].filter(Boolean).join(' → '),
            t.partnerPlate,
            Number(t.partnerCost ?? 0),
            TRIP_STATUS[t.status].label,
          ]),
        ),
      },
    ]);
  }

  return (
    <Flex vertical gap={16}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={8}>
          <Card>
            <Statistic title="Tổng còn phải trả nhà xe" value={data?.totalBalance ?? 0} formatter={(v) => `${formatVnd(Number(v))} đ`} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card>
            <Statistic title="Số nhà xe còn nợ" value={(data?.partners ?? []).filter((p) => p.balance > 0).length} />
          </Card>
        </Col>
      </Row>

      <Card>
        <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Công nợ nhà xe đối tác
          </Typography.Title>
          <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!data?.partners.length}>
            Xuất Excel đối soát
          </Button>
        </Flex>
        <Table<PayPartner>
          rowKey="id"
          loading={isLoading}
          dataSource={data?.partners ?? []}
          scroll={{ x: 'max-content' }}
          pagination={false}
          locale={{ emptyText: 'Chưa có chuyến nào giao cho nhà xe đối tác' }}
          expandable={{
            expandRowByClick: true,
            expandedRowRender: (p) => (
              <Tabs
                size="small"
                items={[
                  {
                    key: 'trips',
                    label: `Chuyến (${p.trips.length})`,
                    children: (
                      <Table<PayTrip>
                        rowKey="id"
                        size="small"
                        pagination={{ pageSize: 20, hideOnSinglePage: true }}
                        dataSource={p.trips}
                        columns={[
                          { title: 'Ngày chạy', render: (_, t) => fmtTime(t.pickupTime) },
                          { title: 'Booking', render: (_, t) => <Link to={`/bookings/${t.booking.id}`}>{t.booking.code}</Link> },
                          { title: 'Hành trình', render: (_, t) => [t.pickupAddress, t.dropoffAddress].filter(Boolean).join(' → ') },
                          { title: 'Xe', render: (_, t) => t.partnerPlate ?? t.vehicleType.name },
                          { title: 'Trạng thái', dataIndex: 'status', render: (v) => <EnumTag labels={TRIP_STATUS} value={v} /> },
                          { title: 'Giá thuê', dataIndex: 'partnerCost', align: 'right', render: (v) => <Money value={v} /> },
                        ]}
                      />
                    ),
                  },
                  {
                    key: 'payments',
                    label: `Đã thanh toán (${p.payments.length})`,
                    children: (
                      <Table<Payment>
                        rowKey="id"
                        size="small"
                        pagination={false}
                        dataSource={p.payments}
                        locale={{ emptyText: 'Chưa thanh toán lần nào' }}
                        columns={[
                          { title: 'Ngày', dataIndex: 'paidAt', render: (v) => dayjs(v).format(DATE_FORMAT) },
                          { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (v) => <Money value={v} strong /> },
                          { title: 'Hình thức', dataIndex: 'method', render: (v) => <EnumTag labels={PAYMENT_METHOD} value={v} /> },
                          { title: 'Chứng từ', dataIndex: 'reference' },
                          { title: 'Ghi chú', dataIndex: 'note' },
                          { title: 'Người ghi', render: (_, x) => x.createdBy?.fullName },
                          ...(canPay
                            ? [
                                {
                                  key: 'del',
                                  width: 44,
                                  render: (_: unknown, x: Payment) => (
                                    <Popconfirm title="Xóa lần thanh toán này?" okText="Xóa" cancelText="Không" onConfirm={() => removePayment(x.id)}>
                                      <Button type="text" danger icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                  ),
                                },
                              ]
                            : []),
                        ]}
                      />
                    ),
                  },
                ]}
              />
            ),
          }}
          columns={[
            {
              title: 'Nhà xe',
              render: (_, p) => (
                <>
                  <b>{p.name}</b>
                  <div>
                    <Typography.Text type="secondary">{[p.phone, p.bankName && p.bankAccount ? `${p.bankName} ${p.bankAccount}` : null].filter(Boolean).join(' · ')}</Typography.Text>
                  </div>
                </>
              ),
            },
            { title: 'Số chuyến', dataIndex: 'tripCount', align: 'center' },
            { title: 'Tổng tiền thuê', dataIndex: 'totalCost', align: 'right', render: (v) => formatVnd(v) },
            { title: 'Đã trả', dataIndex: 'totalPaid', align: 'right', render: (v) => formatVnd(v) },
            {
              title: 'Còn phải trả',
              dataIndex: 'balance',
              align: 'right',
              render: (v) => <Typography.Text strong type={v > 0 ? 'danger' : undefined}>{formatVnd(v)} đ</Typography.Text>,
            },
            ...(canPay
              ? [
                  {
                    key: 'pay',
                    render: (_: unknown, p: PayPartner) => (
                      <Button
                        size="small"
                        type="primary"
                        ghost
                        icon={<DollarOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaying(p);
                        }}
                      >
                        Thanh toán
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>

      <PaymentModal
        open={!!paying}
        title={`Thanh toán cho ${paying?.name ?? ''}`}
        defaultAmount={paying?.balance}
        hint={
          paying && (
            <Typography.Paragraph type="secondary">
              Còn phải trả: {formatVnd(paying.balance)} đ
              {paying.bankAccount && ` · Chuyển khoản: ${paying.bankName ?? ''} ${paying.bankAccount}`}
            </Typography.Paragraph>
          )
        }
        onClose={() => setPaying(null)}
        onSubmit={async (v) => {
          try {
            await api(`/partners/${paying!.id}/payments`, { method: 'POST', body: v });
            message.success('Đã ghi nhận thanh toán');
            refresh();
          } catch (e) {
            message.error((e as Error).message);
            throw e;
          }
        }}
      />
    </Flex>
  );
}
