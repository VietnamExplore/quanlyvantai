import { DeleteOutlined, DollarOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Flex, Popconfirm, Row, Statistic, Tabs, Typography, Tag } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
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
  totalNet: number;
  totalVat: number;
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
  const canReview = hasRole('ADMIN', 'DIEU_HANH');
  const [reviewing, setReviewing] = useState<(PayPartner['trips'][number] & { partnerName: string }) | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['/finance', 'payables'],
    queryFn: () => api<{ totalBalance: number; partners: PayPartner[] }>('/finance/payables'),
  });
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
    downloadExcel(`cong-no-nha-xe-${dayjs().format('YYYYMMDD')}.xlsx`, [
      {
        name: 'Công nợ nhà xe',
        title: `CÔNG NỢ NHÀ XE ĐỐI TÁC – ngày ${dayjs().format('DD/MM/YYYY')}`,
        headers: ['Nhà xe', 'Ngày chạy', 'Booking', 'Hành trình', 'Biển số', 'Giá thuê', 'Phát sinh tăng', 'Phát sinh giảm', 'Lý do phát sinh', 'Duyệt phát sinh', 'Chưa thuế', 'Thuế suất', 'Thuế GTGT', 'Phải trả', 'Trạng thái'],
        sumColumns: [5, 6, 7, 10, 12, 13],
        totalLabel: 'Tổng cộng',
        rows: (data?.partners ?? []).flatMap((p) =>
          p.trips.map((t) => [
            p.name,
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
        <ResponsiveTable<PayPartner>
          rowKey="id"
          loading={isLoading}
          dataSource={data?.partners ?? []}
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
