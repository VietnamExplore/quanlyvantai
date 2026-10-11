import { CarOutlined, FilePdfOutlined, LinkOutlined, SyncOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, DatePicker, Flex, Row, Segmented, Select, Statistic, Table, Tag, Tooltip, Typography, Upload } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, tokenStore } from '../api';
import { Clamp, formatVnd } from '../components/common';

interface TollRow {
  id: number;
  txId: string;
  plate: string;
  station: string;
  passedAt: string;
  amount: number;
  amountNet: number;
  vatPercent: number;
  categoryCode: 'CAU_DUONG' | 'PHI_SAN_BAY';
  invoiceNo: string | null;
  matched: boolean;
  vehicle: { id: number; plateNumber: string } | null;
  trip: { id: number; pickupTime: string; pickupAddress: string; dropoffAddress: string | null; booking: { id: number; code: string } } | null;
}
interface TollList {
  rows: TollRow[];
  totals: { amount: number; toll: number; airport: number; unmatched: number; count: number };
}
interface ImportResult {
  files: { name: string; invoiceNo: string | null; lines: number; total: number | null; error?: string }[];
  lines: number;
  added: number;
  duplicates: number;
  matched: number;
  unmatched: number;
  unknownVehicle: string[];
  amount: number;
}

const CATEGORY = { CAU_DUONG: { label: 'Cầu đường / BOT', color: 'blue' }, PHI_SAN_BAY: { label: 'Phí sân bay', color: 'purple' } } as const;
const money = (v: number) => `${formatVnd(v)} đ`;

/** Gửi nhiều file hóa đơn cùng lúc (trường "files") */
async function uploadInvoices(files: File[]) {
  const body = new FormData();
  files.forEach((f) => body.append('files', f));
  const token = tokenStore.get();
  const res = await fetch('/api/tolls/import', { method: 'POST', body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.message ?? 'Không nhập được file');
  return data as ImportResult;
}

/**
 * Phí đường bộ, phí sân bay trừ tự động qua ePass: tải hóa đơn điện tử ePass mỗi tuần, phần mềm đọc từng lượt xe qua trạm
 * và gắn vào chi phí chuyến của xe theo giờ qua trạm.
 */
export default function TollsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>([dayjs().subtract(30, 'day'), dayjs()]);
  const [vehicleId, setVehicleId] = useState<number>();
  const [only, setOnly] = useState<'all' | 'unmatched'>('all');
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const { data: vehicles = [] } = useQuery({ queryKey: ['/vehicles', {}], queryFn: () => api<{ id: number; plateNumber: string; ownership: string }[]>('/vehicles') });
  const query = { from: range?.[0].format('YYYY-MM-DD'), to: range?.[1].format('YYYY-MM-DD'), vehicleId, unmatched: only === 'unmatched' ? 1 : undefined };
  const { data, isLoading } = useQuery({ queryKey: ['/tolls', query], queryFn: () => api<TollList>('/tolls', { query }) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['/tolls'] });

  async function doImport() {
    if (!pending.length) return;
    setBusy('import');
    try {
      const r = await uploadInvoices(pending);
      setResult(r);
      setPending([]);
      refresh();
      message.success(`Đã nhập ${r.added} lượt qua trạm, gắn vào chuyến ${r.matched} lượt`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function rematch() {
    setBusy('rematch');
    try {
      const r = await api<{ checked: number; matched: number }>('/tolls/rematch', { method: 'POST' });
      message.success(r.matched ? `Đã gắn thêm ${r.matched}/${r.checked} lượt vào chuyến` : `Chưa khớp thêm được lượt nào (${r.checked} lượt chưa gắn chuyến)`);
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function unassign(r: TollRow) {
    try {
      await api(`/tolls/${r.id}/assign`, { method: 'POST', body: { tripId: null } });
      message.success('Đã bỏ gắn chuyến');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const t = data?.totals;
  return (
    <Flex vertical gap={16}>
      <Card
        title={
          <Flex align="center" gap={8}>
            <CarOutlined /> Phí đường bộ & phí sân bay (ePass)
          </Flex>
        }
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          Mỗi tuần tải các <b>hóa đơn điện tử ePass</b> (file PDF hoặc XML, chọn nhiều file một lần). Phần mềm đọc từng lượt xe công ty qua trạm và ghi vào{' '}
          <b>chi phí chuyến</b> của xe: chuyến đang chạy lúc qua trạm, không có thì chuyến gần nhất cùng ngày. Phí ra vào sân bay ghi khoản mục <b>Phí sân bay</b>,
          còn lại <b>Cầu đường / BOT</b>; số tiền đã gồm thuế. Nhập lại file cũ không bị ghi trùng.
        </Typography.Paragraph>
        <Flex gap={8} wrap align="center">
          <Upload
            multiple
            accept=".pdf,.xml,application/pdf,text/xml,application/xml"
            fileList={pending.map((f, i) => ({ uid: String(i), name: f.name, status: 'done' as const }))}
            beforeUpload={(f) => {
              setPending((list) => [...list, f]);
              return false;
            }}
            onRemove={(f) => setPending((list) => list.filter((_, i) => String(i) !== f.uid))}
          >
            <Button icon={<FilePdfOutlined />}>Chọn file hóa đơn ePass</Button>
          </Upload>
          <Button type="primary" icon={<UploadOutlined />} disabled={!pending.length} loading={busy === 'import'} onClick={doImport}>
            Nhập {pending.length ? `${pending.length} file` : ''}
          </Button>
        </Flex>
        {result && (
          <Alert
            style={{ marginTop: 12 }}
            type={result.files.some((f) => f.error) || result.unknownVehicle.length ? 'warning' : 'success'}
            showIcon
            closable
            onClose={() => setResult(null)}
            message={`Đọc ${result.lines} lượt qua trạm: thêm mới ${result.added} (${money(result.amount)}), trùng đã có ${result.duplicates}; gắn vào chuyến ${result.matched}, chưa gắn ${result.unmatched}.`}
            description={
              <>
                {result.files.map((f) => (
                  <div key={f.name}>
                    {f.error ? (
                      <Typography.Text type="danger">
                        {f.name}: {f.error}
                      </Typography.Text>
                    ) : (
                      `${f.name}: hóa đơn số ${f.invoiceNo ?? '?'}, ${f.lines} lượt${f.total != null ? `, tổng ${money(f.total)}` : ''}`
                    )}
                  </div>
                ))}
                {!!result.unknownVehicle.length && <div>Biển số không có trong danh mục xe: {result.unknownVehicle.join(', ')} (thêm xe rồi bấm "Khớp lại chuyến").</div>}
              </>
            }
          />
        )}
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title={`Tổng (${t?.count ?? 0} lượt)`} value={t?.amount ?? 0} formatter={(v) => money(Number(v))} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Cầu đường / BOT" value={t?.toll ?? 0} formatter={(v) => money(Number(v))} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Phí sân bay" value={t?.airport ?? 0} formatter={(v) => money(Number(v))} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Chưa gắn chuyến (chi phí xe)" value={t?.unmatched ?? 0} formatter={(v) => money(Number(v))} valueStyle={t?.unmatched ? { color: '#d97706' } : undefined} />
          </Card>
        </Col>
      </Row>

      <Card>
        <Flex gap={8} wrap style={{ marginBottom: 12 }}>
          <DatePicker.RangePicker format="DD/MM/YYYY" value={range} onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)} />
          <Select
            allowClear
            placeholder="Xe"
            style={{ width: 150 }}
            value={vehicleId}
            onChange={setVehicleId}
            options={vehicles.filter((v) => v.ownership === 'CONG_TY').map((v) => ({ value: v.id, label: v.plateNumber }))}
          />
          <Segmented value={only} onChange={(v) => setOnly(v as typeof only)} options={[{ value: 'all', label: 'Tất cả' }, { value: 'unmatched', label: 'Chưa gắn chuyến' }]} />
          <Tooltip title="Gắn các lượt chưa có chuyến vào chuyến của xe (sau khi điều hành thêm chuyến / gán xe)">
            <Button icon={<SyncOutlined />} loading={busy === 'rematch'} onClick={rematch} style={{ marginLeft: 'auto' }}>
              Khớp lại chuyến
            </Button>
          </Tooltip>
        </Flex>
        <Table<TollRow>
          rowKey="id"
          size="middle"
          loading={isLoading}
          dataSource={data?.rows ?? []}
          scroll={{ x: 900 }}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          columns={[
            { title: 'Thời gian qua trạm', dataIndex: 'passedAt', width: 150, render: (v) => dayjs(v).format('HH:mm DD/MM/YYYY') },
            { title: 'Xe', width: 110, render: (_, r) => <b>{r.vehicle?.plateNumber ?? <Typography.Text type="danger">{r.plate}</Typography.Text>}</b> },
            { title: 'Trạm', dataIndex: 'station' },
            { title: 'Khoản mục', dataIndex: 'categoryCode', width: 140, render: (v: TollRow['categoryCode']) => <Tag color={CATEGORY[v].color}>{CATEGORY[v].label}</Tag> },
            {
              title: 'Số tiền',
              dataIndex: 'amount',
              width: 110,
              align: 'right',
              render: (v, r) => <Tooltip title={`Chưa thuế ${formatVnd(Math.round(r.amountNet))} đ + VAT ${r.vatPercent}%`}>{money(v)}</Tooltip>,
            },
            {
              title: 'Chuyến',
              width: 260,
              render: (_, r) =>
                r.matched && r.trip ? (
                  <Flex vertical gap={2}>
                    <Link to={`/bookings/${r.trip.booking.id}`}>
                      <LinkOutlined /> {r.trip.booking.code}
                    </Link>
                    <Clamp lines={1} style={{ fontSize: 12, color: '#64748b' }}>
                      {dayjs(r.trip.pickupTime).format('HH:mm DD/MM')} · {r.trip.pickupAddress}
                      {r.trip.dropoffAddress ? ` → ${r.trip.dropoffAddress}` : ''}
                    </Clamp>
                  </Flex>
                ) : (
                  <Tag color="gold">Chưa gắn chuyến</Tag>
                ),
            },
            { title: 'Hóa đơn', dataIndex: 'invoiceNo', width: 90 },
            {
              key: 'act',
              width: 90,
              render: (_, r) =>
                r.matched ? (
                  <Button size="small" type="link" onClick={() => unassign(r)}>
                    Bỏ gắn
                  </Button>
                ) : null,
            },
          ]}
        />
      </Card>
    </Flex>
  );
}
