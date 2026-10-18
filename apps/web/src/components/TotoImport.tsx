import { CloudUploadOutlined, ImportOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Flex, Modal, Table, Tag, Typography, Upload } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatVnd } from './common';

/** Một dòng file "Booking List" của trang nhà cung cấp TOTO Booking */
interface TotoRow {
  reservationId: string;
  carType: string;
  programName: string;
  route: string;
  meetingPlace: string;
  dropPlace: string;
  customerName: string;
  meetingTime: string;
  adult: number;
  child: number;
  infant: number;
  totalPax: number;
  checkInDate: string;
  totalAmount: number;
  additionalOption: string;
}

interface PlannedRow {
  reservationId: string;
  state: 'NEW' | 'EXISTS' | 'CHANGED' | 'ERROR';
  messages: string[];
  booking: { id: number; code: string; status: string } | null;
  pickupTime: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType: string | null;
  passengers: number;
  amount: number;
  customerName: string;
  program: string;
}
interface Preview {
  rows: PlannedRow[];
  missing: { id: number; code: string; customerRef: string | null; contactName: string; pickupTime: string | null }[];
  range: { from: string; to: string } | null;
  counts: { new: number; exists: number; changed: number; error: number };
}

/** Tiêu đề cột trong file → trường (không phân biệt hoa thường, khoảng trắng) */
const COLUMNS: Record<string, keyof TotoRow> = {
  reservationid: 'reservationId',
  cartype: 'carType',
  programname: 'programName',
  route: 'route',
  meetingplace: 'meetingPlace',
  dropplace: 'dropPlace',
  customername: 'customerName',
  meetingtime: 'meetingTime',
  adult: 'adult',
  child: 'child',
  infant: 'infant',
  totalpax: 'totalPax',
  checkindate: 'checkInDate',
  totalamount: 'totalAmount',
  nettprice: 'totalAmount',
  additionaloption: 'additionalOption',
};
const NUMERIC = new Set<keyof TotoRow>(['adult', 'child', 'infant', 'totalPax', 'totalAmount']);
const key = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '');

/** Đọc file Excel TOTO (sheet đầu, dòng tiêu đề có "Reservation ID") */
async function readTotoFile(file: File): Promise<TotoRow[]> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('File không có sheet nào');
  let headRow = 0;
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    if (ws.getRow(r).values && (ws.getRow(r).values as unknown[]).some((v) => typeof v === 'string' && key(v) === 'reservationid')) {
      headRow = r;
      break;
    }
  }
  if (!headRow) throw new Error('Không thấy cột "Reservation ID" – có phải file Booking List xuất từ trang nhà cung cấp TOTO không?');
  const fields = new Map<number, keyof TotoRow>();
  const heads = new Map<string, number>();
  ws.getRow(headRow).eachCell((cell, col) => heads.set(key(cell.text), col));
  for (const [h, col] of heads) {
    const f = COLUMNS[h];
    // Giá: ưu tiên "Total Amount" (gồm tùy chọn thêm), không có mới dùng "Nett Price"
    if (f && !(h === 'nettprice' && heads.has('totalamount'))) fields.set(col, f);
  }
  const rows: TotoRow[] = [];
  for (let r = headRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const o: Record<string, string | number> = {};
    for (const [col, f] of fields) {
      const text = row.getCell(col).text.trim();
      o[f] = NUMERIC.has(f) ? Number(text.replace(/[^\d.-]/g, '')) || 0 : text;
    }
    if (String(o.reservationId ?? '').trim()) rows.push(o as unknown as TotoRow);
  }
  return rows;
}

const STATE: Record<PlannedRow['state'], { label: string; color: string }> = {
  NEW: { label: 'Mới – sẽ nhập', color: 'green' },
  EXISTS: { label: 'Đã nhập', color: 'default' },
  CHANGED: { label: 'Đã thay đổi', color: 'orange' },
  ERROR: { label: 'Không nhập được', color: 'red' },
};

/** Nút "Nhập từ TOTO" ở trang Booking: chọn file Excel → xem trước → nhập booking mới */
export function TotoImportButton() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<TotoRow[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFileName(null);
    setRows(null);
    setPreview(null);
    setError(null);
  }

  async function pick(file: File) {
    reset();
    setFileName(file.name);
    setBusy(true);
    try {
      const data = await readTotoFile(file);
      if (!data.length) throw new Error('File không có dòng booking nào');
      setRows(data);
      setPreview(await api<Preview>('/ota/toto/preview', { method: 'POST', body: { rows: data } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    if (!rows) return;
    setBusy(true);
    try {
      const res = await api<{ created: { reservationId: string; code: string }[]; failed: { reservationId: string; message: string }[] }>('/ota/toto/import', { method: 'POST', body: { rows } });
      if (res.created.length) message.success(`Đã nhập ${res.created.length} booking TOTO (đã xác nhận, chờ điều xe)`);
      if (res.failed.length) message.error(`${res.failed.length} booking không nhập được: ${res.failed.map((f) => `#${f.reservationId} – ${f.message}`).join('; ')}`, 10);
      queryClient.invalidateQueries({ queryKey: ['/bookings'] });
      setPreview(await api<Preview>('/ota/toto/preview', { method: 'POST', body: { rows } }));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button icon={<ImportOutlined />} onClick={() => setOpen(true)}>
        Nhập từ TOTO
      </Button>
      <Modal
        open={open}
        title="Nhập booking từ TOTO Booking"
        width={1100}
        onCancel={() => {
          setOpen(false);
          reset();
        }}
        destroyOnHidden
        footer={
          <Flex justify="space-between" align="center" wrap gap={8}>
            <Typography.Text type="secondary">Giá trong file tính bằng nghìn đồng (giá TOTO trả) · ghi công nợ khách hàng "TOTO Booking"</Typography.Text>
            <Button type="primary" icon={<ImportOutlined />} disabled={!preview?.counts.new} loading={busy && !!preview} onClick={doImport}>
              Nhập {preview?.counts.new ?? 0} booking mới
            </Button>
          </Flex>
        }
      >
        <Upload.Dragger
          accept=".xlsx"
          showUploadList={false}
          beforeUpload={(f) => {
            pick(f);
            return false;
          }}
          disabled={busy}
          style={{ marginBottom: 12 }}
        >
          <p className="ant-upload-drag-icon">
            <CloudUploadOutlined />
          </p>
          <p>{fileName ? `Đã chọn: ${fileName} – bấm để chọn file khác` : 'Bấm hoặc kéo file Excel "Booking List" xuất từ trang nhà cung cấp TOTO vào đây'}</p>
          <p className="ant-upload-hint">Nhập lại file cũ không tạo trùng: booking đã nhập được nhận ra bằng mã đặt chỗ (Reservation ID).</p>
        </Upload.Dragger>

        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}

        {preview && (
          <>
            <Flex gap={8} wrap style={{ marginBottom: 8 }}>
              {preview.range && <Tag>Ngày đón {dayjs(preview.range.from).format('DD/MM')} – {dayjs(preview.range.to).format('DD/MM/YYYY')}</Tag>}
              <Tag color="green">Mới: {preview.counts.new}</Tag>
              <Tag>Đã nhập: {preview.counts.exists}</Tag>
              {preview.counts.changed > 0 && <Tag color="orange">Đã thay đổi: {preview.counts.changed}</Tag>}
              {preview.counts.error > 0 && <Tag color="red">Lỗi: {preview.counts.error}</Tag>}
            </Flex>
            <Table
              rowKey="reservationId"
              size="small"
              dataSource={preview.rows}
              pagination={preview.rows.length > 20 ? { pageSize: 20 } : false}
              scroll={{ x: 900 }}
              columns={[
                {
                  title: 'Mã TOTO',
                  dataIndex: 'reservationId',
                  render: (v, r) => (
                    <>
                      <b>{v}</b>
                      {r.booking && (
                        <div>
                          <Link to={`/bookings/${r.booking.id}`} target="_blank">
                            {r.booking.code}
                          </Link>
                        </div>
                      )}
                    </>
                  ),
                },
                { title: 'Giờ đón', dataIndex: 'pickupTime', render: (v) => (v ? dayjs(v).format('HH:mm DD/MM/YYYY') : '—') },
                { title: 'Hành trình', render: (_, r) => <span>{[r.pickupAddress, r.dropoffAddress].filter(Boolean).join(' → ')}</span> },
                { title: 'Xe / khách', render: (_, r) => `${r.vehicleType ?? '—'} · ${r.passengers} khách` },
                { title: 'Khách', dataIndex: 'customerName' },
                { title: 'Giá TOTO trả', dataIndex: 'amount', align: 'right', render: (v) => `${formatVnd(v)}đ` },
                {
                  title: 'Tình trạng',
                  render: (_, r) => (
                    <>
                      <Tag color={STATE[r.state].color}>{STATE[r.state].label}</Tag>
                      {r.messages.map((m) => (
                        <div key={m} style={{ fontSize: 12, color: r.state === 'ERROR' ? '#b91c1c' : '#b45309' }}>
                          {m}
                        </div>
                      ))}
                    </>
                  ),
                },
              ]}
            />
            {preview.counts.changed > 0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 12 }}
                message="Có booking TOTO đã thay đổi"
                description="Phần mềm không tự sửa booking đã nhập (có thể đã điều xe). Mở booking theo mã ở cột đầu, sửa chuyến theo thông tin mới và báo lái xe / nhà xe."
              />
            )}
            {preview.missing.length > 0 && (
              <Alert
                type="error"
                showIcon
                style={{ marginTop: 12 }}
                message={`${preview.missing.length} booking TOTO cùng ngày không còn trong file – có thể TOTO đã hủy`}
                description={
                  <>
                    Kiểm tra trên trang TOTO; nếu đã hủy thì mở booking và bấm Hủy booking:
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {preview.missing.map((m) => (
                        <li key={m.id}>
                          <Link to={`/bookings/${m.id}`} target="_blank">
                            {m.code}
                          </Link>{' '}
                          · {m.customerRef?.replace(/^TOTO-/, 'TOTO #')} · {m.contactName}
                          {m.pickupTime ? ` · đón ${dayjs(m.pickupTime).format('HH:mm DD/MM')}` : ''}
                        </li>
                      ))}
                    </ul>
                  </>
                }
              />
            )}
          </>
        )}
      </Modal>
    </>
  );
}
