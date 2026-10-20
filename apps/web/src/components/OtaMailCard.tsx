import { ApiOutlined, CheckCircleFilled, CloseCircleFilled, MailOutlined, SyncOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, Collapse, DatePicker, Flex, Form, Input, Row, Switch, Table, Tag, Tooltip, Typography, Upload } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, tokenStore } from '../api';

interface OtaMailStatus {
  host: string;
  user: string;
  folder: string;
  enabled: boolean;
  since: string | null;
  hasPass: boolean;
  state: { lastRunAt?: string; lastOkAt?: string; lastError?: string | null; created?: number };
  emails: {
    id: number;
    channel: string;
    kind: string;
    kindLabel: string;
    ref: string | null;
    subject: string;
    receivedAt: string;
    status: string;
    statusLabel: string;
    note: string | null;
    booking: { id: number; code: string } | null;
  }[];
}

const STATUS_COLOR: Record<string, string> = { CREATED: 'green', CANCELLED: 'volcano', DUPLICATE: 'default', SKIPPED: 'default', NOTIFIED: 'gold', UNPARSED: 'orange', ERROR: 'red' };
const KIND_COLOR: Record<string, string> = { BOOKING: 'blue', CHANGE: 'gold', CANCEL: 'red' };
const EML_STATUS: Record<string, string> = {
  CREATED: 'đã tạo booking',
  DUPLICATE: 'đã có booking',
  SKIPPED: 'không phải vận chuyển',
  NOTIFIED: 'đã báo điều hành',
  CANCELLED: 'đã tự hủy booking',
  UNPARSED: 'kênh chưa có mẫu – đã báo điều hành',
  ERROR: 'lỗi',
  SEEN: 'đã xử lý trước đó',
};

/**
 * Hộp thư nhận booking OTA (GetYourGuide, Klook, KKday…): Admin nhập địa chỉ Gmail + mật khẩu ứng dụng (không phải mật khẩu đăng nhập).
 * Mỗi 5 phút phần mềm đọc email mới, chỉ lấy booking vận chuyển; kênh đã có mẫu tự tạo booking, đổi / hủy thì báo điều hành.
 */
export function OtaMailCard() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ user: string; pass: string; host: string; folder: string; since: Dayjs | null }>();
  const [busy, setBusy] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['/ota/mail/status'], queryFn: () => api<OtaMailStatus>('/ota/mail/status'), refetchInterval: 60_000 });

  useEffect(() => {
    if (data) form.setFieldsValue({ user: data.user || 'bookingvne@gmail.com', pass: '', host: data.host, folder: data.folder, since: data.since ? dayjs(data.since) : null });
  }, [data, form]);

  const set = (s: OtaMailStatus) => queryClient.setQueryData(['/ota/mail/status'], s);

  async function save(extra: { enabled?: boolean } = {}) {
    const v = await form.validateFields();
    setBusy('save');
    try {
      set(await api<OtaMailStatus>('/ota/mail/config', { method: 'PUT', body: { user: v.user, pass: v.pass || undefined, host: v.host, folder: v.folder, since: v.since ? v.since.format('YYYY-MM-DD') : undefined, ...extra } }));
      form.setFieldsValue({ pass: '' });
      message.success('Đã lưu hộp thư nhận booking OTA');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function run(kind: 'test' | 'scan') {
    setBusy(kind);
    try {
      if (kind === 'test') {
        setTest(await api<{ ok: boolean; message: string }>('/ota/mail/test', { method: 'POST' }));
      } else {
        const r = await api<{ ok?: boolean; skipped?: boolean; read?: number; created?: number; notified?: number; message?: string }>('/ota/mail/scan', { method: 'POST' });
        if (r.skipped) message.warning('Chưa nhập đủ email và mật khẩu ứng dụng (hoặc đang quét)');
        else if (r.ok) message.success(`Đã đọc ${r.read} email booking OTA mới: tạo ${r.created} booking, báo điều hành ${r.notified}`);
        else message.error(r.message ?? 'Không đọc được hộp thư');
        refresh();
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['/ota/mail/status'] });
    queryClient.invalidateQueries({ queryKey: ['/bookings'] });
  }

  /** Tải lên file .eml (Gmail: ⋮ → Tải thư xuống) */
  async function uploadEml(files: File[]) {
    setBusy('eml');
    try {
      const body = new FormData();
      for (const f of files) body.append('files', f);
      const token = tokenStore.get();
      const res = await fetch('/api/ota/mail/eml', { method: 'POST', body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const out = await res.json().catch(() => null);
      if (!res.ok) throw new Error(Array.isArray(out?.message) ? out.message.join('\n') : (out?.message ?? 'Không đọc được file email'));
      const list = out as { file: string; status: string | null }[];
      message.info(
        <div style={{ textAlign: 'left' }}>
          {list.map((x) => (
            <div key={x.file}>
              {x.file}: <b>{x.status ? (EML_STATUS[x.status] ?? x.status) : 'không phải email booking OTA'}</b>
            </div>
          ))}
        </div>,
        8,
      );
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const st = data?.state;
  const ready = !!data?.user && !!data?.hasPass;

  return (
    <Card
      loading={isLoading}
      title={
        <Flex align="center" gap={8}>
          <MailOutlined /> Nhận booking OTA qua email
        </Flex>
      }
      extra={
        <Flex align="center" gap={8}>
          <Typography.Text type="secondary">Tự động</Typography.Text>
          <Switch checked={!!data?.enabled} disabled={!ready} loading={busy === 'save'} onChange={(on) => save({ enabled: on })} />
        </Flex>
      }
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Mỗi 5 phút phần mềm đọc email mới trong hộp thư nhận booking, chỉ lấy email <b>đặt / đổi / hủy</b> của các kênh OTA (GetYourGuide, Klook, KKday, Viator, Trip.com, Traveloka, Agoda, Booking.com, Expedia, Vé xe rẻ, redBus,
        Easybook, 12Go) và chỉ booking <b>vận chuyển / xe ghép</b> (bus, shuttle, xe riêng, đưa đón, thuê xe) – tour, vé tham quan, show, khách sạn… không nhập; tin nhắn khách, email quảng cáo bỏ qua. Kênh đã có mẫu đọc (
        <b>GetYourGuide, Viator, Vé xe rẻ, Agoda (GlobalTix), 12Go</b>) tự tạo booking: nguồn &quot;OTA&quot;, khách hàng là đại lý của kênh (ghi công nợ, vd &quot;Getyourguide VNE&quot;), nhân viên kinh doanh <b>Sale team</b>, giá giữ nguyên
        số trên email, không xuất hóa đơn; bus / xe ghép tự xếp vào chuyến xe ghép. Booking trùng mã hoặc trùng booking nhập tay (cùng ngày, cùng khách) không tạo lại. 12Go: chỉ tạo booking từ email &quot;Confirmed booking&quot; có vé PDF đính kèm (tuyến, giờ, số khách, tên khách trong PDF; giá, liên hệ trong email).
        Email <b>hủy</b>: tự chuyển booking sang Hủy (trừ booking đã hoàn thành / đang chạy chuyến, hoặc chỉ hủy một phần số vé – báo Điều hành). Email đổi: ghi vào booking và báo Điều hành sửa tay. Kênh chưa có mẫu: báo Điều hành
        nhập tay.
      </Typography.Paragraph>

      {ready && (
        <Alert
          style={{ marginBottom: 16 }}
          type={st?.lastError ? 'error' : data?.enabled ? 'success' : 'info'}
          showIcon
          icon={st?.lastError ? <CloseCircleFilled /> : <CheckCircleFilled />}
          message={
            st?.lastError
              ? `Lần quét gần nhất bị lỗi: ${st.lastError}`
              : data?.enabled
                ? `Đang tự động quét hộp thư${st?.lastOkAt ? ` · lần cuối ${dayjs(st.lastOkAt).format('HH:mm DD/MM')}` : ''} · đã tạo ${st?.created ?? 0} booking`
                : 'Đã lưu hộp thư. Bấm "Kiểm tra kết nối", rồi bật Tự động.'
          }
          description={data?.since ? `Chỉ đọc email nhận từ ngày ${dayjs(data.since).format('DD/MM/YYYY')}.` : undefined}
        />
      )}

      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="user" label="Địa chỉ hộp thư nhận booking" rules={[{ required: true, type: 'email', message: 'Nhập địa chỉ email' }]}>
              <Input placeholder="bookingvne@gmail.com" autoComplete="off" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="pass" label="Mật khẩu ứng dụng" tooltip="Mật khẩu ứng dụng 16 ký tự tạo trong tài khoản Google (không phải mật khẩu đăng nhập Gmail). Bỏ trống = giữ mật khẩu đã lưu.">
              <Input.Password placeholder={data?.hasPass ? 'Đã lưu' : 'abcd efgh ijkl mnop'} autoComplete="new-password" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="since" label="Đọc email nhận từ ngày" tooltip="Email cũ hơn ngày này bỏ qua (tránh trùng booking đã nhập tay). Bỏ trống = từ ngày bật Tự động.">
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="host" label="Máy chủ IMAP">
              <Input placeholder="imap.gmail.com" />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="folder" label="Thư mục" tooltip="Gmail: INBOX = Hộp thư đến">
              <Input placeholder="INBOX" />
            </Form.Item>
          </Col>
        </Row>
        <Flex gap={8} wrap>
          <Button type="primary" onClick={() => save()} loading={busy === 'save'}>
            Lưu
          </Button>
          <Button icon={<ApiOutlined />} onClick={() => run('test')} loading={busy === 'test'} disabled={!ready}>
            Kiểm tra kết nối
          </Button>
          <Button icon={<SyncOutlined />} onClick={() => run('scan')} loading={busy === 'scan'} disabled={!ready}>
            Quét ngay
          </Button>
          <Upload
            accept=".eml"
            multiple
            showUploadList={false}
            beforeUpload={(f, list) => {
              if (f === list[0]) uploadEml(list as unknown as File[]);
              return false;
            }}
          >
            <Tooltip title="Gmail: mở email → ⋮ → Tải thư xuống (.eml). Dùng khi email booking gửi tới hộp thư khác.">
              <Button icon={<UploadOutlined />} loading={busy === 'eml'}>
                Nhập file email (.eml)
              </Button>
            </Tooltip>
          </Upload>
        </Flex>
        {test && <Alert style={{ marginTop: 12 }} type={test.ok ? 'success' : 'error'} showIcon message={test.message} closable onClose={() => setTest(null)} />}
      </Form>

      <Collapse
        ghost
        style={{ marginTop: 12 }}
        items={[
          {
            key: 'guide',
            label: 'Cách tạo mật khẩu ứng dụng Gmail (làm 1 lần)',
            children: (
              <ol style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
                <li>Đăng nhập Gmail hộp thư nhận booking (vd bookingvne@gmail.com).</li>
                <li>
                  Vào <b>Tài khoản Google → Bảo mật</b> → bật <b>Xác minh 2 bước</b> (nếu chưa bật).
                </li>
                <li>
                  Tìm <b>Mật khẩu ứng dụng</b> (App passwords) → đặt tên &quot;Phần mềm vận tải&quot; → <b>Tạo</b> → sao chép mã 16 ký tự.
                </li>
                <li>
                  Trong Gmail: <b>Cài đặt → Xem tất cả chế độ cài đặt → Chuyển tiếp và POP/IMAP</b> → <b>Bật IMAP</b> → Lưu.
                </li>
                <li>Dán mã vào ô &quot;Mật khẩu ứng dụng&quot; ở trên → Lưu → Kiểm tra kết nối → bật Tự động. Phần mềm chỉ đọc email, không gửi, không xóa.</li>
              </ol>
            ),
          },
        ]}
      />

      {!!data?.emails.length && (
        <>
          <Typography.Title level={5} style={{ marginTop: 8 }}>
            Email booking OTA gần đây
          </Typography.Title>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.emails}
            scroll={{ x: 720 }}
            columns={[
              { title: 'Nhận lúc', dataIndex: 'receivedAt', width: 96, render: (v) => dayjs(v).format('HH:mm DD/MM') },
              { title: 'Kênh', dataIndex: 'channel', width: 90 },
              { title: 'Loại', dataIndex: 'kindLabel', width: 90, render: (v, r) => <Tag color={KIND_COLOR[r.kind]}>{v}</Tag> },
              { title: 'Mã đặt chỗ', dataIndex: 'ref', render: (v, r) => v ?? <Typography.Text type="secondary">{r.subject}</Typography.Text> },
              {
                title: 'Kết quả',
                dataIndex: 'statusLabel',
                render: (v, r) => (
                  <Tooltip title={r.note}>
                    <Tag color={STATUS_COLOR[r.status]}>{v}</Tag>
                  </Tooltip>
                ),
              },
              { title: 'Booking', dataIndex: 'booking', render: (b) => (b ? <Link to={`/bookings/${b.id}`}>{b.code}</Link> : <Typography.Text type="secondary">—</Typography.Text>) },
            ]}
          />
        </>
      )}
    </Card>
  );
}
