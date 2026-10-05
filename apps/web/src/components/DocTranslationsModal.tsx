import { TranslationOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Flex, Input, Modal, Segmented, Space, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { toDocLang } from '../doc-i18n';
import { ResponsiveTable } from './ResponsiveTable';

type Lang = 'en' | 'ko' | 'zh' | 'ja';
const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'Tiếng Anh' },
  { value: 'ko', label: 'Tiếng Hàn' },
  { value: 'zh', label: 'Tiếng Trung' },
  { value: 'ja', label: 'Tiếng Nhật' },
];

const NO_ROWS: Row[] = [];

interface Row {
  key: string;
  label: string;
  src: string;
  text: string;
  /** Câu tiếng Việt đã sửa sau khi dịch */
  stale: boolean;
}

/** Xem / dịch tự động / sửa bản dịch nội dung booking dùng cho giấy tờ ngoại ngữ */
export function DocTranslationsModal({ bookingId, open, onClose, docLanguage }: { bookingId: number; open: boolean; onClose: () => void; docLanguage?: string }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'DIEU_HANH', 'KINH_DOANH');
  const initial = toDocLang(docLanguage);
  const [lang, setLang] = useState<Lang>(initial === 'vi' ? 'en' : initial);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'auto' | 'force' | 'all' | 'save' | null>(null);

  useEffect(() => {
    if (open) setLang(initial === 'vi' ? 'en' : initial);
  }, [open, initial]);

  const queryKey = ['/bookings/translations', bookingId, lang];
  const { data, isFetching } = useQuery({
    queryKey,
    queryFn: () => api<Row[]>(`/bookings/${bookingId}/translations`, { query: { lang } }),
    enabled: open,
  });
  // Mảng rỗng cố định: tránh tạo mảng mới mỗi lần vẽ (làm hiệu ứng bên dưới chạy lặp vô hạn)
  const rows = data ?? NO_ROWS;
  useEffect(() => setTexts(Object.fromEntries(rows.map((r) => [r.key, r.text]))), [rows]);

  const dirty = rows.some((r) => (texts[r.key] ?? '') !== r.text);
  const missing = rows.filter((r) => !r.text || r.stale).length;

  const refreshBooking = () => {
    queryClient.invalidateQueries({ queryKey: ['/bookings', bookingId] });
    queryClient.invalidateQueries({ queryKey: ['/bookings/translations', bookingId] });
  };

  async function autoTranslate(target: Lang, force = false) {
    const data = await api<Row[]>(`/bookings/${bookingId}/translations/auto`, { method: 'POST', body: { lang: target, force } });
    if (target === lang) queryClient.setQueryData(queryKey, data);
  }

  async function run(kind: 'auto' | 'force' | 'all' | 'save') {
    if (dirty && kind !== 'save' && !window.confirm('Các chỗ đã sửa tay chưa lưu sẽ bị bỏ. Tiếp tục dịch tự động?')) return;
    if (kind === 'force' && !window.confirm('Dịch lại toàn bộ sẽ thay cả các bản dịch đã sửa tay. Tiếp tục?')) return;
    setBusy(kind);
    try {
      if (kind === 'save') {
        const data = await api<Row[]>(`/bookings/${bookingId}/translations`, {
          method: 'PUT',
          body: { lang, entries: rows.map((r) => ({ key: r.key, text: texts[r.key] ?? '' })) },
        });
        queryClient.setQueryData(queryKey, data);
        message.success('Đã lưu bản dịch');
      } else if (kind === 'auto' || kind === 'force') {
        await autoTranslate(lang, kind === 'force');
        message.success('Đã dịch tự động và lưu. Xem lại, sửa nếu cần rồi bấm Lưu.');
      } else {
        for (const l of LANGS) await autoTranslate(l.value);
        message.success('Đã dịch tự động sang 4 ngôn ngữ');
      }
      refreshBooking();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={980}
      title={
        <Space>
          <TranslationOutlined /> Bản dịch nội dung booking cho giấy tờ ngoại ngữ
        </Space>
      }
      footer={
        <Flex justify="space-between" wrap gap={8}>
          {canEdit ? (
            <Space wrap>
              <Button
                type="primary"
                ghost
                icon={<TranslationOutlined />}
                loading={busy === 'auto'}
                disabled={!!busy || !missing}
                title="Chỉ dịch các mục chưa dịch hoặc câu tiếng Việt đã sửa; giữ nguyên bản đã sửa tay"
                onClick={() => run('auto')}
              >
                Dịch tự động {missing ? `${missing} mục còn thiếu` : ''}
              </Button>
              <Button loading={busy === 'all'} disabled={!!busy || !rows.length} title="Dịch các mục còn thiếu cho cả Anh, Hàn, Trung, Nhật" onClick={() => run('all')}>
                Dịch cả 4 ngôn ngữ
              </Button>
              <Button type="link" loading={busy === 'force'} disabled={!!busy || !rows.length} onClick={() => run('force')}>
                Dịch lại toàn bộ
              </Button>
            </Space>
          ) : (
            <span />
          )}
          <Space>
            <Button onClick={onClose}>Đóng</Button>
            {canEdit && (
              <Button type="primary" loading={busy === 'save'} disabled={!!busy || !dirty} onClick={() => run('save')}>
                Lưu bản dịch
              </Button>
            )}
          </Space>
        </Flex>
      }
    >
      <Flex justify="space-between" align="center" wrap gap={8} style={{ marginBottom: 12 }}>
        <Segmented<Lang>
          value={lang}
          onChange={(v) => {
            if (dirty && !window.confirm('Có thay đổi chưa lưu. Bỏ thay đổi và chuyển ngôn ngữ?')) return;
            setLang(v);
          }}
          options={LANGS}
        />
        {rows.length > 0 &&
          (missing ? <Tag color="orange">{missing} mục chưa dịch / cần dịch lại</Tag> : <Tag color="green">Đã dịch đủ</Tag>)}
      </Flex>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Giấy tờ in bằng ngôn ngữ này (báo giá, tin nhắn báo giá, danh sách hành khách, bảng đón) sẽ dùng bản dịch dưới đây. Mục chưa dịch hoặc đã sửa câu tiếng
        Việt sau khi dịch sẽ in tiếng Việt. Tên khách, số điện thoại, mã booking không cần dịch.
      </Typography.Paragraph>
      {!rows.length && !isFetching ? (
        <Alert type="info" showIcon title="Booking chưa có nội dung tiếng Việt cần dịch (điểm đón / trả, lịch trình, phụ thu, ghi chú)." />
      ) : (
        <ResponsiveTable<Row>
          rowKey="key"
          size="small"
          loading={isFetching}
          dataSource={rows}
          pagination={false}
          scroll={{ y: 460 }}
          columns={[
            { title: 'Mục', dataIndex: 'label', width: 150, render: (v) => <Typography.Text type="secondary">{v}</Typography.Text> },
            { title: 'Tiếng Việt', dataIndex: 'src', width: 320, render: (v) => <div style={{ whiteSpace: 'pre-line' }}>{v}</div> },
            {
              title: 'Bản dịch',
              render: (_, r) => (
                <>
                  <Input.TextArea
                    autoSize={{ minRows: 1, maxRows: 8 }}
                    value={texts[r.key] ?? ''}
                    disabled={!canEdit}
                    placeholder="Chưa dịch – bấm Dịch tự động hoặc nhập tay"
                    onChange={(e) => setTexts((t) => ({ ...t, [r.key]: e.target.value }))}
                  />
                  {r.stale && (
                    <Tag color="orange" style={{ marginTop: 4 }}>
                      Câu tiếng Việt đã sửa – cần dịch lại
                    </Tag>
                  )}
                </>
              ),
            },
          ]}
        />
      )}
    </Modal>
  );
}
