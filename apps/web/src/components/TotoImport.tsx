import { CloudUploadOutlined, DeleteOutlined, ImportOutlined, PictureOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Flex, Modal, Select, Table, Tag, Typography, Upload } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiUpload, tokenStore } from '../api';
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
  /** Có khi đọc từ trang chi tiết PDF (chuyến bay, SĐT, email, yêu cầu, trạng thái) */
  detail?: unknown;
}

interface PlannedRow {
  reservationId: string;
  state: 'NEW' | 'EXISTS' | 'UPDATE' | 'CHANGED' | 'CANCELLED' | 'ERROR';
  messages: string[];
  /** Thông tin sẽ bổ sung vào booking đã nhập */
  fills: string[];
  booking: { id: number; code: string; status: string } | null;
  /** Các dòng cùng mã đặt chỗ = các chuyến của một booking */
  trips: {
    pickupTime: string | null;
    pickupAddress: string;
    dropoffAddress: string;
    vehicleType: string | null;
    passengers: number;
    amount: number;
    flightNumber: string | null;
    cancelled: boolean;
  }[];
  /** Tổng giá TOTO trả (gồm VAT) các chuyến chưa hủy */
  amount: number;
  customerName: string;
  program: string;
  hasPhone: boolean;
}

/** Mỗi chuyến của booking một dòng nhỏ trong ô (booking nhiều chuyến hiện đủ các chuyến) */
const tripLines = (r: PlannedRow, line: (t: PlannedRow['trips'][number]) => React.ReactNode) => (
  <>
    {r.trips.map((t, i) => (
      <div key={i} style={{ textDecoration: t.cancelled ? 'line-through' : undefined, color: t.cancelled ? '#94a3b8' : undefined, marginTop: i ? 6 : 0 }}>
        {line(t)}
      </div>
    ))}
  </>
);
interface Preview {
  rows: PlannedRow[];
  missing: { id: number; code: string; customerRef: string | null; contactName: string; pickupTime: string | null }[];
  range: { from: string; to: string } | null;
  counts: { new: number; exists: number; update: number; changed: number; cancelled: number; error: number };
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
  UPDATE: { label: 'Đã nhập – sẽ bổ sung', color: 'blue' },
  CHANGED: { label: 'Đã thay đổi', color: 'orange' },
  CANCELLED: { label: 'Đã hủy trên TOTO', color: 'red' },
  ERROR: { label: 'Không nhập được', color: 'red' },
};

/** Trang chi tiết đặt chỗ TOTO in ra PDF: máy chủ đọc (mỗi file một booking) */
async function readTotoPdfs(files: File[]) {
  const body = new FormData();
  for (const f of files) body.append('files', f);
  const token = tokenStore.get();
  const res = await fetch('/api/ota/toto/pdf', { method: 'POST', body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(Array.isArray(data?.message) ? data.message.join('\n') : (data?.message ?? 'Không đọc được file PDF'));
  return data as { rows: TotoRow[]; errors: { file: string; message: string }[] };
}

/** File bảng đón đã chọn, ghép với booking theo mã đặt chỗ / tên khách (hoặc văn phòng tự chọn) */
interface SignFile {
  file: File;
  reservationId: string | null;
  by: 'ma' | 'ten' | 'tay' | null;
}
const SIGN_TYPES: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const SIGN_BY: Record<string, { label: string; color: string }> = {
  ma: { label: 'Theo mã đặt chỗ', color: 'green' },
  ten: { label: 'Theo tên khách', color: 'cyan' },
  tay: { label: 'Chọn tay', color: 'blue' },
};

/** Máy chủ đọc nội dung các file bảng đón để ghép với booking (file chưa lưu ở bước này) */
async function matchSigns(files: File[], candidates: { reservationId: string; customerName: string }[]) {
  const body = new FormData();
  for (const f of files) body.append('files', f);
  body.append('candidates', JSON.stringify(candidates));
  const token = tokenStore.get();
  const res = await fetch('/api/ota/toto/sign-match', { method: 'POST', body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(Array.isArray(data?.message) ? data.message.join('\n') : (data?.message ?? 'Không đọc được file bảng đón'));
  return data as { file: string; reservationId: string | null; by: 'ma' | 'ten' | null }[];
}

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

  const [signs, setSigns] = useState<SignFile[]>([]);

  function reset() {
    setFileName(null);
    setRows(null);
    setPreview(null);
    setError(null);
    setSigns([]);
  }

  // Booking nhận được bảng đón: booking mới / đã nhập trong bảng xem trước (không tính đơn đã hủy, lỗi)
  const signTargets = (preview?.rows ?? []).filter((x) => x.state !== 'CANCELLED' && x.state !== 'ERROR');

  async function pickSigns(files: File[]) {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await matchSigns(files, signTargets.map((x) => ({ reservationId: x.reservationId, customerName: x.customerName })));
      setSigns((old) => [
        // Chọn lại cùng tên file: thay file cũ
        ...old.filter((o) => !files.some((f) => f.name === o.file.name)),
        ...files.map((file, i) => ({ file, reservationId: res[i]?.reservationId ?? null, by: res[i]?.by ?? null })),
      ]);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Tải bảng đón lên từng booking (sau khi nhập: booking mới đã có mã) */
  async function uploadSigns(created: { reservationId: string; id: number }[]) {
    const idOf = (rid: string) => created.find((c) => c.reservationId === rid)?.id ?? preview?.rows.find((x) => x.reservationId === rid)?.booking?.id;
    const done: string[] = [];
    const failed: string[] = [];
    for (const sg of signs.filter((x) => x.reservationId)) {
      const id = idOf(sg.reservationId!);
      if (!id) {
        failed.push(`${sg.file.name} (booking #${sg.reservationId} chưa được nhập)`);
        continue;
      }
      try {
        // Loại file theo đuôi (một số máy không gắn loại file khi chọn): máy chủ chỉ nhận PDF / ảnh
        const type = SIGN_TYPES[sg.file.name.split('.').pop()!.toLowerCase()] ?? sg.file.type;
        await apiUpload(`/bookings/${id}/sign-file`, sg.file.type === type ? sg.file : new File([sg.file], sg.file.name, { type }));
        done.push(sg.file.name);
      } catch (e) {
        failed.push(`${sg.file.name}: ${(e as Error).message}`);
      }
    }
    if (done.length) message.success(`Đã lưu ${done.length} bảng đón vào booking`);
    if (failed.length) message.error(`${failed.length} bảng đón chưa lưu được: ${failed.join('; ')}`, 10);
    setSigns((old) => old.filter((x) => !done.includes(x.file.name)));
  }

  const [pdfErrors, setPdfErrors] = useState<{ file: string; message: string }[]>([]);

  async function pick(files: File[]) {
    reset();
    setPdfErrors([]);
    const pdfs = files.filter((f) => /\.pdf$/i.test(f.name));
    const xlsx = files.filter((f) => /\.xlsx$/i.test(f.name));
    setFileName(files.length === 1 ? files[0].name : `${files.length} file`);
    setBusy(true);
    try {
      if (xlsx.length > 1 || (xlsx.length && pdfs.length)) throw new Error('Chọn 1 file Excel, hoặc một / nhiều file PDF trang chi tiết – không chọn lẫn hai loại');
      let data: TotoRow[];
      if (pdfs.length) {
        const res = await readTotoPdfs(pdfs);
        setPdfErrors(res.errors);
        data = res.rows;
      } else if (xlsx.length) data = await readTotoFile(xlsx[0]);
      else throw new Error('Chọn file .xlsx (Booking List) hoặc .pdf (trang chi tiết đặt chỗ)');
      if (!data.length) throw new Error('Không đọc được booking nào trong file');
      setRows(data);
      setPreview(await api<Preview>('/ota/toto/preview', { method: 'POST', body: { rows: data } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    if (!rows || !preview) return;
    setBusy(true);
    try {
      const needImport = preview.counts.new + preview.rows.filter((x) => x.fills.length).length > 0;
      const res = needImport
        ? await api<{ created: { reservationId: string; id: number; code: string; trips: number }[]; updated: { reservationId: string; code: string }[]; failed: { reservationId: string; message: string }[] }>('/ota/toto/import', { method: 'POST', body: { rows } })
        : { created: [], updated: [], failed: [] };
      if (signs.some((x) => x.reservationId)) await uploadSigns(res.created);
      if (res.created.length) message.success(`Đã nhập ${res.created.length} booking TOTO · ${res.created.reduce((n, c) => n + c.trips, 0)} chuyến (đã xác nhận, chờ điều xe)`);
      if (res.updated.length) message.success(`Đã bổ sung thông tin cho ${res.updated.length} booking: ${res.updated.map((u) => u.code).join(', ')}`);
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
            <Typography.Text type="secondary">Giá TOTO trả đã gồm VAT: tự tách giá chưa thuế + VAT 8%, xuất hóa đơn · ghi công nợ khách hàng "Toto Booking"</Typography.Text>
            <Button
              type="primary"
              icon={<ImportOutlined />}
              disabled={!preview || !(preview.counts.new + preview.rows.filter((x) => x.fills.length).length + signs.filter((x) => x.reservationId).length)}
              loading={busy && !!preview}
              onClick={doImport}
            >
              {[
                preview?.counts.new || !(preview?.rows.some((x) => x.fills.length) || signs.some((x) => x.reservationId)) ? `Nhập ${preview?.counts.new ?? 0} booking mới` : null,
                preview?.rows.some((x) => x.fills.length) ? `bổ sung ${preview.rows.filter((x) => x.fills.length).length}` : null,
                signs.some((x) => x.reservationId) ? `lưu ${signs.filter((x) => x.reservationId).length} bảng đón` : null,
              ]
                .filter(Boolean)
                .join(' · ')
                .replace(/^./, (c) => c.toUpperCase())}
            </Button>
          </Flex>
        }
      >
        <Upload.Dragger
          accept=".xlsx,.pdf"
          multiple
          showUploadList={false}
          beforeUpload={(f, list) => {
            // Chọn nhiều file: xử lý một lần cho cả nhóm
            if (f === list[0]) pick(list as unknown as File[]);
            return false;
          }}
          disabled={busy}
          style={{ marginBottom: 12 }}
        >
          <p className="ant-upload-drag-icon">
            <CloudUploadOutlined />
          </p>
          <p>{fileName ? `Đã chọn: ${fileName} – bấm để chọn file khác` : 'Bấm hoặc kéo vào đây: file Excel "Booking List", hoặc một / nhiều file PDF trang chi tiết đặt chỗ TOTO'}</p>
          <p className="ant-upload-hint">
            PDF trang chi tiết có thêm chuyến bay, SĐT, email, yêu cầu của khách: booking chưa có thì tạo đầy đủ, đã có thì bổ sung chỗ còn trống. Nhập lại file cũ không tạo trùng.
          </p>
        </Upload.Dragger>

        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
        {pdfErrors.length > 0 && (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`${pdfErrors.length} file PDF không đọc được`} description={pdfErrors.map((e) => `${e.file}: ${e.message}`).join(' · ')} />
        )}

        {preview && (
          <>
            <Flex gap={8} wrap style={{ marginBottom: 8 }}>
              {preview.range && <Tag>Ngày đón {dayjs(preview.range.from).format('DD/MM')} – {dayjs(preview.range.to).format('DD/MM/YYYY')}</Tag>}
              <Tag color="green">Mới: {preview.counts.new}</Tag>
              <Tag>Đã nhập: {preview.counts.exists}</Tag>
              {preview.counts.update > 0 && <Tag color="blue">Sẽ bổ sung: {preview.counts.update}</Tag>}
              {preview.counts.changed > 0 && <Tag color="orange">Đã thay đổi: {preview.counts.changed}</Tag>}
              {preview.counts.cancelled > 0 && <Tag color="red">Đã hủy trên TOTO: {preview.counts.cancelled}</Tag>}
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
                      {r.trips.length > 1 && <div style={{ fontSize: 12, color: '#64748b' }}>{r.trips.length} chuyến</div>}
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
                {
                  title: 'Giờ đón',
                  render: (_, r) =>
                    tripLines(r, (t) => (
                      <>
                        {t.pickupTime ? dayjs(t.pickupTime).format('HH:mm DD/MM/YYYY') : '—'}
                        {t.flightNumber && <span style={{ fontSize: 12, color: '#1d4ed8' }}> ✈ {t.flightNumber}</span>}
                      </>
                    )),
                },
                { title: 'Hành trình', render: (_, r) => tripLines(r, (t) => [t.pickupAddress, t.dropoffAddress].filter(Boolean).join(' → ')) },
                { title: 'Xe / khách', render: (_, r) => tripLines(r, (t) => `${t.vehicleType ?? '—'} · ${t.passengers} khách`) },
                { title: 'Khách', dataIndex: 'customerName' },
                {
                  title: 'Giá TOTO trả (gồm VAT)',
                  dataIndex: 'amount',
                  align: 'right',
                  render: (v, r) =>
                    r.trips.length > 1 ? (
                      <>
                        {tripLines(r, (t) => `${formatVnd(t.amount)}đ`)}
                        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 4, fontWeight: 700 }}>{formatVnd(v)}đ</div>
                      </>
                    ) : (
                      `${formatVnd(v)}đ`
                    ),
                },
                {
                  title: 'Tình trạng',
                  render: (_, r) => (
                    <>
                      <Tag color={STATE[r.state].color}>{STATE[r.state].label}</Tag>
                      {r.messages.map((m) => (
                        <div key={m} style={{ fontSize: 12, color: r.state === 'ERROR' || r.state === 'CANCELLED' ? '#b91c1c' : '#b45309' }}>
                          {m}
                        </div>
                      ))}
                      {r.fills.map((m) => (
                        <div key={m} style={{ fontSize: 12, color: '#1d4ed8' }}>
                          + {m}
                        </div>
                      ))}
                    </>
                  ),
                },
              ]}
            />
            <div style={{ marginTop: 16 }}>
              <Typography.Text strong>
                <PictureOutlined /> Bảng đón (không bắt buộc)
              </Typography.Text>
              <Upload.Dragger
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                multiple
                showUploadList={false}
                beforeUpload={(f, list) => {
                  if (f === list[0]) pickSigns(list as unknown as File[]);
                  return false;
                }}
                disabled={busy}
                style={{ marginTop: 6 }}
              >
                <p style={{ margin: 0 }}>Bấm hoặc kéo vào đây các file bảng đón (PDF / ảnh) của các booking trên – chọn nhiều file một lần</p>
                <p className="ant-upload-hint" style={{ margin: 0 }}>
                  Phần mềm ghép theo mã đặt chỗ hoặc tên khách có trong tên file / nội dung PDF; không ghép được thì chọn booking ở cột "Booking". Booking đã có bảng đón sẽ được thay bằng file mới.
                </p>
              </Upload.Dragger>
              {signs.length > 0 && (
                <Table
                  rowKey={(x) => x.file.name}
                  size="small"
                  style={{ marginTop: 8 }}
                  pagination={false}
                  dataSource={signs}
                  columns={[
                    { title: 'File bảng đón', render: (_, x) => x.file.name },
                    {
                      title: 'Booking',
                      width: 340,
                      render: (_, x) => (
                        <Select
                          style={{ width: '100%' }}
                          placeholder="Chọn booking"
                          allowClear
                          value={x.reservationId ?? undefined}
                          status={x.reservationId ? undefined : 'warning'}
                          options={signTargets.map((t) => ({ value: t.reservationId, label: `#${t.reservationId} · ${t.customerName || '—'}${t.booking ? ` · ${t.booking.code}` : ' · mới'}` }))}
                          onChange={(v: string | undefined) => setSigns((old) => old.map((o) => (o.file === x.file ? { ...o, reservationId: v ?? null, by: v ? 'tay' : null } : o)))}
                        />
                      ),
                    },
                    { title: 'Ghép', width: 140, render: (_, x) => (x.by ? <Tag color={SIGN_BY[x.by].color}>{SIGN_BY[x.by].label}</Tag> : <Tag color="orange">Chưa ghép</Tag>) },
                    {
                      title: '',
                      width: 44,
                      render: (_, x) => <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setSigns((old) => old.filter((o) => o.file !== x.file))} />,
                    },
                  ]}
                />
              )}
            </div>
            {preview.counts.changed > 0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 12 }}
                message="Có booking TOTO đã thay đổi"
                description="Phần mềm không tự sửa giờ, điểm, số khách, giá hay tự hủy booking đã nhập (có thể đã điều xe). Mở booking theo mã ở cột đầu, sửa / hủy theo thông tin mới và báo lái xe / nhà xe."
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
                          · TOTO #{m.customerRef} · {m.contactName}
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
