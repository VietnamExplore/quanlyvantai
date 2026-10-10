import { DollarOutlined, DownloadOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Flex, Row, Statistic, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { DATE_FORMAT, CustomerTypeTag, EnumTag, formatVnd, Money, paged } from '../components/common';
import { PaymentModal } from '../components/finance';
import { downloadExcel } from '../excel';
import { BOOKING_STATUS, PAYMENT_METHOD } from '../labels';
import { describeFilter, EMPTY_FILTER, FinanceFilterBar, fileSlug, inRange, isFiltered, rangeSuffix, type DebtFilter, type FinanceFilterValue } from '../components/FinanceFilter';
import type { BookingStatus, CustomerType } from '../types';
import { ResponsiveTable } from '../components/ResponsiveTable';

interface RecBooking {
  id: number;
  code: string;
  customerRef: string | null;
  status: BookingStatus;
  salesUser: string | null;
  firstPickup: string | null;
  dueDate: string;
  overdueDays: number;
  /** Khách lấy hóa đơn VAT */
  invoice: boolean;
  vatPercent: number;
  /** Thành tiền chưa thuế / thuế / tổng (gồm thuế) */
  net: number;
  vat: number;
  total: number;
  paid: number;
  balance: number;
  /** Booking chưa nhập giá (tổng 0 đ, chưa thu) – vẫn coi là còn nợ */
  unpriced: boolean;
  payments: { id: number; amount: number; paidAt: string; method: string; reference: string | null; note: string | null }[];
}

interface RecCustomer {
  key: string;
  customerId: number | null;
  name: string;
  phone: string | null;
  taxCode: string | null;
  address: string | null;
  email: string | null;
  customerType: CustomerType;
  creditLimit: number | null;
  totalNet: number;
  totalVat: number;
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

const DEBT_LABELS: Record<DebtFilter, string> = { all: 'Tất cả', owe: 'Còn nợ', overdue: 'Quá hạn', paid: 'Đã thu đủ' };

/** Lọc từng booking theo bộ lọc rồi tính lại tổng của khách; khách không còn booking nào sau lọc thì ẩn */
function applyFilter(list: RecCustomer[], f: FinanceFilterValue): RecCustomer[] {
  const q = f.q.trim().toLowerCase();
  return list
    .filter((c) => !f.ids.length || f.ids.includes(c.key))
    .map((c) => {
      const nameHit = !q || `${c.name} ${c.phone ?? ''}`.toLowerCase().includes(q);
      const bookings = c.bookings.filter(
        (b) =>
          inRange(f, b.firstPickup) &&
          (nameHit || `${b.code} ${b.customerRef ?? ''}`.toLowerCase().includes(q)) &&
          (f.debt === 'all' || (f.debt === 'owe' ? bookingOwes(b) : f.debt === 'paid' ? !bookingOwes(b) : b.overdueDays > 0 && Math.round(b.balance) > 0)) &&
          (f.invoice === 'all' || (f.invoice === 'yes') === b.invoice) &&
          (!f.sales || b.salesUser === f.sales),
      );
      const sum = (k: 'net' | 'vat' | 'total' | 'paid' | 'balance') => bookings.reduce((s, b) => s + b[k], 0);
      const overdueList = bookings.filter((b) => b.overdueDays > 0 && b.balance > 0);
      return {
        ...c,
        bookings,
        totalNet: sum('net'),
        totalVat: sum('vat'),
        totalBilled: sum('total'),
        totalPaid: sum('paid'),
        balance: sum('balance'),
        overdue: overdueList.reduce((s, b) => s + b.balance, 0),
        maxOverdueDays: overdueList.reduce((m, b) => Math.max(m, b.overdueDays), 0),
        unpriced: bookings.filter((b) => b.unpriced).length,
      };
    })
    .filter((c) => c.bookings.length > 0);
}

const BOOKING_HEADERS = ['Booking', 'Mã của khách', 'Ngày đi', 'NV kinh doanh', 'Chưa thuế', 'Thuế suất', 'Thuế GTGT', 'Tổng tiền', 'Đã thu', 'Còn nợ', 'Hạn thanh toán', 'Quá hạn (ngày)', 'Ghi chú'];
const bookingRow = (b: RecBooking) => [
  b.code,
  b.customerRef,
  b.firstPickup ? dayjs(b.firstPickup).format(DATE_FORMAT) : '',
  b.salesUser,
  b.net,
  b.invoice ? `${b.vatPercent}%` : 'Không HĐ',
  b.vat,
  b.total,
  b.paid,
  b.balance,
  dayjs(b.dueDate).format(DATE_FORMAT),
  b.overdueDays && Math.round(b.balance) > 0 ? b.overdueDays : null,
  b.unpriced ? 'Chưa nhập giá' : Math.round(b.balance) <= 0 ? 'Đã thu đủ' : '',
];

/** File Excel đối chiếu công nợ của một khách hàng (theo bộ lọc hiện tại) */
function exportCustomer(c: RecCustomer, f: FinanceFilterValue) {
  const payments = c.bookings.flatMap((b) => b.payments.map((p) => ({ ...p, code: b.code }))).sort((a, b) => dayjs(a.paidAt).valueOf() - dayjs(b.paidAt).valueOf());
  return downloadExcel(`doi-chieu-cong-no_${fileSlug(c.name)}${rangeSuffix(f)}.xlsx`, [
    {
      name: 'Đối chiếu công nợ',
      title: `BẢNG ĐỐI CHIẾU CÔNG NỢ – ${c.name.toUpperCase()}`,
      info: [
        [c.phone && `SĐT: ${c.phone}`, c.taxCode && `MST: ${c.taxCode}`, c.email && `Email: ${c.email}`].filter(Boolean).join(' · '),
        c.address ? `Địa chỉ: ${c.address}` : '',
        describeFilter(f, DEBT_LABELS),
        `Ngày lập: ${dayjs().format('DD/MM/YYYY HH:mm')}`,
      ].filter(Boolean),
      headers: BOOKING_HEADERS,
      sumColumns: [4, 6, 7, 8, 9],
      totalLabel: 'Tổng cộng',
      rows: [...c.bookings].sort((a, b) => dayjs(a.firstPickup ?? 0).valueOf() - dayjs(b.firstPickup ?? 0).valueOf()).map(bookingRow),
      summary: [
        ['Tổng phải thu', c.totalBilled],
        ['Đã thu', c.totalPaid],
        ['Còn nợ', c.balance],
      ],
    },
    {
      name: 'Lịch sử thu tiền',
      title: `LỊCH SỬ THU TIỀN – ${c.name.toUpperCase()}`,
      info: ['Các lần thu của những booking trong bảng đối chiếu'],
      headers: ['Ngày thu', 'Booking', 'Số tiền', 'Hình thức', 'Chứng từ', 'Ghi chú'],
      sumColumns: [2],
      totalLabel: 'Tổng đã thu',
      rows: payments.map((p) => [dayjs(p.paidAt).format(DATE_FORMAT), p.code, p.amount, PAYMENT_METHOD[p.method as keyof typeof PAYMENT_METHOD]?.label ?? p.method, p.reference, p.note]),
    },
  ]);
}

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
  const [filter, setFilter] = useState<FinanceFilterValue>(EMPTY_FILTER);
  const filtered = isFiltered(filter);
  const [collect, setCollect] = useState<RecBooking | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['/finance', 'receivables'], queryFn: () => api<Receivables>('/finance/receivables') });

  const customers = useMemo(() => applyFilter(data?.customers ?? [], filter), [data, filter]);
  const entities = useMemo(() => (data?.customers ?? []).map((c) => ({ value: c.key, label: c.phone ? `${c.name} · ${c.phone}` : c.name })), [data]);
  const salesOptions = useMemo(() => [...new Set((data?.customers ?? []).flatMap((c) => c.bookings.map((b) => b.salesUser)).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, 'vi')), [data]);
  const totalBalance = filtered ? customers.reduce((s, c) => s + c.balance, 0) : (data?.totalBalance ?? 0);
  const totalOverdue = filtered ? customers.reduce((s, c) => s + c.overdue, 0) : (data?.totalOverdue ?? 0);

  function exportCsv() {
    downloadExcel(`cong-no-khach-hang${rangeSuffix(filter)}.xlsx`, [
      {
        name: 'Công nợ khách hàng',
        title: `CÔNG NỢ KHÁCH HÀNG – ngày ${dayjs().format('DD/MM/YYYY')}`,
        info: [describeFilter(filter, DEBT_LABELS)],
        headers: ['Khách hàng', 'SĐT', ...BOOKING_HEADERS],
        sumColumns: [6, 8, 9, 10, 11],
        totalLabel: 'Tổng cộng',
        rows: customers.flatMap((c) => c.bookings.map((b) => [c.name, c.phone, ...bookingRow(b)])),
      },
    ]);
  }

  return (
    <Flex vertical gap={16}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={8}>
          <Card>
            <Statistic title={filtered ? 'Còn nợ (theo bộ lọc)' : 'Tổng khách còn nợ'} value={totalBalance} formatter={(v) => `${formatVnd(Number(v))} đ`} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card>
            <Statistic title="Trong đó quá hạn" value={totalOverdue} formatter={(v) => `${formatVnd(Number(v))} đ`} styles={{ content: { color: totalOverdue ? '#cf1322' : undefined } }} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Số khách còn nợ" value={(filtered ? customers : (data?.customers ?? [])).filter(owes).length} />
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
          <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!customers.length}>
            Xuất Excel {filtered ? 'theo bộ lọc' : 'tất cả'}
          </Button>
        </Flex>
        <FinanceFilterBar
          value={filter}
          onChange={setFilter}
          entityLabel="khách hàng"
          entities={entities}
          searchPlaceholder="Tên, SĐT, mã booking"
          debtLabels={DEBT_LABELS}
          salesOptions={salesOptions}
        />

        <ResponsiveTable<RecCustomer>
          rowKey="key"
          loading={isLoading}
          dataSource={customers}
          pagination={paged()}
          locale={{ emptyText: 'Không có công nợ' }}
          expandable={{
            expandRowByClick: true,
            expandedRowRender: (c) => (
              <ResponsiveTable<RecBooking>
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
                  { title: 'Chưa thuế', dataIndex: 'net', align: 'right', render: (v) => formatVnd(v) },
                  {
                    title: 'Thuế',
                    dataIndex: 'vat',
                    align: 'right',
                    render: (v, b) => (b.invoice ? <span title={`Thuế suất ${b.vatPercent}%`}>{formatVnd(v)} <Typography.Text type="secondary">({b.vatPercent}%)</Typography.Text></span> : <Typography.Text type="secondary">Không HĐ</Typography.Text>),
                  },
                  { title: 'Tổng tiền', dataIndex: 'total', align: 'right', render: (v) => <b>{formatVnd(v)}</b> },
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
                  <b>{c.name}</b> <CustomerTypeTag code={c.customerType} />
                  {c.phone && (
                    <div>
                      <Typography.Text type="secondary">{c.phone}</Typography.Text>
                    </div>
                  )}
                </>
              ),
            },
            { title: 'Số booking', align: 'center', render: (_, c) => c.bookings.length },
            { title: 'Chưa thuế', dataIndex: 'totalNet', align: 'right', render: (v) => formatVnd(v) },
            { title: 'Thuế', dataIndex: 'totalVat', align: 'right', render: (v) => (v ? formatVnd(v) : '—') },
            { title: 'Tổng tiền', dataIndex: 'totalBilled', align: 'right', render: (v) => <b>{formatVnd(v)}</b> },
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
            {
              key: 'excel',
              width: 60,
              render: (_, c) => (
                <Tooltip title={`Xuất Excel đối chiếu công nợ của ${c.name}${filtered ? ' (theo bộ lọc)' : ''}`}>
                  <Button
                    size="small"
                    icon={<FileExcelOutlined style={{ color: '#15803d' }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      exportCustomer(c, filter);
                    }}
                  >
                    Excel
                  </Button>
                </Tooltip>
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
