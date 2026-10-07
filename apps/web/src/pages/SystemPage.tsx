import { CheckCircleFilled, ClearOutlined, CloseCircleFilled, CloudDownloadOutlined, DatabaseOutlined, SaveOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, Collapse, Flex, Form, InputNumber, Popconfirm, Row, Select, Statistic, Switch, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { api, apiBlob } from '../api';
import { ResponsiveTable } from '../components/ResponsiveTable';
import { GdriveCard, type GdriveStatus } from '../components/GdriveCard';

interface MaintenanceConfig {
  backupEnabled: boolean;
  backupHour: number;
  backupKeep: number;
  auditRetentionMonths: number;
  notificationRetentionDays: number;
}

interface BackupSet {
  name: string;
  db?: { file: string; size: number };
  uploads?: { file: string; size: number };
}

interface Status {
  config: MaintenanceConfig;
  lastBackup: { at: string; ok: boolean; trigger: 'auto' | 'manual'; by: string | null; dbSize?: number; uploadsSize?: number; durationMs: number; error?: string } | null;
  lastCleanup: { at: string; auditDeleted: number; notificationsDeleted: number } | null;
  backups: BackupSet[];
  busy: boolean;
  dir: string;
  disk: { free: number; total: number } | null;
  stats: { auditCount: number; auditOldest: string | null; notificationCount: number; dbSize: number };
  gdrive: GdriveStatus;
}

/** 1536000 → "1,5 MB" */
export function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('vi-VN', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}

/** "20261005-0200" → ngày giờ */
const setTime = (name: string) => dayjs(name, 'YYYYMMDD-HHmm');
const fmt = (d: string | dayjs.Dayjs) => dayjs(d).format('HH:mm DD/MM/YYYY');

const AUDIT_OPTIONS = [6, 12, 24, 36, 60].map((m) => ({ value: m, label: `${m} tháng` })).concat({ value: 0, label: 'Giữ mãi, không xóa' });
const NOTIFY_OPTIONS = [30, 60, 90, 180, 365].map((d) => ({ value: d, label: `${d} ngày` })).concat({ value: 0, label: 'Giữ mãi, không xóa' });

/** Sao lưu tự động và dọn nhật ký thao tác / thông báo cũ (chỉ Admin) */
export default function SystemPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<MaintenanceConfig>();
  const [busy, setBusy] = useState<'save' | 'backup' | 'cleanup' | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['/system/maintenance'],
    queryFn: () => api<Status>('/system/maintenance'),
    // Đang chờ xác nhận Google / đang tải lên Drive: tự cập nhật vài giây một lần
    refetchInterval: (q) => (q.state.data?.gdrive.pending || q.state.data?.gdrive.busy ? 3000 : false),
  });

  useEffect(() => {
    if (data) form.setFieldsValue(data.config);
  }, [data, form]);

  async function call(kind: 'save' | 'backup' | 'cleanup', fn: () => Promise<Status>, ok: string) {
    setBusy(kind);
    try {
      const s = await fn();
      queryClient.setQueryData(['/system/maintenance'], s);
      message.success(ok);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function download(file: string) {
    try {
      const blob = await apiBlob(`/system/backups/${encodeURIComponent(file)}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const last = data?.lastBackup;
  const cfg = data?.config;

  return (
    <Flex vertical gap={16}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card loading={isLoading}>
            <Statistic
              title="Sao lưu gần nhất"
              value={last ? fmt(last.at) : 'Chưa sao lưu lần nào'}
              prefix={last ? last.ok ? <CheckCircleFilled style={{ color: '#16a34a' }} /> : <CloseCircleFilled style={{ color: '#dc2626' }} /> : null}
              styles={{ content: { fontSize: 20 } }}
            />
            {last && (
              <Typography.Text type={last.ok ? 'secondary' : 'danger'}>
                {last.ok
                  ? `${fmtSize((last.dbSize ?? 0) + (last.uploadsSize ?? 0))} · ${Math.max(1, Math.round(last.durationMs / 1000))} giây · ${last.trigger === 'auto' ? 'tự động' : `${last.by ?? ''} bấm sao lưu`}`
                  : `Lỗi: ${last.error}`}
              </Typography.Text>
            )}
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card loading={isLoading}>
            <Statistic title="Dữ liệu" value={fmtSize(data?.stats.dbSize ?? 0)} styles={{ content: { fontSize: 20 } }} />
            <Typography.Text type="secondary">
              {data?.stats.auditCount.toLocaleString('vi-VN')} nhật ký
              {data?.stats.auditOldest ? ` (từ ${dayjs(data.stats.auditOldest).format('DD/MM/YYYY')})` : ''} · {data?.stats.notificationCount.toLocaleString('vi-VN')} thông báo
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card loading={isLoading}>
            <Statistic
              title="Ổ đĩa còn trống"
              value={data?.disk ? fmtSize(data.disk.free) : '—'}
              styles={{ content: { fontSize: 20, color: data?.disk && data.disk.free < 5 * 1024 ** 3 ? '#dc2626' : undefined } }}
            />
            {data?.disk && <Typography.Text type="secondary">trên tổng {fmtSize(data.disk.total)}</Typography.Text>}
          </Card>
        </Col>
      </Row>

      <Card
        title="Cài đặt sao lưu & dọn dẹp"
        extra={
          <Button type="primary" icon={<SaveOutlined />} loading={busy === 'save'} onClick={() => form.validateFields().then((v) => call('save', () => api<Status>('/system/maintenance', { method: 'PUT', body: v }), 'Đã lưu cài đặt'))}>
            Lưu
          </Button>
        }
      >
        <Form form={form} layout="vertical" disabled={isLoading}>
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item name="backupEnabled" label="Sao lưu tự động hằng ngày" valuePropName="checked">
                <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="backupHour" label="Giờ chạy" tooltip="Máy chủ tắt vào giờ này thì sẽ chạy bù ngay khi bật lại trong ngày">
                <Select options={Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${String(h).padStart(2, '0')}:00` }))} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="backupKeep" label="Giữ lại" tooltip="Số bản sao lưu mới nhất được giữ; bản cũ hơn tự xóa" rules={[{ required: true, message: 'Nhập số bản' }]}>
                <InputNumber min={1} max={365} addonAfter="bản" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="auditRetentionMonths" label="Nhật ký thao tác giữ trong" tooltip="Nhật ký cũ hơn sẽ tự xóa mỗi đêm. Mỗi năm nhật ký chỉ khoảng vài trăm MB.">
                <Select options={AUDIT_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="notificationRetentionDays" label="Thông báo đã đọc giữ trong" tooltip="Thông báo đã đọc cũ hơn sẽ tự xóa; thông báo chưa đọc giữ tối đa 1 năm">
                <Select options={NOTIFY_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
        {data?.lastCleanup && (
          <Typography.Text type="secondary">
            Lần dọn gần nhất: {fmt(data.lastCleanup.at)} · xóa {data.lastCleanup.auditDeleted.toLocaleString('vi-VN')} nhật ký, {data.lastCleanup.notificationsDeleted.toLocaleString('vi-VN')} thông báo
          </Typography.Text>
        )}
      </Card>

      <GdriveCard<Status> status={data?.gdrive} onStatus={(st) => queryClient.setQueryData(['/system/maintenance'], st)} />

      <Card
        title={`Bản sao lưu (${data?.backups.length ?? 0})`}
        extra={
          <Flex gap={8} wrap>
            <Popconfirm
              title="Dọn ngay?"
              description={cfg ? `Xóa nhật ký cũ hơn ${cfg.auditRetentionMonths || '∞'} tháng và thông báo đã đọc cũ hơn ${cfg.notificationRetentionDays || '∞'} ngày (theo cài đặt đã lưu).` : undefined}
              okText="Dọn"
              cancelText="Không"
              onConfirm={() => call('cleanup', () => api<Status>('/system/cleanup/run', { method: 'POST' }), 'Đã dọn dẹp')}
            >
              <Button icon={<ClearOutlined />} loading={busy === 'cleanup'}>
                Dọn ngay
              </Button>
            </Popconfirm>
            <Button type="primary" icon={<DatabaseOutlined />} loading={busy === 'backup' || data?.busy} onClick={() => call('backup', () => api<Status>('/system/backups/run', { method: 'POST' }), 'Đã sao lưu xong')}>
              Sao lưu ngay
            </Button>
          </Flex>
        }
      >
        {data?.gdrive.connected && data.gdrive.enabled ? (
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
            title={
              <>
                Bản sao lưu lưu ở <b>{data.dir}</b> và <b>tự đẩy lên Google Drive</b> ({data.gdrive.account}) sau mỗi lần sao lưu. File chứa toàn bộ dữ liệu, cần cất giữ cẩn thận.
              </>
            }
          />
        ) : (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            title={
              <>
                Bản sao lưu lưu ở <b>{data?.dir}</b> trên cùng máy chủ: máy chủ hỏng thì bản sao lưu trên đó cũng mất. Nên <b>kết nối Google Drive</b> ở trên để tự đẩy lên, hoặc tải bản mới nhất về
                máy khác (USB…) ít nhất mỗi tuần. File chứa toàn bộ dữ liệu, cần cất giữ cẩn thận.
              </>
            }
          />
        )}
        <ResponsiveTable<BackupSet>
          rowKey="name"
          size="small"
          loading={isLoading}
          dataSource={data?.backups ?? []}
          pagination={false}
          locale={{ emptyText: 'Chưa có bản sao lưu. Bấm "Sao lưu ngay" để tạo bản đầu tiên.' }}
          columns={[
            { title: 'Thời điểm', render: (_, s) => setTime(s.name).format('HH:mm, DD/MM/YYYY') },
            {
              title: 'Cơ sở dữ liệu',
              render: (_, s) =>
                s.db ? (
                  <Button size="small" icon={<CloudDownloadOutlined />} onClick={() => download(s.db!.file)}>
                    {fmtSize(s.db.size)}
                  </Button>
                ) : (
                  '—'
                ),
            },
            {
              title: 'File tải lên (bảng đón, chứng từ…)',
              render: (_, s) =>
                s.uploads ? (
                  <Button size="small" icon={<CloudDownloadOutlined />} onClick={() => download(s.uploads!.file)}>
                    {fmtSize(s.uploads.size)}
                  </Button>
                ) : (
                  '—'
                ),
            },
          ]}
        />
        <Collapse
          ghost
          style={{ marginTop: 8 }}
          items={[
            {
              key: 'restore',
              label: 'Cách khôi phục dữ liệu từ bản sao lưu',
              children: (
                <Typography.Paragraph style={{ margin: 0 }}>
                  Khôi phục sẽ <b>ghi đè toàn bộ dữ liệu hiện tại</b>, nên do người phụ trách kỹ thuật thực hiện. Chép 2 file cùng thời điểm (<code>db-….dump</code>, <code>uploads-….tar.gz</code>) vào thư mục
                  <code>deploy</code> rồi chạy:
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#f5f5f5', padding: 8, borderRadius: 6, marginTop: 8 }}>
                    {`docker compose stop api
docker compose cp db-XXXX.dump db:/tmp/restore.dump
docker compose exec db pg_restore -U transfer -d transfer --clean --if-exists --no-owner /tmp/restore.dump
docker compose run --rm -v "$PWD:/in" --entrypoint sh api -c "tar xzf /in/uploads-XXXX.tar.gz -C /data"
docker compose start api`}
                  </pre>
                </Typography.Paragraph>
              ),
            },
          ]}
        />
      </Card>
    </Flex>
  );
}
