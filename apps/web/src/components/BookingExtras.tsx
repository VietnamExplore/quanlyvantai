import {
  DeleteOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  InboxOutlined,
  PlusOutlined,
  PrinterOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, Flex, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Typography, Upload, type FormInstance } from 'antd';
import { useEffect, useState } from 'react';
import { api, apiBlob, apiUpload } from '../api';
import { useAuth } from '../auth';
import { CONTACT_APP, guessContactApp, type ContactApp } from '../contact-apps';
import type { Booking, Passenger } from '../types';
import { ResponsiveTable } from './ResponsiveTable';

const GENDER_OPTIONS = [
  { value: 'NAM', label: 'Nam' },
  { value: 'NU', label: 'Nữ' },
];

/** Bỏ dấu, chữ thường: so khớp "Nữ", "nu", "Female"… */
const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
    .trim();

function parseGender(s: string): 'NAM' | 'NU' | null {
  const v = plain(s);
  if (['nam', 'male', 'm', 'ong', 'mr'].includes(v)) return 'NAM';
  if (['nu', 'female', 'f', 'ba', 'mrs', 'ms', 'miss'].includes(v)) return 'NU';
  return null;
}

/** Năm sinh từ "1985", "12/03/1985", "1985-03-12" */
function parseYear(s: string): number | null {
  const m = s.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

/**
 * Đọc nội dung dán từ Excel / Google Sheets (cột cách nhau bằng Tab) hoặc mỗi dòng một tên.
 * Thứ tự cột: Họ tên | Giới tính | Năm sinh | CCCD/Hộ chiếu | Quốc tịch | SĐT | Ghi chú.
 * Dòng tiêu đề (có chữ "họ tên"/"name") được bỏ qua.
 */
export function parsePassengers(text: string): Passenger[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split('\t').map((c) => c.trim()))
    .filter((cols) => cols[0] && !/^(stt|ho ten|ho va ten|full ?name|name)$/i.test(plain(cols[0])))
    // Cột đầu là số thứ tự thì bỏ
    .map((cols) => (/^\d{1,3}\.?$/.test(cols[0]) && cols.length > 1 ? cols.slice(1) : cols))
    .filter((cols) => cols[0])
    .map((c) => ({
      fullName: c[0],
      gender: parseGender(c[1] ?? ''),
      birthYear: parseYear(c[2] ?? ''),
      idNumber: c[3] || null,
      nationality: c[4] || null,
      phone: c[5] || null,
      note: c[6] || null,
    }));
}

interface PassengersCardProps {
  form: FormInstance;
  readOnly: boolean;
  /** Số khách lớn nhất trong các chuyến, để cảnh báo khi danh sách không khớp */
  tripPassengers: number;
  canPrint: boolean;
  bookingId?: number;
  onChanged: () => void;
}

export function PassengersCard({ form, readOnly, tripPassengers, canPrint, bookingId, onChanged }: PassengersCardProps) {
  const { message } = App.useApp();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const list: Passenger[] = Form.useWatch('passengers', form) ?? [];
  const count = list.filter((p) => p?.fullName?.trim()).length;
  const preview = pasteText ? parsePassengers(pasteText) : [];

  function importPasted() {
    if (!preview.length) return;
    const current = ((form.getFieldValue('passengers') ?? []) as Passenger[]).filter((p) => p?.fullName?.trim());
    form.setFieldsValue({ passengers: [...current, ...preview] });
    onChanged();
    message.success(`Đã thêm ${preview.length} hành khách`);
    setPasteText('');
    setPasteOpen(false);
  }

  return (
    <Card
      title={`Danh sách hành khách (${count})`}
      style={{ marginTop: 16 }}
      extra={
        <Space wrap>
          {!readOnly && (
            <Button icon={<FileExcelOutlined />} onClick={() => setPasteOpen(true)}>
              Dán từ Excel
            </Button>
          )}
          <Button icon={<PrinterOutlined />} href={bookingId ? `/bookings/${bookingId}/passengers` : undefined} target="_blank" disabled={!canPrint || !count}>
            In danh sách
          </Button>
        </Space>
      }
    >
      {tripPassengers > 0 && count > 0 && count !== tripPassengers && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          title={`Danh sách có ${count} người, chuyến ghi ${tripPassengers} khách. Kiểm tra lại số khách cho khớp.`}
        />
      )}
      <Form.List name="passengers">
        {(fields, { add, remove }) => (
          <>
            <ResponsiveTable
              size="small"
              pagination={false}
              rowKey="key"
              dataSource={fields}
              locale={{ emptyText: 'Chưa có hành khách. Thêm từng người hoặc dán danh sách từ Excel.' }}
              columns={[
                { title: '#', width: 40, render: (_, __, i) => i + 1 },
                {
                  title: 'Họ tên',
                  width: 220,
                  render: (_, f) => (
                    <Form.Item name={[f.name, 'fullName']} noStyle rules={[{ required: true, message: 'Nhập họ tên' }]}>
                      <Input placeholder="Nguyễn Văn A" />
                    </Form.Item>
                  ),
                },
                {
                  title: 'Giới tính',
                  width: 100,
                  render: (_, f) => (
                    <Form.Item name={[f.name, 'gender']} noStyle>
                      <Select allowClear options={GENDER_OPTIONS} style={{ width: '100%' }} />
                    </Form.Item>
                  ),
                },
                {
                  title: 'Năm sinh',
                  width: 100,
                  render: (_, f) => (
                    <Form.Item name={[f.name, 'birthYear']} noStyle>
                      <InputNumber min={1900} max={2100} controls={false} style={{ width: '100%' }} />
                    </Form.Item>
                  ),
                },
                {
                  title: 'CCCD / Hộ chiếu',
                  width: 160,
                  render: (_, f) => (
                    <Form.Item name={[f.name, 'idNumber']} noStyle>
                      <Input />
                    </Form.Item>
                  ),
                },
                {
                  title: 'Quốc tịch',
                  width: 120,
                  render: (_, f) => (
                    <Form.Item name={[f.name, 'nationality']} noStyle>
                      <Input placeholder="Việt Nam" />
                    </Form.Item>
                  ),
                },
                {
                  title: 'SĐT',
                  width: 130,
                  render: (_, f) => (
                    <Form.Item name={[f.name, 'phone']} noStyle>
                      <Input />
                    </Form.Item>
                  ),
                },
                {
                  title: 'Ghi chú',
                  width: 180,
                  render: (_, f) => (
                    <Form.Item name={[f.name, 'note']} noStyle>
                      <Input placeholder="Trẻ em, ăn chay…" />
                    </Form.Item>
                  ),
                },
                ...(!readOnly
                  ? [
                      {
                        key: 'del',
                        width: 44,
                        render: (_: unknown, f: { name: number }) => (
                          <Button type="text" danger icon={<DeleteOutlined />} title="Xóa" onClick={() => { remove(f.name); onChanged(); }} />
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            {!readOnly && (
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ fullName: '' })} style={{ marginTop: 8 }} block>
                Thêm hành khách
              </Button>
            )}
          </>
        )}
      </Form.List>

      <Modal
        title="Dán danh sách hành khách từ Excel"
        open={pasteOpen}
        onCancel={() => setPasteOpen(false)}
        onOk={importPasted}
        okText={preview.length ? `Thêm ${preview.length} hành khách` : 'Thêm'}
        okButtonProps={{ disabled: !preview.length }}
        cancelText="Hủy"
        width={760}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          Trong Excel, bôi đen các dòng rồi Copy (Ctrl+C), dán (Ctrl+V) vào ô dưới. Thứ tự cột:{' '}
          <b>Họ tên · Giới tính · Năm sinh · CCCD/Hộ chiếu · Quốc tịch · SĐT · Ghi chú</b>. Chỉ có họ tên (mỗi dòng một người) cũng được. Dòng tiêu đề và
          cột STT được tự bỏ qua.
        </Typography.Paragraph>
        <Input.TextArea rows={8} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'Nguyễn Văn An\tNam\t1985\t079085001234\tViệt Nam\t0901234567\nTrần Thị Bình\tNữ\t1990'} />
        {preview.length > 0 && (
          <ResponsiveTable
            size="small"
            style={{ marginTop: 12 }}
            pagination={false}
            scroll={{ y: 200 }}
            rowKey="key"
            dataSource={preview.map((p, i) => ({ ...p, key: i }))}
            columns={[
              { title: 'Họ tên', dataIndex: 'fullName' },
              { title: 'Giới tính', dataIndex: 'gender', render: (v) => (v === 'NAM' ? 'Nam' : v === 'NU' ? 'Nữ' : '') },
              { title: 'Năm sinh', dataIndex: 'birthYear' },
              { title: 'CCCD/HC', dataIndex: 'idNumber' },
              { title: 'Quốc tịch', dataIndex: 'nationality' },
              { title: 'SĐT', dataIndex: 'phone' },
            ]}
          />
        )}
      </Modal>
    </Card>
  );
}

interface SignCardProps {
  form: FormInstance;
  defaultTitle: string;
  canPrint: boolean;
  bookingId?: number;
  /** Booking mới (chưa lưu): file bảng đón khách gửi đang chờ, sẽ tải lên ngay sau khi lưu booking */
  pendingFile?: File | null;
  onPendingFile?: (f: File | null) => void;
  /** false = chỉ xem (booking của người khác / đã hủy) */
  editable?: boolean;
}

/** Thông tin bảng đón khách (cầm ở sân bay / khách sạn) */
export function SignCard({ form, defaultTitle, canPrint, bookingId, pendingFile, onPendingFile, editable = true }: SignCardProps) {
  const title: string = Form.useWatch('signTitle', form) || defaultTitle;
  const subtitle: string | undefined = Form.useWatch('signSubtitle', form);
  const saved = useSignFile(bookingId);
  const pendingUrl = useObjectUrl(bookingId ? null : pendingFile);

  // Booking đã lưu: dùng file trên máy chủ; booking mới: dùng file đang chờ
  const shown: ShownFile | null = bookingId
    ? saved.info?.signFile
      ? { name: saved.info.signFileName ?? 'bang-don', type: saved.info.signFileType ?? '', url: saved.url }
      : null
    : pendingFile
      ? { name: pendingFile.name, type: pendingFile.type, url: pendingUrl, pending: true }
      : null;

  return (
    <Card
      title="Bảng đón khách"
      style={{ marginTop: 16 }}
      extra={
        <Button
          icon={<PrinterOutlined />}
          href={bookingId ? `/bookings/${bookingId}/sign` : undefined}
          target="_blank"
          // Đã có file của khách thì in được ngay; bảng tự tạo cần lưu booking trước
          disabled={!bookingId || (!saved.info?.signFile && !canPrint)}
        >
          In bảng đón (A4 ngang)
        </Button>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Form.Item name="signTitle" label="Dòng chính (tên khách / đoàn)" extra="Bỏ trống sẽ dùng tên khách hàng">
            <Input placeholder={defaultTitle || 'MR. JOHN SMITH'} />
          </Form.Item>
          <Form.Item name="signSubtitle" label="Dòng phụ">
            <Input placeholder="Welcome to Da Nang · Đoàn khảo sát ABC" />
          </Form.Item>
          <SignFileBox bookingId={bookingId} shown={shown} onSaved={saved.refetch} onPendingFile={onPendingFile} editable={editable} />
        </Col>
        <Col xs={24} md={12}>
          <Typography.Text type="secondary">{shown?.url ? 'Xem trước: bảng đón khách gửi (sẽ được in)' : 'Xem trước'}</Typography.Text>
          {shown?.url && shown.type.startsWith('image/') ? (
            <Flex align="center" justify="center" style={{ border: '1px solid #d9d9d9', borderRadius: 6, aspectRatio: '297 / 210', marginTop: 4, overflow: 'hidden', background: '#fafafa' }}>
              <img src={shown.url} alt="Bảng đón khách gửi" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </Flex>
          ) : shown?.type === 'application/pdf' ? (
            <Flex
              vertical
              align="center"
              justify="center"
              gap={8}
              style={{ border: '1px solid #d9d9d9', borderRadius: 6, aspectRatio: '297 / 210', marginTop: 4, background: '#fafafa', padding: 12, textAlign: 'center' }}
            >
              <FilePdfOutlined style={{ fontSize: 40, color: '#cf1322' }} />
              <Typography.Text>{shown.name}</Typography.Text>
              <Typography.Text type="secondary">Bấm "Xem file" để mở PDF</Typography.Text>
            </Flex>
          ) : (
            <Flex
              vertical
              align="center"
              justify="center"
              style={{ border: '2px solid #1f1f1f', borderRadius: 6, aspectRatio: '297 / 210', padding: 12, marginTop: 4, textAlign: 'center', overflow: 'hidden' }}
            >
              <div style={{ fontSize: 'clamp(14px, 3.2vw, 34px)', fontWeight: 800, lineHeight: 1.15, textTransform: 'uppercase', wordBreak: 'break-word' }}>{title || '—'}</div>
              {subtitle && <div style={{ fontSize: 'clamp(10px, 1.4vw, 16px)', marginTop: 8 }}>{subtitle}</div>}
            </Flex>
          )}
        </Col>
      </Row>
    </Card>
  );
}

interface ShownFile {
  name: string;
  type: string;
  url: string | null;
  /** File mới chọn, chưa tải lên (booking chưa lưu) */
  pending?: boolean;
}

/** Đường dẫn tạm để xem trước một file trên máy (tự thu hồi khi đổi file) */
function useObjectUrl(file?: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

type SignFileInfo = Pick<Booking, 'signFile' | 'signFileName' | 'signFileType'>;

/** Thông tin + đường dẫn xem file bảng đón khách gửi (tải riêng, không ảnh hưởng form booking) */
export function useSignFile(bookingId?: number) {
  const { data: info, refetch } = useQuery({
    queryKey: ['/bookings/sign-file', bookingId],
    queryFn: async () => {
      const b = await api<Booking>(`/bookings/${bookingId}`);
      return { signFile: b.signFile, signFileName: b.signFileName, signFileType: b.signFileType } as SignFileInfo;
    },
    enabled: !!bookingId,
  });
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId || !info?.signFile) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    apiBlob(`/bookings/${bookingId}/sign-file`)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bookingId, info?.signFile]);

  return { info, url, refetch };
}

const SIGN_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const SIGN_MAX_MB = 100;

/** Kiểm tra loại / dung lượng file bảng đón; trả về câu báo lỗi hoặc null */
function checkSignFile(f: File) {
  if (!SIGN_ACCEPT.split(',').includes(f.type)) return 'Chỉ nhận file ảnh (JPG, PNG, WEBP) hoặc PDF';
  if (f.size > SIGN_MAX_MB * 1024 * 1024) return `File quá lớn (tối đa ${SIGN_MAX_MB} MB)`;
  return null;
}

/** Tải file bảng đón lên một booking đã lưu */
export const uploadSignFile = (bookingId: number, f: File) => apiUpload(`/bookings/${bookingId}/sign-file`, f);

function SignFileBox({
  bookingId,
  shown,
  onSaved,
  onPendingFile,
  editable = true,
}: {
  bookingId?: number;
  shown: ShownFile | null;
  onSaved: () => void;
  onPendingFile?: (f: File | null) => void;
  editable?: boolean;
}) {
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'DIEU_HANH', 'KINH_DOANH') && editable;
  const [uploading, setUploading] = useState(false);
  // Booking mới: chỉ giữ file trên trang, tải lên khi lưu booking
  const deferred = !bookingId;

  async function pick(f: File) {
    const err = checkSignFile(f);
    if (err) {
      message.error(err);
      return;
    }
    if (deferred) {
      onPendingFile?.(f);
      return;
    }
    setUploading(true);
    try {
      await uploadSignFile(bookingId!, f);
      message.success('Đã tải lên bảng đón của khách');
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    if (deferred) {
      onPendingFile?.(null);
      return;
    }
    try {
      await api(`/bookings/${bookingId}/sign-file`, { method: 'DELETE' });
      message.success('Đã xóa file bảng đón');
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  if (deferred && !onPendingFile) return null;

  if (shown) {
    const isPdf = shown.type === 'application/pdf';
    return (
      <div style={{ border: '1px solid #d9d9d9', borderRadius: 8, padding: 12 }}>
        <Typography.Text type="secondary">Bảng đón khách gửi</Typography.Text>
        <Flex align="center" gap={8} style={{ marginTop: 4 }} wrap>
          {isPdf ? <FilePdfOutlined style={{ fontSize: 20, color: '#cf1322' }} /> : <FileImageOutlined style={{ fontSize: 20, color: '#1668dc' }} />}
          <Typography.Text strong ellipsis style={{ maxWidth: 260 }}>
            {shown.name}
          </Typography.Text>
        </Flex>
        {shown.pending && (
          <Typography.Text type="warning" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
            Chưa tải lên – file sẽ được tải lên khi bấm Lưu booking
          </Typography.Text>
        )}
        <Space wrap style={{ marginTop: 8 }}>
          <Button size="small" icon={<EyeOutlined />} disabled={!shown.url} onClick={() => shown.url && window.open(shown.url, '_blank')}>
            Xem file
          </Button>
          {canEdit && (
            <>
              <Upload accept={SIGN_ACCEPT} showUploadList={false} beforeUpload={(f) => (pick(f), false)}>
                <Button size="small" icon={<SwapOutlined />} loading={uploading}>
                  Đổi file
                </Button>
              </Upload>
              {shown.pending ? (
                <Button size="small" danger icon={<DeleteOutlined />} onClick={remove}>
                  Bỏ file
                </Button>
              ) : (
                <Popconfirm title="Xóa file bảng đón của khách?" okText="Xóa" cancelText="Không" onConfirm={remove}>
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    Xóa
                  </Button>
                </Popconfirm>
              )}
            </>
          )}
        </Space>
      </div>
    );
  }

  if (!canEdit) return null;
  return (
    <Upload.Dragger className="sign-dragger" accept={SIGN_ACCEPT} showUploadList={false} beforeUpload={(f) => (pick(f), false)} disabled={uploading}>
      <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}>
        <InboxOutlined />
      </p>
      <p style={{ margin: 0 }}>{uploading ? 'Đang tải lên…' : 'Khách gửi sẵn bảng đón? Kéo thả hoặc bấm để tải lên'}</p>
      <p style={{ margin: 0, fontSize: 12, color: '#8c8c8c' }}>Ảnh JPG, PNG, WEBP hoặc PDF, tối đa {SIGN_MAX_MB} MB</p>
    </Upload.Dragger>
  );
}

export const LEADER_ROLE: Record<'HDV' | 'TRUONG_DOAN', string> = { HDV: 'Hướng dẫn viên', TRUONG_DOAN: 'Trưởng đoàn' };

/** Người liên hệ trong chuyến (HDV hoặc trưởng đoàn) – tài xế gọi người này khi đón khách */
export function LeaderCard({ form, readOnly, onChanged }: { form: FormInstance; readOnly: boolean; onChanged: () => void }) {
  const passengers: Passenger[] = (Form.useWatch('passengers', form) ?? []).filter((p: Passenger) => p?.fullName?.trim());
  const leaderName: string | undefined = Form.useWatch('leaderName', form);
  const leaderPhone: string | undefined = Form.useWatch('leaderPhone', form);
  const leaderApp: ContactApp | undefined = Form.useWatch('leaderApp', form);
  const effectiveApp = leaderApp ?? (leaderPhone ? guessContactApp(leaderPhone) : undefined);
  const picked = passengers.findIndex((p) => p.fullName.trim() === leaderName?.trim());

  /** Chọn 1 khách trong danh sách làm trưởng đoàn: điền tên + SĐT của khách đó */
  const pickPassenger = (i: number | undefined) => {
    if (i === undefined) return;
    const p = passengers[i];
    form.setFieldsValue({ leaderRole: 'TRUONG_DOAN', leaderName: p.fullName.trim(), leaderPhone: p.phone?.trim() || form.getFieldValue('leaderPhone') });
    onChanged();
  };

  return (
    <Card
      title="Liên hệ trong chuyến (hướng dẫn viên / trưởng đoàn)"
      style={{ marginTop: 16 }}
      extra={<Typography.Text type="secondary">In trên lệnh điều xe và danh sách hành khách – tài xế gọi người này khi đón khách</Typography.Text>}
    >
      <Row gutter={16}>
        <Col xs={24} md={5}>
          <Form.Item name="leaderRole" label="Vai trò">
            <Select
              allowClear
              placeholder="Chọn vai trò"
              options={Object.entries(LEADER_ROLE).map(([value, label]) => ({ value, label }))}
              onChange={onChanged}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={7}>
          <Form.Item label="Chọn từ danh sách hành khách" tooltip="Lấy 1 khách trong đoàn làm trưởng đoàn: tự điền tên và SĐT">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              disabled={readOnly || !passengers.length}
              placeholder={passengers.length ? 'Chọn khách làm trưởng đoàn' : 'Chưa có danh sách hành khách'}
              value={picked >= 0 ? picked : undefined}
              options={passengers.map((p, i) => ({ value: i, label: `${i + 1}. ${p.fullName}${p.phone ? ` – ${p.phone}` : ''}` }))}
              onChange={pickPassenger}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="leaderName" label="Họ tên">
            <Input placeholder="Tên HDV / trưởng đoàn" allowClear onChange={onChanged} />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="leaderPhone" label="Số điện thoại">
            <Input placeholder="+84… / +82…" allowClear onChange={onChanged} />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item
            name="leaderApp"
            label="Ứng dụng liên lạc"
            tooltip="Lái xe bấm vào số sẽ mở ứng dụng này (không gọi điện thường). Để trống: tự chọn theo đầu số (+84 Zalo, +82 KakaoTalk, +86 WeChat, +81 LINE, còn lại WhatsApp)."
          >
            <Select
              allowClear
              placeholder={leaderPhone ? `Tự chọn: ${CONTACT_APP[guessContactApp(leaderPhone)].label}` : 'Tự chọn theo đầu số'}
              options={Object.entries(CONTACT_APP).map(([value, a]) => ({ value, label: a.label }))}
              onChange={onChanged}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item
            name="leaderAppId"
            label={`ID ${effectiveApp ? CONTACT_APP[effectiveApp].label : 'ứng dụng'}`}
            tooltip="Chỉ cần khi khách kết bạn bằng ID thay vì số điện thoại (thường gặp ở KakaoTalk, WeChat, LINE)."
            extra={effectiveApp && CONTACT_APP[effectiveApp].usesId ? 'Nên nhập ID: ứng dụng này kết bạn bằng ID' : undefined}
          >
            <Input placeholder="Để trống nếu dùng số điện thoại" allowClear onChange={onChanged} />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  );
}
