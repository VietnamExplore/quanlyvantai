import { CheckCircleFilled, CloseCircleFilled, SendOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, Flex, Form, Input, InputNumber, Row, Switch, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { api } from '../api';

interface MailStatus {
  enabled: boolean;
  useOta: boolean;
  otaUser: string | null;
  host: string;
  port: number;
  user: string;
  hasPass: boolean;
  fromName: string;
  /** Địa chỉ đang dùng để gửi */
  sender: string | null;
  ready: boolean;
  state: { lastSentAt?: string | null; lastError?: string | null; sent?: number };
}

/**
 * Email gửi đi: khi điều xe / thay đổi / hủy chuyến, phần mềm tự gửi email tới nhà xe đối tác (email khai ở mục Nhà xe đối tác).
 * Mặc định dùng chung Gmail của hộp thư booking OTA; Admin có thể dùng tài khoản riêng (mật khẩu ứng dụng do Admin nhập).
 */
export function SmtpMailCard() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ fromName: string; host: string; port: number; user: string; pass: string; testTo: string }>();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['/mail/status'], queryFn: () => api<MailStatus>('/mail/status') });
  const useOta = data?.useOta ?? true;

  useEffect(() => {
    if (data) form.setFieldsValue({ fromName: data.fromName, host: data.host, port: data.port, user: data.user, pass: '' });
  }, [data, form]);

  async function save(body: Record<string, unknown>, ok: string) {
    setBusy('save');
    try {
      const st = await api<MailStatus>('/mail/config', { method: 'PUT', body });
      queryClient.setQueryData(['/mail/status'], st);
      form.setFieldValue('pass', '');
      message.success(ok);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    const to = (form.getFieldValue('testTo') ?? '').trim();
    if (!to) return message.warning('Nhập email nhận thử');
    setBusy('test');
    try {
      await api('/mail/test', { method: 'POST', body: { to } });
      message.success(`Đã gửi email thử tới ${to} – kiểm tra hộp thư (cả mục Spam)`);
    } catch (e) {
      message.error((e as Error).message, 8);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="📧 Email gửi nhà xe đối tác"
      loading={isLoading}
      extra={
        <Flex align="center" gap={8}>
          <Typography.Text type="secondary">Tự gửi khi điều xe</Typography.Text>
          <Switch checked={!!data?.enabled} disabled={!data?.ready && !data?.enabled} loading={busy === 'save'} onChange={(enabled) => save({ enabled }, enabled ? 'Đã bật gửi email cho nhà xe' : 'Đã tắt gửi email')} />
        </Flex>
      }
      style={{ marginTop: 16 }}
    >
      <Typography.Paragraph type="secondary">
        Khi giao chuyến / xe ghép cho nhà xe, đổi giờ, đổi điểm đón, hủy chuyến…, phần mềm tự gửi email tới nhà xe (khai email ở mục <b>Nhà xe đối tác</b>), kèm lệnh điều xe đầy đủ và link cổng nhà xe.
        Email không có tên kênh bán / đại lý đặt. Lịch sử chuyến ghi lại đã gửi hay gửi lỗi.
      </Typography.Paragraph>
      {data && (
        <Flex gap={8} wrap style={{ marginBottom: 12 }}>
          {data.ready ? (
            <Typography.Text>
              <CheckCircleFilled style={{ color: '#52c41a' }} /> Gửi từ <b>{data.sender}</b>
            </Typography.Text>
          ) : (
            <Typography.Text type="warning">
              <CloseCircleFilled /> {useOta ? 'Chưa kết nối hộp thư booking OTA (mục Email booking OTA ở trên)' : 'Chưa nhập email và mật khẩu gửi đi'}
            </Typography.Text>
          )}
          {data.state.lastSentAt && <Typography.Text type="secondary">· Gửi gần nhất {dayjs(data.state.lastSentAt).format('HH:mm DD/MM')} · tổng {data.state.sent ?? 0} email</Typography.Text>}
        </Flex>
      )}
      {data?.state.lastError && <Alert type="error" showIcon title={`Lần gửi gần nhất bị lỗi: ${data.state.lastError}`} style={{ marginBottom: 12 }} />}
      <Form form={form} layout="vertical">
        <Form.Item label="Tài khoản gửi">
          <Switch checked={useOta} onChange={(v) => save({ useOta: v }, v ? 'Dùng chung tài khoản hộp thư booking OTA' : 'Dùng tài khoản riêng')} />{' '}
          <Typography.Text>{useOta ? `Dùng chung hộp thư booking OTA${data?.otaUser ? ` (${data.otaUser})` : ''}` : 'Tài khoản riêng'}</Typography.Text>
        </Form.Item>
        <Row gutter={12}>
          <Col xs={24} md={8}>
            <Form.Item name="fromName" label="Tên người gửi">
              <Input placeholder="Vietnam Explore – Điều hành" />
            </Form.Item>
          </Col>
          {!useOta && (
            <>
              <Col xs={24} md={8}>
                <Form.Item name="user" label="Email gửi đi">
                  <Input placeholder="dieuxe@gmail.com" autoComplete="off" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="pass" label="Mật khẩu ứng dụng" extra={data?.hasPass ? 'Đã lưu – bỏ trống để giữ nguyên' : 'Gmail: Tài khoản Google → Bảo mật → Mật khẩu ứng dụng'}>
                  <Input.Password placeholder={data?.hasPass ? '••••••••' : 'abcd efgh ijkl mnop'} autoComplete="new-password" />
                </Form.Item>
              </Col>
              <Col xs={16} md={8}>
                <Form.Item name="host" label="Máy chủ SMTP">
                  <Input placeholder="smtp.gmail.com" />
                </Form.Item>
              </Col>
              <Col xs={8} md={4}>
                <Form.Item name="port" label="Cổng">
                  <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </>
          )}
        </Row>
        <Button
          type="primary"
          loading={busy === 'save'}
          onClick={() => {
            const v = form.getFieldsValue();
            save(useOta ? { fromName: v.fromName } : { fromName: v.fromName, user: v.user, host: v.host, port: v.port, ...(v.pass && { pass: v.pass }) }, 'Đã lưu cài đặt email');
          }}
        >
          Lưu
        </Button>
        <Flex gap={8} style={{ marginTop: 16 }} wrap>
          <Form.Item name="testTo" noStyle>
            <Input placeholder="Email nhận thử" style={{ width: 260 }} />
          </Form.Item>
          <Button icon={<SendOutlined />} loading={busy === 'test'} disabled={!data?.ready} onClick={test}>
            Gửi thử
          </Button>
        </Flex>
      </Form>
    </Card>
  );
}
