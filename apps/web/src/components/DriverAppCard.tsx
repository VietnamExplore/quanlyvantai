import { AndroidOutlined, CopyOutlined, DownloadOutlined, QrcodeOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Divider, Flex, Form, Input, InputNumber, Modal, Progress, QRCode, Typography, Upload } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api, tokenStore } from '../api';
import { useAuth } from '../auth';
import { copyText } from '../clipboard';

export interface DriverAppInfo {
  available: boolean;
  version?: string;
  versionCode?: number;
  size?: number;
  notes?: string | null;
  updatedAt?: string;
  url?: string;
}

/** Trang tải app công khai (lái xe quét mã QR) */
export const downloadPageUrl = () => `${window.location.origin}/tai-app`;
export const mb = (n?: number) => (n ? `${(n / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB` : '');

export function useDriverApp() {
  return useQuery({ queryKey: ['/app/driver'], queryFn: () => api<DriverAppInfo>('/app/driver'), staleTime: 60_000 });
}

/** Tải file APK lên kèm số phiên bản, có thanh tiến độ (file vài chục MB) */
function uploadApk(file: File, fields: Record<string, string>, onProgress: (p: number) => void) {
  return new Promise<DriverAppInfo>((resolve, reject) => {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.append(k, v);
    body.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/app/driver');
    const token = tokenStore.get();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: { message?: string | string[] } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* không phải JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as DriverAppInfo);
      else reject(new Error(Array.isArray(data?.message) ? data.message.join('\n') : (data?.message ?? `Không tải lên được (${xhr.status})`)));
    };
    xhr.onerror = () => reject(new Error('Mất kết nối khi tải file lên'));
    xhr.send(body);
  });
}

/** Thẻ "App lái xe" ở trang Lái xe: mã QR + link để lái xe tải app; Admin tải lên bản mới */
export function DriverAppCard() {
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');
  const queryClient = useQueryClient();
  const { data } = useDriverApp();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [form] = Form.useForm<{ version: string; versionCode: number; notes?: string }>();
  const link = downloadPageUrl();

  async function submit() {
    const v = await form.validateFields();
    if (!file) return message.warning('Chọn file .apk');
    setProgress(0);
    try {
      await uploadApk(file, { version: v.version.trim(), versionCode: String(v.versionCode), notes: v.notes ?? '' }, setProgress);
      message.success(`Đã phát hành app lái xe bản ${v.version}`);
      setFile(null);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['/app/driver'] });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  return (
    <>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Flex align="center" justify="space-between" gap={12} wrap>
          <Flex align="center" gap={10} style={{ minWidth: 0 }}>
            <AndroidOutlined style={{ fontSize: 26, color: '#16a34a' }} />
            <div style={{ minWidth: 0 }}>
              <b>App lái xe (Android)</b>
              <div style={{ color: '#64748b', fontSize: 13 }}>
                {data?.available ? `Bản ${data.version} · ${mb(data.size)} · cập nhật ${dayjs(data.updatedAt).format('DD/MM/YYYY')}` : 'Chưa có file cài đặt'}
              </div>
            </div>
          </Flex>
          <Button type="primary" icon={<QrcodeOutlined />} onClick={() => setOpen(true)}>
            Mã QR tải app
          </Button>
        </Flex>
      </Card>

      <Modal open={open} onCancel={() => setOpen(false)} footer={null} title="Tải app lái xe" width={520} destroyOnHidden>
        {data?.available ? (
          <Flex vertical align="center" gap={10}>
            <Typography.Text type="secondary" style={{ textAlign: 'center' }}>
              Lái xe mở <b>Camera</b> (hoặc Zalo → Quét mã QR) trên điện thoại Android, quét mã dưới đây, rồi bấm <b>Tải app</b>.
            </Typography.Text>
            <QRCode value={link} size={220} type="svg" />
            <Typography.Text strong style={{ fontSize: 16 }}>
              Bản {data.version} · {mb(data.size)}
            </Typography.Text>
            <Flex gap={8} wrap justify="center">
              <Button icon={<CopyOutlined />} onClick={() => copyText(link).then((ok) => (ok ? message.success('Đã chép link – dán vào Zalo gửi lái xe') : message.info(link)))}>
                Chép link gửi Zalo
              </Button>
              <Button icon={<DownloadOutlined />} href="/api/app/driver/download">
                Tải file .apk
              </Button>
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {link}
            </Typography.Text>
          </Flex>
        ) : (
          <Typography.Paragraph type="secondary">Chưa có file cài đặt app lái xe trên máy chủ.{isAdmin ? ' Tải file .apk lên ở phần dưới.' : ' Báo Admin tải file lên.'}</Typography.Paragraph>
        )}

        {isAdmin && (
          <>
            <Divider style={{ margin: '16px 0 12px' }}>Phát hành bản mới (Admin)</Divider>
            <Form form={form} layout="vertical" initialValues={{ versionCode: (data?.versionCode ?? 0) + 1 }}>
              <Upload
                accept=".apk"
                maxCount={1}
                beforeUpload={(f) => {
                  setFile(f);
                  return false;
                }}
                onRemove={() => setFile(null)}
                fileList={file ? [{ uid: '1', name: file.name, size: file.size, status: 'done' }] : []}
              >
                <Button icon={<UploadOutlined />}>Chọn file .apk</Button>
              </Upload>
              <Flex gap={12} style={{ marginTop: 12 }}>
                <Form.Item name="version" label="Phiên bản" rules={[{ required: true, pattern: /^\d+(\.\d+){1,3}$/, message: 'VD: 1.7.0' }]} style={{ flex: 1 }}>
                  <Input placeholder="1.7.0" />
                </Form.Item>
                <Form.Item name="versionCode" label="Mã phiên bản (versionCode)" rules={[{ required: true }]} style={{ flex: 1 }}>
                  <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                </Form.Item>
              </Flex>
              <Form.Item name="notes" label="Có gì mới (hiện trên trang tải app)">
                <Input.TextArea rows={2} />
              </Form.Item>
              {progress !== null && <Progress percent={progress} size="small" />}
              <Button type="primary" icon={<UploadOutlined />} onClick={submit} loading={progress !== null} block>
                Phát hành
              </Button>
            </Form>
          </>
        )}
      </Modal>
    </>
  );
}
