import { DollarOutlined, DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Checkbox, Col, Flex, Input, Row, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { DATE_FORMAT, EnumTag, formatVnd, Money, paged } from '../components/common';
import { PaymentModal } from '../components/finance';
import { downloadExcel } from '../excel';
import { BOOKING_STATUS, CUSTOMER_TYPE } from '../labels';
import type { BookingStatus, CustomerType } from '../types';

interface RecBooking {
  id: number;
  code: string;
  customerRef: string | null;
  status: BookingStatus;
  salesUser: string | null;
  firstPickup: string | null;
  dueDate: string;
  overdueDays: number;
  total: number;
  paid: number;
  balance: number;
  /** Booking chưa nhập giá (tổng 0 đ, chưa thu) – vẫn coi là còn nợ */
  unpriced: boolean;
}

interface RecCustomer {
  key: string;
  customerId: number | null;
  name: string;
  phone: string | null;
  customerType: CustomerType;
  creditLimit: number | null;
  totalBilled: number;
  totalPaid: number;
  balance: number;
  overdue: number;
  maxOverdueDays: number;
  /** Số booking chưa nhập giá */
  unpriced: number;
  overLimit: boolean;
  bookings: RecBooking[];
}

/** Khách còn nợ: còn tiền phải thu, hoặc có booking chưa nhập giá (chưa biết phải thu bao nhiêu) */
const owes = (c: RecCustomer) => Math.round(c.balance) > 0 || c.unpriced > 0;
const bookingOwes = (b: RecBooking) => Math.round(b.balance) > 0 || b.unpriced;
const UNPRICED_TAG = (
  <Tooltip title="Booking có tổng tiền 0 đ: chưa nhập giá nên chưa xác định được số phải thu. Mở booking để nhập giá.">
    <Tag color="orange">Chưa nhập giá</Tag>
  </Tooltip>
);

interface Receivables {
  totalBalance: number;
  totalOverdue: number;
  customers: RecCustomer[];
}

export default function ReceivablesPage() {
  const { hasRole } = useAuth();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canCollect = hasRole('ADMIN', 'KE_TOAN', 'KINH_DOANH');
  const [q, setQ] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyDebt, setOnlyDebt] = useState(false);
  const [collect, setCollect] = useState<RecBooking | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['/finance', 'receivables'], queryFn: () => api<Receivables>('/finance/receivables') });

  const customers = (data?.customers ?? []).filter(
    (c) =>
      (!q || `${c.name} ${c.phone ?? ''}`.toLowerCase().includes(q.toLowerCase())) && (!onlyOverdue || c.overdue > 0) && (!onlyDebt || owes(c)),
  );

  function exportCsv() {
    downloadExcel(`cong-no-khach-hang-${dayjs().format('YYYYMMDD')}.xlsx`, [
      {
        name: 'Công nợ khách hàng',
        title: `CÔNG NỢ KHÁCH HÀNG – ngày ${dayjs().format('DD/MM/YYYY')}`,
        headers: ['Khách hàng', 'SĐT', 'Booking', 'Mã của khách', 'Ngày đi', 'NV kinh doanh', 'Tổng tiền', 'Đã thu', 'Còn nợ', 'Hạn thanh toán', 'Quá hạn (ngày)', 'Ghi chú'],
        sumColumns: [6, 7, 8],
        totalLabel: 'Tổng cộng',
        rows: customers.flatMap((c) =>
          c.bookings.map((b) => [
            c.name,
            c.phone,
            b.code,
            b.customerRef,
            b.firstPickup ? dayjs(b.firstPickup).format(DATE_FORMAT) : '',
            b.salesUser,
            b.total,
            b.paid,
            b.balance,
            dayjs(b.dueDate).format(DATE_FORMAT),
            b.overdueDays || null,
            b.unpriced ? 'Chưa nhập giá' : Math.round(b.balance) <= 0 ? 'Đã thu đủ' : '',
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
            <Statistic title="Tổng khách còn nợ" value={data?.totalBalance ?? 0} formatter={(v) => `${formatVnd(Number(v))} đ`} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card>
            <Statistic title="Trong đó quá hạn" value={data?.totalOverdue ?? 0} formatter={(v) => `${formatVnd(Number(v))} đ`} styles={{ content: { color: data?.totalOverdue ? '#cf1322' : undefined } }} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Số khách còn nợ" value={(data?.customers ?? []).filter(owes).length} />
          </Card>
        </Col>
      </Row>

      <Card>
        <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Công nợ khách hàng{' '}
            <Typography.Text type="secondary" style={{ fontSize: 14, fontWeight: 400 }}>
              ({customers.length} khách)
            </Typography.Text>
          </Typography.Title>
          <Flex gap={8} wrap align="center">
            <Input allowClear prefix={<SearchOutlined />} placeholder="Tên, SĐT khách" style={{ width: 220 }} onChange={(e) => setQ(e.target.value)} />
            <Checkbox checked={onlyDebt} onChange={(e) => setOnlyDebt(e.target.checked)}>
              Chỉ khách còn nợ
            </Checkbox>
            <Checkbox checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)}>
              Chỉ khách quá hạn
            </Checkbox>
            <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!customers.length}>
              Xuất Excel
            </Button>
          </Flex>
        </Flex>

        <Table<RecCustomer>
          rowKey="key"
          loading={isLoading}
          dataSource={customers}
          pagination={paged()}
          locale={{ emptyText: 'Không có công nợ' }}
          expandable={{
            expandRowByClick: true,
            expandedRowRender: (c) => (
              <Table<RecBooking>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={c.bookings}
                columns={[
                  { title: 'Booking', dataIndex: 'code', render: (v, b) => <Link to={`/bookings/${b.id}`}>{v}</Link> },
                  { title: 'Mã của khách', dataIndex: 'customerRef' },
                  { title: 'Trạng thái', dataIndex: 'status', render: (v) => <EnumTag labels={BOOKING_STATUS} value={v} /> },
                  { title: 'Ngày đi', dataIndex: 'firstPickup', render: (v) => (v ? dayjs(v).format(DATE_FORMAT) : '') },
                  { title: 'NV kinh doanh', dataIndex: 'salesUser' },
                  { title: 'Tổng tiền', dataIndex: 'total', align: 'right', render: (v) => formatVnd(v) },
                  { title: 'Đã thu', dataIndex: 'paid', align: 'right', render: (v) => formatVnd(v) },
                  {
                    title: 'Còn nợ',
                    dataIndex: 'balance',
                    align: 'right',
                    render: (v, b) => (b.unpriced ? UNPRICED_TAG : Math.round(v) > 0 ? <b>{formatVnd(v)}</b> : <Tag color="green">Đã thu đủ</Tag>),
                  },
                  {
                    title: 'Hạn thanh toán',
                    render: (_, b) =>
                      !bookingOwes(b) ? null : (
                      <>
                        {dayjs(b.dueDate).format(DATE_FORMAT)}
                        {b.overdueDays > 0 && b.balance > 0 && (
                          <Tag color="red" style={{ marginLeft: 6 }}>
                            Quá {b.overdueDays} ngày
                          </Tag>
                        )}
                      </>
                    ),
                  },
                  ...(canCollect
                    ? [
                        {
                          key: 'collect',
                          render: (_: unknown, b: RecBooking) =>
                            b.balance > 0 ? (
                              <Button size="small" type="primary" ghost icon={<DollarOutlined />} onClick={() => setCollect(b)}>
                                Thu tiền
                              </Button>
                            ) : null,
                        },
                      ]
                    : []),
                ]}
              />
            ),
          }}
          columns={[
            {
              title: 'Khách hàng',
              render: (_, c) => (
                <>
                  <b>{c.name}</b> <EnumTag labels={CUSTOMER_TYPE} value={c.customerType} />
                  {c.phone && (
                    <div>
                      <Typography.Text type="secondary">{c.phone}</Typography.Text>
                    </div>
                  )}
                </>
              ),
            },
            { title: 'Số booking', align: 'center', render: (_, c) => c.bookings.length },
            { title: 'Tổng tiền', dataIndex: 'totalBilled', align: 'right', render: (v) => formatVnd(v) },
            { title: 'Đã thu', dataIndex: 'totalPaid', align: 'right', render: (v) => formatVnd(v) },
            {
              title: 'Còn nợ',
              dataIndex: 'balance',
              align: 'right',
              render: (v, c) =>
                Math.round(v) > 0 ? (
                  <>
                    <Money value={v} strong />
                    {c.unpriced > 0 && (
                      <div>
                        <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                          + {c.unpriced} booking chưa nhập giá
                        </Tag>
                      </div>
                    )}
                  </>
                ) : c.unpriced > 0 ? (
                  UNPRICED_TAG
                ) : (
                  <Tag color="green">Đã thanh toán đủ</Tag>
                ),
              sorter: (a, b) => a.balance - b.balance,
              defaultSortOrder: 'descend',
            },
            {
              title: 'Quá hạn',
              align: 'right',
              sorter: (a, b) => a.overdue - b.overdue,
              render: (_, c) =>
                c.overdue > 0 ? (
                  <Tooltip title={`Lâu nhất ${c.maxOverdueDays} ngày`}>
                    <Typography.Text type="danger" strong>
                      {formatVnd(c.overdue)} đ
                    </Typography.Text>
                  </Tooltip>
                ) : (
                  ''
                ),
            },
            {
              title: 'Hạn mức',
              render: (_, c) =>
                c.creditLimit ? (
                  <>
                    {formatVnd(c.creditLimit)}
                    {c.overLimit && (
                      <Tag color="red" style={{ marginLeft: 6 }}>
                        Vượt hạn mức
                      </Tag>
                    )}
                  </>
                ) : (
                  ''
                ),
            },
          ]}
        />
      </Card>

      <PaymentModal
        open={!!collect}
        title={`Thu tiền booking ${collect?.code ?? ''}`}
        defaultAmount={collect?.balance}
        hint={collect && <Typography.Paragraph type="secondary">Còn nợ: {formatVnd(collect.balance)} đ</Typography.Paragraph>}
        onClose={() => setCollect(null)}
        onSubmit={async (v) => {
          try {
            await api(`/bookings/${collect!.id}/payments`, { method: 'POST', body: v });
            message.success('Đã ghi nhận thu tiền');
            queryClient.invalidateQueries({ queryKey: ['/finance'] });
            queryClient.invalidateQueries({ queryKey: ['/bookings'] });
            queryClient.invalidateQueries({ queryKey: ['/reports/summary'] });
          } catch (e) {
            message.error((e as Error).message);
            throw e;
          }
        }}
      />
    </Flex>
  );
}
