import { ApiOutlined, CheckCircleFilled, CloseCircleFilled, GlobalOutlined, SyncOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, Collapse, DatePicker, Flex, Form, Input, Row, Switch, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatVnd } from './common';

interface WebsiteStatus {
  url: string;
  enabled: boolean;
  since: string | null;
  keyHint: string | null;
  hasSecret: boolean;
  state: { restRoot?: string; lastRunAt?: string; lastOkAt?: string; lastError?: string | null; imported?: number };
  orders: {
    orderId: number;
    number: string;
    status: string;
    statusLabel: string;
    total: number;
    currency: string;
    customer: string;
    createdAt: string;
    booking: { id: number; code: string } | null;
    /** Đơn có dịch vụ vận chuyển (bus / xe ghép, xe riêng, đưa đón) */
    transport: boolean;
  }[];
}

const STATUS_COLOR: Record<string, string> = { processing: 'blue', completed: 'green', 'on-hold': 'gold', pending: 'default', cancelled: 'red', refunded: 'red', failed: 'red' };

/**
 * Kết nối website công ty (WordPress + WooCommerce): Admin tạo khóa API chỉ đọc trên website, dán vào đây.
 * Phần mềm tự lấy đơn mỗi 2 phút, đơn đã thanh toán / chờ chuyển khoản tạo booking nguồn "Website".
 */
export function WebsiteCard() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ url: string; key: string; secret: string; since: Dayjs | null }>();
  const [busy, setBusy] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['/website/status'], queryFn: () => api<WebsiteStatus>('/website/status'), refetchInterval: 60_000 });

  useEffect(() => {
    if (data) form.setFieldsValue({ url: data.url || 'https://vietnamexplore.vn', key: '', secret: '', since: data.since ? dayjs(data.since) : null });
  }, [data, form]);

  const set = (s: WebsiteStatus) => queryClient.setQueryData(['/website/status'], s);

  async function save(extra: { enabled?: boolean } = {}) {
    const v = await form.validateFields();
    setBusy('save');
    try {
      set(await api<WebsiteStatus>('/website/config', { method: 'PUT', body: { url: v.url, key: v.key || undefined, secret: v.secret || undefined, since: v.since ? v.since.format('YYYY-MM-DD') : undefined, ...extra } }));
      form.setFieldsValue({ key: '', secret: '' });
      message.success('Đã lưu kết nối website');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function run(kind: 'test' | 'sync') {
    setBusy(kind);
    try {
      if (kind === 'test') {
        setTest(await api<{ ok: boolean; message: string }>('/website/test', { method: 'POST' }));
      } else {
        const r = await api<{ ok?: boolean; skipped?: boolean; fetched?: number; created?: number; message?: string }>('/website/sync', { method: 'POST' });
        if (r.skipped) message.warning('Chưa nhập đủ địa chỉ website và khóa API');
        else if (r.ok) message.success(`Đã lấy ${r.fetched} đơn, tạo ${r.created} booking mới`);
        else message.error(r.message ?? 'Không lấy được đơn');
        queryClient.invalidateQueries({ queryKey: ['/website/status'] });
        queryClient.invalidateQueries({ queryKey: ['/bookings'] });
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const st = data?.state;
  const ready = !!data?.keyHint && !!data?.hasSecret && !!data?.url;

  return (
    <Card
      loading={isLoading}
      title={
        <Flex align="center" gap={8}>
          <GlobalOutlined /> Nhận booking từ website công ty
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
        Mỗi 2 phút phần mềm lấy đơn đặt hàng mới trên website (WooCommerce). Chỉ nhận đơn có <b>dịch vụ vận chuyển</b> (bus / xe ghép, xe riêng, đưa đón); đơn chỉ có tour, vé, khách sạn… bỏ qua. Đơn <b>đã thanh toán</b>, <b>chờ chuyển khoản</b> hoặc <b>hoàn tất</b> tự tạo booking
        nguồn &quot;Website&quot;, trạng thái Nháp, kèm đủ thông tin đơn trong ghi chú nội bộ; Admin và Điều hành nhận thông báo để thêm chuyến và xác nhận. Đơn bị hủy /
        hoàn tiền sau đó cũng được báo. Website không cần cài thêm gì.
      </Typography.Paragraph>

      {ready && (
        <Alert
          style={{ marginBottom: 16 }}
          type={st?.lastError ? 'error' : data?.enabled ? 'success' : 'info'}
          showIcon
          icon={st?.lastError ? <CloseCircleFilled /> : <CheckCircleFilled />}
          message={
            st?.lastError
              ? `Lần lấy gần nhất bị lỗi: ${st.lastError}`
              : data?.enabled
                ? `Đang tự động nhận booking${st?.lastOkAt ? ` · lấy lần cuối ${dayjs(st.lastOkAt).format('HH:mm DD/MM')}` : ''} · đã tạo ${st?.imported ?? 0} booking`
                : 'Đã nhập khóa. Bấm "Kiểm tra kết nối", rồi bật Tự động.'
          }
          description={data?.since ? `Chỉ nhận đơn đặt từ ngày ${dayjs(data.since).format('DD/MM/YYYY')}.` : undefined}
        />
      )}

      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="url" label="Địa chỉ website" rules={[{ required: true, pattern: /^https?:\/\/\S+$/, message: 'Nhập địa chỉ bắt đầu bằng https://' }]}>
              <Input placeholder="https://vietnamexplore.vn" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="since" label="Nhận đơn đặt từ ngày" tooltip="Đơn cũ hơn ngày này không tạo booking (tránh trùng với booking đã nhập tay). Bỏ trống = từ ngày bật Tự động.">
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="key" label="Consumer key" tooltip="Bắt đầu bằng ck_. Bỏ trống = giữ khóa đã lưu.">
              <Input placeholder={data?.keyHint ? `Đã lưu (${data.keyHint})` : 'ck_…'} autoComplete="off" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="secret" label="Consumer secret" tooltip="Bắt đầu bằng cs_. Bỏ trống = giữ khóa đã lưu.">
              <Input.Password placeholder={data?.hasSecret ? 'Đã lưu' : 'cs_…'} autoComplete="new-password" />
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
          <Button icon={<SyncOutlined />} onClick={() => run('sync')} loading={busy === 'sync'} disabled={!ready}>
            Lấy đơn ngay
          </Button>
        </Flex>
        {test && <Alert style={{ marginTop: 12 }} type={test.ok ? 'success' : 'error'} showIcon message={test.message} closable onClose={() => setTest(null)} />}
      </Form>

      <Collapse
        ghost
        style={{ marginTop: 12 }}
        items={[
          {
            key: 'guide',
            label: 'Cách tạo khóa API trên website (làm 1 lần)',
            children: (
              <ol style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
                <li>Đăng nhập trang quản trị website (wp-admin) bằng tài khoản quản trị.</li>
                <li>
                  Vào <b>WooCommerce → Cài đặt → Nâng cao → REST API</b> → <b>Thêm khóa</b>.
                </li>
                <li>
                  Mô tả: &quot;Phần mềm quản lý vận tải&quot; · Người dùng: tài khoản quản trị · Quyền: <b>Đọc</b> (chỉ đọc là đủ) → <b>Tạo khóa API</b>.
                </li>
                <li>Sao chép Consumer key (ck_…) và Consumer secret (cs_…) dán vào 2 ô trên → Lưu → Kiểm tra kết nối → bật Tự động.</li>
              </ol>
            ),
          },
        ]}
      />

      {!!data?.orders.length && (
        <>
          <Typography.Title level={5} style={{ marginTop: 8 }}>
            Đơn website gần đây
          </Typography.Title>
          <Table
            rowKey="orderId"
            size="small"
            pagination={false}
            dataSource={data.orders}
            scroll={{ x: 560 }}
            columns={[
              { title: 'Đơn', dataIndex: 'number', render: (v) => <b>#{v}</b> },
              { title: 'Khách', dataIndex: 'customer' },
              { title: 'Tổng tiền', dataIndex: 'total', align: 'right', render: (v, r) => `${formatVnd(v)} ${r.currency === 'VND' ? 'đ' : r.currency}` },
              { title: 'Trạng thái', dataIndex: 'statusLabel', render: (v, r) => <Tag color={STATUS_COLOR[r.status]}>{v}</Tag> },
              {
                title: 'Booking',
                dataIndex: 'booking',
                render: (b, r) =>
                  b ? (
                    <Link to={`/bookings/${b.id}`}>{b.code}</Link>
                  ) : !r.transport ? (
                    <Typography.Text type="secondary">Không phải vận chuyển</Typography.Text>
                  ) : (
                    <Typography.Text type="secondary">—</Typography.Text>
                  ),
              },
              { title: 'Nhận lúc', dataIndex: 'createdAt', render: (v) => dayjs(v).format('HH:mm DD/MM') },
            ]}
          />
        </>
      )}
    </Card>
  );
}
