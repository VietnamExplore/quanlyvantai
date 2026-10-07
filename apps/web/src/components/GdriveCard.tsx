import { CheckCircleFilled, CloseCircleFilled, CloudUploadOutlined, DisconnectOutlined, GoogleOutlined, LinkOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Collapse, Flex, Form, Input, InputNumber, Popconfirm, Row, Switch, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { api } from '../api';

export interface GdriveStatus {
  clientId: string | null;
  clientSecretSet: boolean;
  connected: boolean;
  account: string | null;
  enabled: boolean;
  keep: number;
  busy: boolean;
  lastUpload: { at: string; ok: boolean; name?: string; files?: { name: string; size: number }[]; removed?: number; error?: string; durationMs: number } | null;
  pending: { userCode: string; verificationUrl: string; expiresAt: string; error: string | null } | null;
}

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`);

/**
 * Đẩy bản sao lưu lên Google Drive: Admin nhập Client ID / secret (ứng dụng Google loại "TVs and Limited Input devices"),
 * bấm Kết nối, nhập mã ở google.com/device. Sau đó mỗi lần sao lưu xong phần mềm tự tải lên Drive.
 */
export function GdriveCard<S extends { gdrive: GdriveStatus }>({ status, onStatus }: { status?: GdriveStatus; onStatus: (s: S) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ clientId: string; clientSecret: string }>();
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (status) form.setFieldsValue({ clientId: status.clientId ?? '', clientSecret: '' });
  }, [status?.clientId, form]); // eslint-disable-line react-hooks/exhaustive-deps

  async function call(kind: string, path: string, body: unknown, ok?: string) {
    setBusy(kind);
    try {
      const s = await api<S>(path, { method: path === '/system/gdrive' ? 'PUT' : 'POST', body });
      onStatus(s);
      if (ok) message.success(ok);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const g = status;
  const last = g?.lastUpload;
  return (
    <Card
      title={
        <Flex align="center" gap={8}>
          <GoogleOutlined style={{ color: '#4285f4' }} /> Đẩy sao lưu lên Google Drive
          {g?.connected ? <Tag color="green">Đã kết nối</Tag> : <Tag>Chưa kết nối</Tag>}
        </Flex>
      }
    >
      {!g?.connected && (
        <>
          <Collapse
            size="small"
            style={{ marginBottom: 16 }}
            items={[
              {
                key: 'guide',
                label: 'Hướng dẫn tạo Client ID (làm một lần, khoảng 10 phút)',
                children: (
                  <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                    <li>
                      Đăng nhập tài khoản Google của công ty, mở{' '}
                      <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">
                        Google Cloud Console
                      </a>{' '}
                      → tạo dự án (ví dụ: <i>Sao luu phan mem</i>).
                    </li>
                    <li>
                      Vào <b>APIs &amp; Services → Library</b>, tìm <b>Google Drive API</b> → bấm <b>Enable</b>.
                    </li>
                    <li>
                      Vào <b>OAuth consent screen</b> (Google Auth Platform): chọn <b>External</b>, nhập tên ứng dụng và email. Ở mục <b>Audience</b> bấm{' '}
                      <b>Publish app</b> (chuyển sang <b>In production</b>) – nếu để <i>Testing</i>, quyền chỉ dùng được 7 ngày rồi phải kết nối lại.
                    </li>
                    <li>
                      Vào <b>Credentials → Create credentials → OAuth client ID</b>, loại ứng dụng chọn <b>TVs and Limited Input devices</b> → Create.
                    </li>
                    <li>
                      Chép <b>Client ID</b> và <b>Client secret</b> dán vào 2 ô dưới → Lưu → bấm <b>Kết nối Google Drive</b>.
                    </li>
                  </ol>
                ),
              },
            ]}
          />
          <Form form={form} layout="vertical">
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item name="clientId" label="Client ID">
                  <Input placeholder="…apps.googleusercontent.com" autoComplete="off" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="clientSecret" label="Client secret" extra={g?.clientSecretSet ? 'Đã lưu – bỏ trống để giữ nguyên' : undefined}>
                  <Input.Password placeholder={g?.clientSecretSet ? '••••••••' : 'GOCSPX-…'} autoComplete="new-password" />
                </Form.Item>
              </Col>
            </Row>
          </Form>
          <Flex gap={8} wrap>
            <Button loading={busy === 'save'} onClick={() => call('save', '/system/gdrive', form.getFieldsValue(), 'Đã lưu')}>
              Lưu
            </Button>
            <Button type="primary" icon={<LinkOutlined />} loading={busy === 'connect'} disabled={!g?.clientId || !g.clientSecretSet} onClick={() => call('connect', '/system/gdrive/connect', {})}>
              Kết nối Google Drive
            </Button>
          </Flex>
          {g?.pending && (
            <Alert
              style={{ marginTop: 16 }}
              type={g.pending.error ? 'error' : 'info'}
              showIcon
              title={
                g.pending.error ?? (
                  <>
                    Mở{' '}
                    <a href={g.pending.verificationUrl} target="_blank" rel="noreferrer">
                      <b>{g.pending.verificationUrl}</b>
                    </a>{' '}
                    trên máy tính hoặc điện thoại, đăng nhập tài khoản Google của công ty và nhập mã:
                    <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 4, margin: '8px 0' }}>{g.pending.userCode}</div>
                    Mã hết hạn lúc {dayjs(g.pending.expiresAt).format('HH:mm')}. Trang này tự cập nhật khi Google xác nhận.
                  </>
                )
              }
            />
          )}
        </>
      )}

      {g?.connected && (
        <Flex vertical gap={12}>
          <Typography.Text>
            Tài khoản: <b>{g.account}</b> · thư mục <i>Sao lưu phần mềm vận tải</i>. Phần mềm chỉ thấy và quản lý các file do chính nó tải lên.
          </Typography.Text>
          <Flex gap={24} wrap align="center">
            <Flex gap={8} align="center">
              <Switch checked={g.enabled} loading={busy === 'enabled'} onChange={(enabled) => call('enabled', '/system/gdrive', { enabled }, enabled ? 'Đã bật tự đẩy lên Drive' : 'Đã tắt tự đẩy lên Drive')} />
              Tự đẩy lên sau mỗi lần sao lưu
            </Flex>
            <Flex gap={8} align="center">
              Giữ trên Drive
              <InputNumber
                min={1}
                max={365}
                defaultValue={g.keep}
                key={g.keep}
                addonAfter="bản"
                style={{ width: 130 }}
                onBlur={(e) => {
                  const keep = Number(e.target.value);
                  if (keep >= 1 && keep !== g.keep) void call('keep', '/system/gdrive', { keep }, 'Đã lưu');
                }}
              />
            </Flex>
          </Flex>
          {last && (
            <Typography.Text type={last.ok ? 'secondary' : 'danger'}>
              {last.ok ? <CheckCircleFilled style={{ color: '#16a34a' }} /> : <CloseCircleFilled />} Lần đẩy gần nhất: {dayjs(last.at).format('HH:mm DD/MM/YYYY')}
              {last.ok
                ? ` · ${last.files?.map((f) => `${f.name} (${size(f.size)})`).join(', ')} · ${Math.max(1, Math.round(last.durationMs / 1000))} giây${last.removed ? ` · đã xóa ${last.removed} file cũ trên Drive` : ''}`
                : ` · Lỗi: ${last.error}`}
            </Typography.Text>
          )}
          <Flex gap={8} wrap>
            <Button type="primary" icon={<CloudUploadOutlined />} loading={busy === 'upload' || g.busy} onClick={() => call('upload', '/system/gdrive/upload', {}, 'Đã đẩy bản sao lưu mới nhất lên Google Drive')}>
              Đẩy bản mới nhất lên ngay
            </Button>
            <Popconfirm title="Ngắt kết nối Google Drive?" description="Các file đã tải lên vẫn còn trên Drive." okText="Ngắt" cancelText="Không" onConfirm={() => call('disconnect', '/system/gdrive/disconnect', {}, 'Đã ngắt kết nối')}>
              <Button danger icon={<DisconnectOutlined />} loading={busy === 'disconnect'}>
                Ngắt kết nối
              </Button>
            </Popconfirm>
          </Flex>
        </Flex>
      )}
    </Card>
  );
}
