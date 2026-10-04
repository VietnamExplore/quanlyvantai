import { DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, DatePicker, Flex, Popconfirm, Row, Segmented, Select, Statistic, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { VoucherModal, type Voucher } from '../components/VoucherModal';
import { DATE_FORMAT, EnumTag, formatVnd } from '../components/common';
import { downloadExcel } from '../excel';
import { PAYMENT_METHOD } from '../labels';
import type { PaymentMethod } from '../types';

interface Entry {
  key: string;
  type: 'THU' | 'CHI';
  source: 'PAYMENT' | 'PARTNER_PAYMENT' | 'TRIP_COST' | 'VOUCHER';
  id: number;
  code: string | null;
  vehicleId: number | null;
  vehicle: string | null;
  ownership: 'CONG_TY' | 'DOI_TAC' | null;
  partnerId: number | null;
  partner: string | null;
  date: string;
  category: string;
  amount: number;
  description: string;
  bookingId: number | null;
  method: PaymentMethod | null;
  reference: string | null;
  note: string | null;
  by: string;
}

/** Nhóm theo xe; khoản của đối tác chưa gắn xe thì gom theo nhà xe */
interface VehicleRow {
  key: string;
  vehicle: string | null;
  ownership: 'CONG_TY' | 'DOI_TAC' | null;
  partner: string | null;
  income: number;
  expense: number;
  count: number;
}

const groupKey = (e: Entry) => (e.vehicleId ? `v${e.vehicleId}` : e.partnerId ? `p${e.partnerId}` : null);
const targetLabel = (e: { vehicle: string | null; partner: string | null; ownership: string | null }) =>
  e.vehicle ? `${e.vehicle}${e.ownership === 'DOI_TAC' && e.partner ? ` (${e.partner})` : ''}` : e.partner ? `Nhà xe ${e.partner}` : '';

interface Ledger {
  from: string;
  to: string;
  income: number;
  expense: number;
  net: number;
  entries: Entry[];
}

export default function LedgerPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [type, setType] = useState<'ALL' | 'THU' | 'CHI'>('ALL');
  const from = range[0].format('YYYY-MM-DD');
  const to = range[1].format('YYYY-MM-DD');
  const [target, setTarget] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['/finance', 'ledger', from, to], queryFn: () => api<Ledger>('/finance/ledger', { query: { from, to } }) });
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'KE_TOAN');
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; editing?: Voucher | null }>({ open: false });

  // Mở form từ menu Tạo nhanh: /finance/ledger?create=1
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('create') !== '1') return;
    setModal({ open: true, editing: null });
    const next = new URLSearchParams(searchParams);
    next.delete('create');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/finance'] });
    queryClient.invalidateQueries({ queryKey: ['/reports'] });
  };

  async function editVoucher(id: number) {
    try {
      setModal({ open: true, editing: await api<Voucher>(`/vouchers/${id}`) });
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function removeVoucher(id: number) {
    try {
      await api(`/vouchers/${id}`, { method: 'DELETE' });
      message.success('Đã xóa phiếu');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const all = useMemo(() => data?.entries ?? [], [data]);
  const entries = all.filter((e) => (type === 'ALL' || e.type === type) && (!target || groupKey(e) === target));

  const byVehicle = useMemo(() => {
    const map = new Map<string, VehicleRow>();
    for (const e of all) {
      const key = groupKey(e);
      if (!key) continue;
      const row = map.get(key) ?? { key, vehicle: e.vehicle, ownership: e.ownership, partner: e.partner, income: 0, expense: 0, count: 0 };
      if (e.type === 'THU') row.income += e.amount;
      else row.expense += e.amount;
      row.count++;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => (a.ownership === b.ownership ? b.expense - a.expense : a.ownership === 'CONG_TY' ? -1 : 1));
  }, [all]);

  function exportCsv() {
    downloadExcel(`so-thu-chi-${from}-${to}.xlsx`, [
      {
        name: 'Sổ thu chi',
        title: `SỔ THU CHI ${dayjs(from).format(DATE_FORMAT)} – ${dayjs(to).format(DATE_FORMAT)}`,
        headers: ['Ngày', 'Loại', 'Khoản mục', 'Diễn giải', 'Xe / đối tác', 'Thu', 'Chi', 'Hình thức', 'Chứng từ', 'Ghi chú', 'Người ghi'],
        sumColumns: [5, 6],
        totalLabel: 'Tổng cộng',
        rows: entries.map((e) => [
          dayjs(e.date).format(DATE_FORMAT),
          e.type === 'THU' ? 'Thu' : 'Chi',
          e.category,
          e.description,
          targetLabel(e),
          e.type === 'THU' ? e.amount : null,
          e.type === 'CHI' ? e.amount : null,
          e.method ? PAYMENT_METHOD[e.method].label : '',
          e.reference,
          e.note,
          e.by,
        ]),
      },
      {
        name: 'Theo xe',
        title: `THU CHI THEO XE ${dayjs(from).format(DATE_FORMAT)} – ${dayjs(to).format(DATE_FORMAT)}`,
        headers: ['Xe', 'Sở hữu', 'Nhà xe', 'Số khoản', 'Thu', 'Chi'],
        sumColumns: [3, 4, 5],
        totalLabel: 'Tổng cộng',
        rows: byVehicle.map((r) => [r.vehicle ?? '(chưa gắn xe)', r.ownership === 'CONG_TY' ? 'Công ty' : 'Đối tác', r.partner, r.count, r.income || null, r.expense || null]),
      },
    ]);
  }

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Sổ thu chi
        </Typography.Title>
        <Flex gap={8} wrap>
          <DatePicker.RangePicker format="DD/MM/YYYY" allowClear={false} value={range} onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])} />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Lọc theo xe / nhà xe"
            style={{ minWidth: 200 }}
            value={target}
            onChange={(v) => setTarget(v ?? null)}
            options={byVehicle.map((r) => ({ value: r.key, label: targetLabel(r) }))}
          />
          <Segmented
            value={type}
            onChange={(v) => setType(v as typeof type)}
            options={[
              { value: 'ALL', label: 'Tất cả' },
              { value: 'THU', label: 'Thu' },
              { value: 'CHI', label: 'Chi' },
            ]}
          />
          <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!entries.length}>
            Xuất Excel
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, editing: null })}>
            Tạo phiếu thu chi
          </Button>
        </Flex>
      </Flex>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Tổng thu" value={data?.income ?? 0} formatter={(v) => `${formatVnd(Number(v))} đ`} styles={{ content: { color: '#3f8600' } }} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card>
            <Statistic title="Tổng chi" value={data?.expense ?? 0} formatter={(v) => `${formatVnd(Number(v))} đ`} styles={{ content: { color: '#cf1322' } }} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card>
            <Statistic title="Chênh lệch thu − chi" value={data?.net ?? 0} formatter={(v) => `${formatVnd(Number(v))} đ`} />
          </Card>
        </Col>
      </Row>

      <Card>
        <Table<Entry>
          rowKey="key"
          size="middle"
          loading={isLoading}
          dataSource={entries}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          locale={{ emptyText: 'Không có khoản thu chi trong khoảng thời gian này' }}
          columns={[
            { title: 'Ngày', dataIndex: 'date', render: (v) => dayjs(v).format(DATE_FORMAT) },
            { title: 'Loại', dataIndex: 'type', render: (v) => (v === 'THU' ? <Tag color="green">Thu</Tag> : <Tag color="red">Chi</Tag>) },
            { title: 'Khoản mục', dataIndex: 'category' },
            {
              title: 'Diễn giải',
              render: (_, e) =>
                e.bookingId ? (
                  <Link to={`/bookings/${e.bookingId}`}>{e.description}</Link>
                ) : e.source === 'VOUCHER' && canEdit ? (
                  <Typography.Link onClick={() => editVoucher(e.id)}>{e.description}</Typography.Link>
                ) : (
                  e.description
                ),
            },
            {
              title: 'Xe / đối tác',
              render: (_, e) =>
                groupKey(e) && (
                  <Tag color={e.ownership === 'CONG_TY' ? 'blue' : 'purple'} style={{ cursor: 'pointer' }} onClick={() => setTarget(groupKey(e))}>
                    {targetLabel(e)}
                  </Tag>
                ),
            },
            { title: 'Thu', align: 'right', render: (_, e) => (e.type === 'THU' ? <Typography.Text style={{ color: '#3f8600' }}>{formatVnd(e.amount)}</Typography.Text> : '') },
            { title: 'Chi', align: 'right', render: (_, e) => (e.type === 'CHI' ? <Typography.Text type="danger">{formatVnd(e.amount)}</Typography.Text> : '') },
            { title: 'Hình thức', dataIndex: 'method', render: (v) => (v ? <EnumTag labels={PAYMENT_METHOD} value={v} /> : '') },
            { title: 'Chứng từ / ghi chú', render: (_, e) => [e.reference, e.note].filter(Boolean).join(' · ') },
            { title: 'Người ghi', dataIndex: 'by' },
            ...(canEdit
              ? [
                  {
                    key: 'actions',
                    render: (_: unknown, e: Entry) =>
                      e.source === 'VOUCHER' && (
                        <Flex gap={4}>
                          <Button size="small" type="text" icon={<EditOutlined />} title="Sửa phiếu" onClick={() => editVoucher(e.id)} />
                          <Popconfirm title={`Xóa phiếu ${e.code}?`} okText="Xóa" cancelText="Không" okButtonProps={{ danger: true }} onConfirm={() => removeVoucher(e.id)}>
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} title="Xóa phiếu" />
                          </Popconfirm>
                        </Flex>
                      ),
                  },
                ]
              : []),
          ]}
        />
      </Card>

      <Card title="Thu chi theo xe" extra={<Typography.Text type="secondary">Gồm phiếu thu chi, chi phí chuyến và tiền trả nhà xe · bấm một dòng để lọc</Typography.Text>}>
        <Table<VehicleRow>
          rowKey="key"
          size="small"
          loading={isLoading}
          dataSource={byVehicle}
          pagination={false}
          locale={{ emptyText: 'Chưa có khoản nào gắn với xe trong khoảng thời gian này' }}
          onRow={(r) => ({ onClick: () => setTarget(r.key === target ? null : r.key), style: { cursor: 'pointer' } })}
          rowClassName={(r) => (r.key === target ? 'ant-table-row-selected' : '')}
          columns={[
            { title: 'Xe', render: (_, r) => <b>{r.vehicle ?? '(chưa gắn xe)'}</b> },
            { title: 'Sở hữu', dataIndex: 'ownership', render: (v) => (v === 'CONG_TY' ? <Tag color="blue">Công ty</Tag> : <Tag color="purple">Đối tác</Tag>) },
            { title: 'Nhà xe', dataIndex: 'partner' },
            { title: 'Số khoản', dataIndex: 'count', align: 'right' },
            { title: 'Thu', dataIndex: 'income', align: 'right', render: (v) => (v ? <Typography.Text style={{ color: '#3f8600' }}>{formatVnd(v)}</Typography.Text> : '') },
            { title: 'Chi', dataIndex: 'expense', align: 'right', render: (v) => (v ? <Typography.Text type="danger">{formatVnd(v)}</Typography.Text> : '') },
          ]}
          summary={(rows) =>
            rows.length > 1 && (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={4}>
                  <b>Tổng cộng</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <b>{formatVnd(rows.reduce((t, r) => t + r.income, 0))}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">
                  <b>{formatVnd(rows.reduce((t, r) => t + r.expense, 0))}</b>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )
          }
        />
      </Card>

      <VoucherModal open={modal.open} editing={modal.editing} onClose={() => setModal({ open: false })} onSaved={refresh} />
    </Flex>
  );
}
