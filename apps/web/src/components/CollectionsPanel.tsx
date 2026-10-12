import { CheckOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, DatePicker, Flex, Popconfirm, Row, Segmented, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { formatVnd } from './common';

export type CollectStage = 'CHUA_THU' | 'LAI_XE_GIU' | 'CHO_KE_TOAN' | 'DA_NOP';
export interface CollectionRow {
  id: number;
  seq: number;
  pickupTime: string;
  pickupAddress: string;
  collectAmount: number;
  collectNote: string | null;
  collectedAt: string | null;
  collectedAmount: number | null;
  collectMethod: 'TIEN_MAT' | 'CHUYEN_KHOAN' | 'THE' | 'KHAC' | null;
  collectSettledAt: string | null;
  collectOpsAt: string | null;
  collectAcctAt: string | null;
  collectOpsBy: { id: number; fullName: string } | null;
  collectAcctBy: { id: number; fullName: string } | null;
  driver: { id: number; fullName: string; phone: string } | null;
  booking: { id: number; code: string; contactName: string; customer: { name: string } | null };
  stage: CollectStage;
}
interface CollectionList {
  rows: CollectionRow[];
  totals: { notCollected: number; driverHolding: number; waitAcct: number; settled: number };
}

export const STAGE: Record<CollectStage, { label: string; color: string }> = {
  CHUA_THU: { label: 'Lái xe chưa thu', color: 'default' },
  LAI_XE_GIU: { label: 'Lái xe đang giữ tiền', color: 'orange' },
  CHO_KE_TOAN: { label: 'Chờ kế toán nhận', color: 'gold' },
  DA_NOP: { label: 'Đã nộp về công ty', color: 'green' },
};
const money = (v: number) => `${formatVnd(v)} đ`;
const methodText = (m: CollectionRow['collectMethod']) => (m === 'CHUYEN_KHOAN' ? 'chuyển khoản' : m === 'THE' ? 'thẻ' : 'tiền mặt');

/** Gọi xác nhận một bước (ops: điều hành nhận tiền từ lái xe, acct: kế toán nhận vào quỹ) */
export function useCollectConfirm() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  return async (tripId: number, step: 'ops' | 'acct', undo = false) => {
    try {
      const r = await api<CollectionRow>(`/trips/${tripId}/collect-confirm`, { method: 'POST', body: { step, undo } });
      message.success(undo ? 'Đã hủy xác nhận' : r.stage === 'DA_NOP' ? `Đã ghi thu ${money(r.collectedAmount ?? 0)} vào booking ${r.booking.code}` : 'Đã xác nhận');
      for (const k of ['/finance', '/dispatch', '/bookings', '/reports']) queryClient.invalidateQueries({ queryKey: [k] });
      return r;
    } catch (e) {
      message.error((e as Error).message);
      return null;
    }
  };
}

/** Ô xác nhận của một bước: đã xác nhận (tên, giờ, hủy được) / nút xác nhận / chờ */
export function StepCell({ row, step }: { row: CollectionRow; step: 'ops' | 'acct' }) {
  const { hasRole } = useAuth();
  const confirm = useCollectConfirm();
  const at = step === 'ops' ? row.collectOpsAt : row.collectAcctAt;
  const by = step === 'ops' ? row.collectOpsBy : row.collectAcctBy;
  const can = step === 'ops' ? hasRole('ADMIN', 'DIEU_HANH') : hasRole('ADMIN', 'KE_TOAN');
  if (step === 'ops' && row.collectMethod === 'CHUYEN_KHOAN') return <Typography.Text type="secondary">Không cần (chuyển khoản)</Typography.Text>;
  if (at) {
    return (
      <Flex vertical>
        <Typography.Text style={{ color: '#15803d' }}>
          <CheckOutlined /> {by?.fullName ?? 'Đã xác nhận'}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(at).format('HH:mm DD/MM')}
          {can && (
            <Popconfirm title="Hủy xác nhận này?" description={row.collectSettledAt ? 'Phiếu thu đã ghi sẽ bị bỏ, khoản quay lại bảng nhờ thu.' : undefined} okText="Hủy xác nhận" cancelText="Không" onConfirm={() => confirm(row.id, step, true)}>
              <a style={{ marginLeft: 6 }}>Hủy</a>
            </Popconfirm>
          )}
        </Typography.Text>
      </Flex>
    );
  }
  if (!row.collectedAt) return <Typography.Text type="secondary">—</Typography.Text>;
  if (!can) return <Tag>Chờ {step === 'ops' ? 'điều hành' : 'kế toán'}</Tag>;
  return (
    <Popconfirm
      title={step === 'ops' ? 'Đã nhận tiền từ lái xe?' : 'Đã nhận tiền vào quỹ / tài khoản công ty?'}
      description={`${money(row.collectedAmount ?? 0)} (${methodText(row.collectMethod)}) · lái xe ${row.driver?.fullName ?? ''}`}
      okText="Xác nhận"
      cancelText="Không"
      onConfirm={() => confirm(row.id, step)}
    >
      <Button size="small" type="primary" ghost>
        {step === 'ops' ? 'Điều hành đã nhận' : 'Kế toán đã nhận'}
      </Button>
    </Popconfirm>
  );
}

/**
 * Bảng nhờ lái xe thu (trong Sổ thu chi): tiền nhờ lái xe thu khách theo dõi riêng, chưa tính là đã thu.
 * Điều hành xác nhận đã nhận tiền từ lái xe + kế toán xác nhận đã nhận vào quỹ → ghi phiếu thu vào booking, khoản rời bảng.
 */
export function CollectionsPanel() {
  const [state, setState] = useState<'open' | 'done'>('open');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const query = { state, from: range?.[0].format('YYYY-MM-DD'), to: range?.[1].format('YYYY-MM-DD') };
  const { data, isLoading } = useQuery({ queryKey: ['/finance', 'collections', query], queryFn: () => api<CollectionList>('/finance/collections', { query }) });
  const t = data?.totals;
  return (
    <Flex vertical gap={16}>
      <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
        Tiền nhờ lái xe thu khách <b>chưa tính là công ty đã thu</b>. Khi lái xe nộp tiền: <b>điều hành</b> xác nhận đã nhận tiền từ lái xe, <b>kế toán</b> xác nhận đã nhận
        vào quỹ (khách chuyển khoản thẳng cho công ty: chỉ cần kế toán) – phần mềm mới ghi phiếu thu vào booking và sổ thu chi, khoản rời bảng này.
      </Typography.Paragraph>
      {state === 'open' && (
        <Row gutter={[12, 12]}>
          <Col xs={12} md={6}>
            <Card>
              <Statistic title="Lái xe chưa thu" value={t?.notCollected ?? 0} formatter={(v) => money(Number(v))} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card>
              <Statistic title="Lái xe đang giữ" value={t?.driverHolding ?? 0} formatter={(v) => money(Number(v))} valueStyle={t?.driverHolding ? { color: '#d97706' } : undefined} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card>
              <Statistic title="Chờ kế toán nhận" value={t?.waitAcct ?? 0} formatter={(v) => money(Number(v))} valueStyle={t?.waitAcct ? { color: '#ca8a04' } : undefined} />
            </Card>
          </Col>
        </Row>
      )}
      <Card>
        <Flex gap={8} wrap style={{ marginBottom: 12 }}>
          <Segmented value={state} onChange={(v) => setState(v as typeof state)} options={[{ value: 'open', label: 'Đang theo dõi' }, { value: 'done', label: 'Đã nộp về công ty' }]} />
          <DatePicker.RangePicker format="DD/MM/YYYY" value={range} onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)} placeholder={['Ngày đi từ', 'đến']} />
        </Flex>
        <Table<CollectionRow>
          rowKey="id"
          size="middle"
          loading={isLoading}
          dataSource={data?.rows ?? []}
          scroll={{ x: 1000 }}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          locale={{ emptyText: state === 'open' ? 'Không có khoản nhờ thu nào đang theo dõi' : 'Chưa có khoản nào' }}
          columns={[
            {
              title: 'Chuyến',
              width: 170,
              render: (_, r) => (
                <Flex vertical>
                  <Link to={`/bookings/${r.booking.id}`}>{r.booking.code}</Link>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(r.pickupTime).format('HH:mm DD/MM/YYYY')}
                  </Typography.Text>
                </Flex>
              ),
            },
            { title: 'Khách', render: (_, r) => r.booking.customer?.name ?? r.booking.contactName },
            { title: 'Lái xe', render: (_, r) => r.driver?.fullName ?? <Typography.Text type="secondary">Chưa gán</Typography.Text> },
            {
              title: 'Nhờ thu',
              dataIndex: 'collectAmount',
              align: 'right',
              width: 120,
              render: (v, r) => (
                <Tooltip title={r.collectNote}>
                  <b>{money(v)}</b>
                </Tooltip>
              ),
            },
            {
              title: 'Lái xe đã thu',
              width: 170,
              render: (_, r) =>
                r.collectedAt ? (
                  <Flex vertical>
                    <span style={{ color: r.collectedAmount !== r.collectAmount ? '#dc2626' : undefined }}>
                      {money(r.collectedAmount ?? 0)} · {methodText(r.collectMethod)}
                    </span>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {dayjs(r.collectedAt).format('HH:mm DD/MM')}
                    </Typography.Text>
                  </Flex>
                ) : (
                  <Typography.Text type="secondary">Chưa thu</Typography.Text>
                ),
            },
            { title: 'Điều hành nhận', width: 160, render: (_, r) => <StepCell row={r} step="ops" /> },
            { title: 'Kế toán nhận', width: 160, render: (_, r) => <StepCell row={r} step="acct" /> },
            { title: 'Trạng thái', dataIndex: 'stage', width: 160, render: (v: CollectStage) => <Tag color={STAGE[v].color}>{STAGE[v].label}</Tag> },
          ]}
        />
      </Card>
    </Flex>
  );
}
