import { DeleteOutlined, DollarOutlined, DownloadOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Flex, Popconfirm, Row, Statistic, Tabs, Typography, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { fmtTime } from '../booking-utils';
import { DATE_FORMAT, EnumTag, formatVnd, Money, paged } from '../components/common';
import { PaymentModal } from '../components/finance';
import { downloadExcel } from '../excel';
import { PAYMENT_METHOD, TRIP_STATUS } from '../labels';
import type { Payment, TripStatus } from '../types';
import { ResponsiveTable } from '../components/ResponsiveTable';
import { PARTNER_ISSUE } from '../components/PartnerCostAdjust';
import { describeFilter, EMPTY_FILTER, FinanceFilterBar, fileSlug, inRange, isFiltered, rangeSuffix, type DebtFilter, type FinanceFilterValue } from '../components/FinanceFilter';
import { EXTRA_STATUS, ExtraStatusTag, PartnerExtraReviewModal, type ExtraReviewValues } from '../components/PartnerExtraReview';

interface PayTrip {
  id: number;
  pickupTime: string;
  pickupAddress: string;
  dropoffAddress: string | null;
  partnerPlate: string | null;
  partnerCost: string | null;
  partnerInvoice: boolean;
  partnerVatPercent: string;
  partnerIssue?: string | null;
  partnerAdjustNote?: string | null;
  partnerExtraUp: string;
  partnerExtraDown: string;
  partnerExtraNote: string | null;
  partnerExtraStatus: string | null;
  partnerExtraReviewNote: string | null;
  /** Giá thuê chưa thuế / thuế / phải trả */
  partnerNet: number;
  partnerVat: number;
  partnerTotal: number;
  /** Tiền đã trả phân bổ cho chuyến (chuyến cũ trả trước) và số còn lại */
  partnerPaid: number;
  partnerRemain: number;
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
  taxCode: string | null;
  address: string | null;
  /** Tiền đã trả vượt công nợ, chưa phân bổ vào chuyến nào */
  prepaid: number;
  tripCount: number;
  totalNet: number;
  totalVat: number;
  totalCost: number;
  totalPaid: number;
  balance: number;
  trips: PayTrip[];
  payments: Payment[];
}

const DEBT_LABELS: Partial<Record<DebtFilter, string>> = { all: 'Tất cả', owe: 'Còn phải trả', paid: 'Đã trả đủ' };

/** Lọc từng chuyến theo bộ lọc rồi tính lại tổng của nhà xe; nhà xe không còn chuyến nào sau lọc thì ẩn */
function applyFilter(list: PayPartner[], f: FinanceFilterValue): PayPartner[] {
  if (!isFiltered(f)) return list;
  const q = f.q.trim().toLowerCase();
  return list
    .filter((p) => !f.ids.length || f.ids.includes(String(p.id)))
    .map((p) => {
      const nameHit = !q || `${p.name} ${p.phone ?? ''}`.toLowerCase().includes(q);
      const trips = p.trips.filter(
        (t) =>
          inRange(f, t.pickupTime) &&
          (nameHit || `${t.booking.code} ${t.partnerPlate ?? ''} ${t.pickupAddress} ${t.dropoffAddress ?? ''}`.toLowerCase().includes(q)) &&
          (f.debt === 'all' || (f.debt === 'owe' ? Math.round(t.partnerRemain) > 0 : Math.round(t.partnerRemain) <= 0)) &&
          (f.invoice === 'all' || (f.invoice === 'yes') === t.partnerInvoice) &&
          (!f.pendingExtra || t.partnerExtraStatus === 'CHO_DUYET'),
      );
      const sum = (k: 'partnerNet' | 'partnerVat' | 'partnerTotal' | 'partnerPaid' | 'partnerRemain') => trips.reduce((s, t) => s + t[k], 0);
      return {
        ...p,
        trips,
        payments: p.payments.filter((x) => inRange(f, x.paidAt)),
        tripCount: trips.length,
        totalNet: sum('partnerNet'),
        totalVat: sum('partnerVat'),
        totalCost: sum('partnerTotal'),
        totalPaid: sum('partnerPaid'),
        balance: sum('partnerRemain'),
      };
    })
    .filter((p) => p.trips.length > 0);
}

const TRIP_HEADERS = ['Ngày chạy', 'Booking', 'Hành trình', 'Biển số', 'Giá thuê', 'Phát sinh tăng', 'Phát sinh giảm', 'Lý do phát sinh', 'Duyệt phát sinh', 'Chưa thuế', 'Thuế suất', 'Thuế GTGT', 'Phải trả', 'Đã trả', 'Còn lại', 'Trạng thái'];
const TRIP_SUMS = [4, 5, 6, 9, 11, 12, 13, 14];
const tripRow = (t: PayTrip) => [
  dayjs(t.pickupTime).format('DD/MM/YYYY HH:mm'),
  t.booking.code,
  [t.pickupAddress, t.dropoffAddress].filter(Boolean).join(' → '),
  t.partnerPlate,
  Number(t.partnerCost ?? 0),
  Number(t.partnerExtraUp),
  Number(t.partnerExtraDown),
  t.partnerExtraNote ?? '',
  t.partnerExtraStatus ? (EXTRA_STATUS[t.partnerExtraStatus]?.label ?? '') : '',
  t.partnerNet,
  t.partnerInvoice ? `${Number(t.partnerVatPercent)}%` : 'Không HĐ',
  t.partnerVat,
  t.partnerTotal,
  t.partnerPaid,
  t.partnerRemain,
  TRIP_STATUS[t.status].label,
];

/** File Excel đối chiếu công nợ của một nhà xe (theo bộ lọc hiện tại) */
function exportPartner(p: PayPartner, f: FinanceFilterValue, filtered: boolean) {
  const summary: [string, number][] = [
    ['Tổng phải trả', p.totalCost],
    ['Đã trả', p.totalPaid],
    ['Còn phải trả', filtered ? p.balance : p.totalCost - p.totalPaid],
  ];
  if (!filtered && p.prepaid > 0) summary.splice(2, 0, ['Trong đó trả trước (chưa phân bổ)', p.prepaid]);
  return downloadExcel(`doi-chieu-cong-no_${fileSlug(p.name)}${rangeSuffix(f)}.xlsx`, [
    {
      name: 'Đối chiếu công nợ',
      title: `BẢNG ĐỐI CHIẾU CÔNG NỢ NHÀ XE – ${p.name.toUpperCase()}`,
      info: [
        [p.phone && `SĐT: ${p.phone}`, p.taxCode && `MST: ${p.taxCode}`, p.bankAccount && `TK: ${p.bankName ?? ''} ${p.bankAccount}`].filter(Boolean).join(' · '),
        p.address ? `Địa chỉ: ${p.address}` : '',
        describeFilter(f, DEBT_LABELS),
        'Tiền đã trả được phân bổ cho các chuyến theo thứ tự ngày chạy (chuyến cũ trước)',
        `Ngày lập: ${dayjs().format('DD/MM/YYYY HH:mm')}`,
      ].filter(Boolean),
      headers: TRIP_HEADERS,
      sumColumns: TRIP_SUMS,
      totalLabel: 'Tổng cộng',
      rows: [...p.trips].sort((a, b) => dayjs(a.pickupTime).valueOf() - dayjs(b.pickupTime).valueOf()).map(tripRow),
      summary,
    },
    {
      name: 'Lịch sử thanh toán',
      title: `LỊCH SỬ THANH TOÁN – ${p.name.toUpperCase()}`,
      info: [f.range ? `Các lần thanh toán từ ${f.range[0].format(DATE_FORMAT)} đến ${f.range[1].format(DATE_FORMAT)}` : 'Tất cả các lần thanh toán'],
      headers: ['Ngày', 'Số tiền', 'Hình thức', 'Chứng từ', 'Ghi chú', 'Người ghi'],
      sumColumns: [1],
      totalLabel: 'Tổng đã thanh toán',
      rows: [...p.payments]
        .sort((a, b) => dayjs(a.paidAt).valueOf() - dayjs(b.paidAt).valueOf())
        .map((x) => [dayjs(x.paidAt).format(DATE_FORMAT), Number(x.amount), PAYMENT_METHOD[x.method]?.label ?? x.method, x.reference, x.note, x.createdBy?.fullName]),
    },
  ]);
}

export default function PayablesPage() {
  const { hasRole } = useAuth();
  const canPay = hasRole('ADMIN', 'KE_TOAN');
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState<PayPartner | null>(null);
  const canReview = hasRole('ADMIN', 'DIEU_HANH');
  const [reviewing, setReviewing] = useState<(PayPartner['trips'][number] & { partnerName: string }) | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['/finance', 'payables'],
    queryFn: () => api<{ totalBalance: number; partners: PayPartner[] }>('/finance/payables'),
  });
  const [filter, setFilter] = useState<FinanceFilterValue>(EMPTY_FILTER);
  const filtered = isFiltered(filter);
  const partners = useMemo(() => applyFilter(data?.partners ?? [], filter), [data, filter]);
  const entities = useMemo(() => (data?.partners ?? []).map((p) => ({ value: String(p.id), label: p.name })), [data]);
  const totalBalance = filtered ? partners.reduce((s, p) => s + p.balance, 0) : (data?.totalBalance ?? 0);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/finance'] });
    queryClient.invalidateQueries({ queryKey: ['/reports/summary'] });
  };

  async function review(v: ExtraReviewValues) {
    if (!reviewing) return;
    setReviewBusy(true);
    try {
      await api(`/dispatch/trips/${reviewing.id}/partner-extra`, { method: 'POST', body: v });
      message.success(v.approve ? 'Đã duyệt phát sinh' : 'Đã từ chối phát sinh');
      setReviewing(null);
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setReviewBusy(false);
    }
  }

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
    downloadExcel(`cong-no-nha-xe${rangeSuffix(filter)}.xlsx`, [
      {
        name: 'Công nợ nhà xe',
        title: `CÔNG NỢ NHÀ XE ĐỐI TÁC – ngày ${dayjs().format('DD/MM/YYYY')}`,
        info: [describeFilter(filter, DEBT_LABELS)],
        headers: ['Nhà xe', ...TRIP_HEADERS],
        sumColumns: TRIP_SUMS.map((i) => i + 1),
        totalLabel: 'Tổng cộng',
        rows: partners.flatMap((p) => p.trips.map((t) => [p.name, ...tripRow(t)])),
      },
    ]);
  }

  return (
    <Flex vertical gap={16}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={8}>
          <Card>
            <Statistic title={filtered ? 'Còn phải trả (theo bộ lọc)' : 'Tổng còn phải trả nhà xe'} value={totalBalance} formatter={(v) => `${formatVnd(Number(v))} đ`} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card>
            <Statistic title="Số nhà xe còn nợ" value={(filtered ? partners : (data?.partners ?? [])).filter((p) => p.balance > 0).length} />
          </Card>
        </Col>
      </Row>

      <Card>
        <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Công nợ nhà xe đối tác
          </Typography.Title>
          <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!partners.length}>
            Xuất Excel {filtered ? 'theo bộ lọc' : 'tất cả'}
          </Button>
        </Flex>
        <FinanceFilterBar
          value={filter}
          onChange={setFilter}
          entityLabel="nhà xe"
          entities={entities}
          searchPlaceholder="Mã booking, biển số, địa điểm"
          debtLabels={DEBT_LABELS}
          showPendingExtra
        />
        <ResponsiveTable<PayPartner>
          rowKey="id"
          loading={isLoading}
          dataSource={partners}
          pagination={paged('nhà xe')}
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
                      <ResponsiveTable<PayTrip>
                        rowKey="id"
                        size="small"
                        pagination={paged('chuyến')}
                        dataSource={p.trips}
                        columns={[
                          { title: 'Ngày chạy', render: (_, t) => fmtTime(t.pickupTime) },
                          { title: 'Booking', render: (_, t) => <Link to={`/bookings/${t.booking.id}`}>{t.booking.code}</Link> },
                          { title: 'Hành trình', render: (_, t) => [t.pickupAddress, t.dropoffAddress].filter(Boolean).join(' → ') },
                          { title: 'Xe', render: (_, t) => t.partnerPlate ?? t.vehicleType.name },
                          {
                            title: 'Trạng thái',
                            dataIndex: 'status',
                            render: (v, t) => (
                              <>
                                <EnumTag labels={TRIP_STATUS} value={v} />
                                {t.partnerIssue && PARTNER_ISSUE[t.partnerIssue] && (
                                  <Tag color={PARTNER_ISSUE[t.partnerIssue].color} title={t.partnerAdjustNote ?? undefined}>
                                    {PARTNER_ISSUE[t.partnerIssue].label}
                                  </Tag>
                                )}
                              </>
                            ),
                          },
                          { title: 'Giá thuê', dataIndex: 'partnerCost', align: 'right', render: (v) => <Money value={v} /> },
                          {
                            title: 'Phát sinh',
                            align: 'right',
                            render: (_, t) => {
                              const up = Number(t.partnerExtraUp);
                              const down = Number(t.partnerExtraDown);
                              if (!up && !down) return '—';
                              const counted = t.partnerExtraStatus === 'DA_DUYET';
                              return (
                                <>
                                  <span title={t.partnerExtraNote ?? undefined} style={counted ? undefined : { color: '#999', textDecoration: t.partnerExtraStatus === 'TU_CHOI' ? 'line-through' : undefined }}>
                                    {[up && `+${formatVnd(up)}`, down && `−${formatVnd(down)}`].filter(Boolean).join(' ')}
                                  </span>
                                  <div>
                                    <ExtraStatusTag status={t.partnerExtraStatus} note={t.partnerExtraReviewNote} />
                                    {canReview && t.partnerExtraStatus === 'CHO_DUYET' && (
                                      <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setReviewing({ ...t, partnerName: p.name })}>
                                        Duyệt
                                      </Button>
                                    )}
                                  </div>
                                </>
                              );
                            },
                          },
                          { title: 'Chưa thuế', dataIndex: 'partnerNet', align: 'right', render: (v) => <Money value={v} /> },
                          {
                            title: 'Thuế',
                            dataIndex: 'partnerVat',
                            align: 'right',
                            render: (v, t) => (t.partnerInvoice ? <>{formatVnd(v)} ({Number(t.partnerVatPercent)}%)</> : <span style={{ color: '#999' }}>Không HĐ</span>),
                          },
                          { title: 'Phải trả', dataIndex: 'partnerTotal', align: 'right', render: (v) => <Money value={v} strong /> },
                          {
                            title: 'Còn lại',
                            dataIndex: 'partnerRemain',
                            align: 'right',
                            render: (v, t) => (Math.round(v) > 0 ? <span title={`Đã trả ${formatVnd(t.partnerPaid)} đ`}>{formatVnd(v)}</span> : <Tag color="green">Đã trả đủ</Tag>),
                          },
                        ]}
                      />
                    ),
                  },
                  {
                    key: 'payments',
                    label: `Đã thanh toán (${p.payments.length})`,
                    children: (
                      <ResponsiveTable<Payment>
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
            { title: 'Tiền thuê (chưa thuế)', dataIndex: 'totalNet', align: 'right', render: (v) => formatVnd(v) },
            { title: 'Thuế', dataIndex: 'totalVat', align: 'right', render: (v) => (v ? formatVnd(v) : '—') },
            { title: 'Phải trả', dataIndex: 'totalCost', align: 'right', render: (v) => <b>{formatVnd(v)}</b> },
            { title: 'Đã trả', dataIndex: 'totalPaid', align: 'right', render: (v) => formatVnd(v) },
            {
              title: 'Còn phải trả',
              dataIndex: 'balance',
              align: 'right',
              render: (v) => <Typography.Text strong type={v > 0 ? 'danger' : undefined}>{formatVnd(v)} đ</Typography.Text>,
            },
            {
              key: 'excel',
              width: 60,
              render: (_: unknown, p: PayPartner) => (
                <Tooltip title={`Xuất Excel đối chiếu công nợ của ${p.name}${filtered ? ' (theo bộ lọc)' : ''}`}>
                  <Button
                    size="small"
                    icon={<FileExcelOutlined style={{ color: '#15803d' }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      exportPartner(p, filter, filtered);
                    }}
                  >
                    Excel
                  </Button>
                </Tooltip>
              ),
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

      <PartnerExtraReviewModal
        open={!!reviewing}
        title={`Duyệt phát sinh · ${reviewing?.partnerName ?? ''} · ${reviewing?.booking.code ?? ''}`}
        partnerCost={Number(reviewing?.partnerCost ?? 0)}
        extraUp={Number(reviewing?.partnerExtraUp ?? 0)}
        extraDown={Number(reviewing?.partnerExtraDown ?? 0)}
        extraNote={reviewing?.partnerExtraNote}
        invoice={!!reviewing?.partnerInvoice}
        vatPercent={Number(reviewing?.partnerVatPercent ?? 0)}
        busy={reviewBusy}
        onCancel={() => setReviewing(null)}
        onSubmit={review}
      />

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
