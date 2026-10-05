import { DeleteOutlined, KeyOutlined, TranslationOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Divider, Flex, Form, Input, Popconfirm, Row, Select, Tabs, Tag, Typography, Upload } from 'antd';
import { useEffect, useState } from 'react';
import { api, apiUpload } from '../api';
import { logoUrl } from '../components/PrintDoc';
import { useSettings } from '../components/common';
import type { Settings } from '../types';

const FOREIGN = [
  { code: 'en', label: 'Tiếng Anh' },
  { code: 'ko', label: 'Tiếng Hàn' },
  { code: 'zh', label: 'Tiếng Trung' },
  { code: 'ja', label: 'Tiếng Nhật' },
] as const;
type Foreign = (typeof FOREIGN)[number]['code'];
/** Các ô tiếng Việt được dịch sang ô ngoại ngữ cùng tên + "_en" … */
const TRANSLATED_FIELDS = ['companyName', 'companyAddress', 'bankInfo', 'quoteFooter'] as const;

export default function SettingsPage() {
  const settings = useSettings();
  const [form] = Form.useForm<Settings>();
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  useEffect(() => form.setFieldsValue(settings), [settings, form]);

  const save = useMutation({
    mutationFn: (values: Settings) => api('/settings', { method: 'PUT', body: values }),
    onSuccess: () => {
      message.success('Đã lưu thông tin công ty');
      queryClient.invalidateQueries({ queryKey: ['/settings'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  // ───── Dịch tự động ─────
  const [translating, setTranslating] = useState<Foreign | 'all' | null>(null);
  const [provider, setProvider] = useState<string>('claude');
  const [apiKey, setApiKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  useEffect(() => setProvider(settings.translateProvider || 'claude'), [settings.translateProvider]);

  /** Dịch các ô tiếng Việt sang một ngôn ngữ và điền vào form (chưa lưu) */
  async function fillTranslation(lang: Foreign) {
    const texts = TRANSLATED_FIELDS.map((k) => (form.getFieldValue(k) as string | undefined) ?? '');
    const res = await api<{ translations: string[] }>('/translate', { method: 'POST', body: { texts, target: lang } });
    form.setFieldsValue(Object.fromEntries(TRANSLATED_FIELDS.map((k, i) => [`${k}_${lang}`, res.translations[i]])));
  }

  async function translateTo(lang: Foreign) {
    setTranslating(lang);
    try {
      await fillTranslation(lang);
      message.success('Đã dịch. Xem lại rồi bấm Lưu.');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setTranslating(null);
    }
  }

  async function translateAll() {
    setTranslating('all');
    try {
      for (const l of FOREIGN) await fillTranslation(l.code);
      message.success('Đã dịch sang 4 ngôn ngữ. Xem lại từng tab rồi bấm Lưu.');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setTranslating(null);
    }
  }

  async function saveTranslateConfig() {
    setSavingKey(true);
    try {
      await api('/settings', { method: 'PUT', body: { translateProvider: provider } });
      if (apiKey.trim()) await api('/settings/translate-key', { method: 'PUT', body: { apiKey: apiKey.trim() } });
      setApiKey('');
      message.success('Đã lưu cài đặt dịch tự động');
      queryClient.invalidateQueries({ queryKey: ['/settings'] });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSavingKey(false);
    }
  }

  async function removeTranslateKey() {
    try {
      await api('/settings/translate-key', { method: 'PUT', body: { apiKey: '' } });
      message.success('Đã xóa khóa API dịch');
      queryClient.invalidateQueries({ queryKey: ['/settings'] });
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const [uploading, setUploading] = useState(false);
  const logo = logoUrl(settings);

  async function uploadLogo(file: File) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return message.error('Logo phải là ảnh PNG, JPG hoặc WEBP');
    if (file.size > 5 * 1024 * 1024) return message.error('Logo tối đa 5 MB');
    setUploading(true);
    try {
      await apiUpload('/settings/logo', file);
      message.success('Đã cập nhật logo');
      queryClient.invalidateQueries({ queryKey: ['/settings'] });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function removeLogo() {
    try {
      await api('/settings/logo', { method: 'DELETE' });
      message.success('Đã xóa logo');
      queryClient.invalidateQueries({ queryKey: ['/settings'] });
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Card style={{ maxWidth: 860 }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Thông tin công ty
      </Typography.Title>
      <Typography.Paragraph type="secondary">In trên đầu các bản in: báo giá, danh sách hành khách, bảng đón khách.</Typography.Paragraph>

      <Flex gap={16} align="center" wrap style={{ marginBottom: 20 }}>
        <Flex
          align="center"
          justify="center"
          style={{ width: 180, height: 110, border: '1px dashed #d9d9d9', borderRadius: 8, background: '#fafafa', padding: 8 }}
        >
          {logo ? (
            <img src={logo} alt="Logo công ty" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          ) : (
            <Typography.Text type="secondary">Chưa có logo</Typography.Text>
          )}
        </Flex>
        <div>
          <Typography.Text strong>Logo công ty</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 8px', fontSize: 13 }}>
            Ảnh PNG (nên dùng nền trong suốt), JPG hoặc WEBP, tối đa 5 MB. Logo ngang hoặc vuông đều được, hệ thống tự canh cho vừa.
          </Typography.Paragraph>
          <Flex gap={8}>
            <Upload accept="image/png,image/jpeg,image/webp" showUploadList={false} beforeUpload={(f) => (uploadLogo(f), false)}>
              <Button icon={<UploadOutlined />} loading={uploading}>
                {logo ? 'Đổi logo' : 'Tải logo lên'}
              </Button>
            </Upload>
            {logo && (
              <Popconfirm title="Xóa logo?" okText="Xóa" cancelText="Không" onConfirm={removeLogo}>
                <Button danger icon={<DeleteOutlined />}>
                  Xóa logo
                </Button>
              </Popconfirm>
            )}
          </Flex>
        </div>
      </Flex>
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x ?? ''])))}>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item name="companyName" label="Tên công ty" rules={[{ required: true, message: 'Nhập tên công ty' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="companyAddress" label="Địa chỉ">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="companyPhone" label="Hotline">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="companyEmail" label="Email">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="companyTaxCode" label="Mã số thuế">
              <Input />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="bankInfo" label="Thông tin chuyển khoản" extra="Ví dụ: Vietcombank – STK 0123456789 – CTY TNHH DU LỊCH ABC">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="invoiceEmail"
              label="Email nhận hóa đơn"
              tooltip="Nhà xe đối tác xuất hóa đơn cho công ty sẽ thấy email này (cùng tên công ty, MST, địa chỉ). Bỏ trống = email công ty."
              rules={[{ type: 'email', message: 'Email không hợp lệ' }]}
            >
              <Input placeholder="Email công ty" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="fuelPrice"
              label="Giá xăng dầu (đ/lít)"
              tooltip="Dùng tính chi phí xăng từng chuyến = số km × định mức (cài ở Loại xe / Xe) × giá. Bỏ trống = giá bình quân các lần đổ xăng 60 ngày gần đây."
            >
              <Input placeholder="Giá bình quân các lần đổ xăng" inputMode="numeric" suffix="đ/lít" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="quoteFooter" label="Ghi chú cuối báo giá" extra="Điều khoản giá bao gồm / không bao gồm, hiệu lực báo giá, chính sách hủy…">
              <Input.TextArea rows={5} />
            </Form.Item>
          </Col>
        </Row>

        <Divider titlePlacement="start" style={{ marginTop: 8 }}>
          <TranslationOutlined /> Ngôn ngữ trên giấy tờ gửi khách nước ngoài
        </Divider>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          Tên công ty, địa chỉ, thông tin chuyển khoản và ghi chú cuối báo giá in trên báo giá / danh sách hành khách / bảng đón bằng ngoại ngữ. Bấm{' '}
          <b>Dịch tự động</b> để điền bản dịch từ phần tiếng Việt ở trên, xem lại rồi bấm <b>Lưu</b>. Ô nào bỏ trống sẽ dùng bản tiếng Việt.
        </Typography.Paragraph>
        <Flex justify="flex-end" style={{ marginBottom: 8 }}>
          <Button icon={<TranslationOutlined />} loading={translating === 'all'} disabled={!!translating} onClick={() => translateAll()}>
            Dịch tự động tất cả ngôn ngữ
          </Button>
        </Flex>
        <Tabs
          items={FOREIGN.map((l) => ({
            key: l.code,
            label: l.label,
            forceRender: true,
            children: (
              <>
                <Flex justify="flex-end" style={{ marginBottom: 8 }}>
                  <Button size="small" icon={<TranslationOutlined />} loading={translating === l.code} disabled={!!translating} onClick={() => translateTo(l.code)}>
                    Dịch tự động sang {l.label}
                  </Button>
                </Flex>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item name={`companyName_${l.code}`} label="Tên công ty">
                      <Input placeholder={settings.companyName} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name={`companyAddress_${l.code}`} label="Địa chỉ">
                      <Input placeholder={settings.companyAddress} />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item name={`bankInfo_${l.code}`} label="Thông tin chuyển khoản">
                      <Input.TextArea rows={2} placeholder={settings.bankInfo} />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item name={`quoteFooter_${l.code}`} label="Ghi chú cuối báo giá" style={{ marginBottom: 8 }}>
                      <Input.TextArea rows={5} />
                    </Form.Item>
                  </Col>
                </Row>
              </>
            ),
          }))}
        />
        <Button type="primary" htmlType="submit" loading={save.isPending}>
          Lưu
        </Button>
      </Form>

      <Divider titlePlacement="start" style={{ marginTop: 28 }}>
        <KeyOutlined /> Dịch vụ dịch tự động
      </Divider>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Dùng cho các nút <b>Dịch tự động</b>. Nội dung cần dịch được gửi tới dịch vụ đã chọn. Bạn tự tạo tài khoản và lấy khóa API ở trang của dịch vụ, rồi dán vào
        đây. Khóa được lưu trên máy chủ và không hiển thị lại.
      </Typography.Paragraph>
      <Row gutter={12} align="bottom">
        <Col xs={24} md={8}>
          <Typography.Text>Dịch vụ</Typography.Text>
          <Select
            style={{ width: '100%', marginTop: 4 }}
            value={provider}
            onChange={setProvider}
            options={[
              { value: 'gemini', label: 'Google Gemini' },
              { value: 'claude', label: 'Claude (Anthropic)' },
              { value: 'google', label: 'Google Translate' },
              { value: 'deepl', label: 'DeepL' },
            ]}
          />
        </Col>
        <Col xs={24} md={11}>
          <Typography.Text>
            Khóa API{' '}
            {settings.translateKeySet ? (
              <Tag color="green">Đã cài {settings.translateKeyHint}</Tag>
            ) : (
              <Tag color="orange">Chưa cài</Tag>
            )}
          </Typography.Text>
          <Input.Password
            style={{ marginTop: 4 }}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings.translateKeySet ? 'Nhập khóa mới để thay' : 'Dán khóa API vào đây'}
            autoComplete="off"
          />
        </Col>
        <Col xs={24} md={5}>
          <Button type="primary" ghost block loading={savingKey} onClick={saveTranslateConfig}>
            Lưu cài đặt dịch
          </Button>
        </Col>
      </Row>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
        Lấy khóa: Gemini – aistudio.google.com (bấm Get API key, có gói miễn phí) · Claude – console.anthropic.com (mục API Keys) · Google – console.cloud.google.com (bật Cloud Translation API, tạo API key) · DeepL –
        deepl.com/pro-api (gói Free có 500.000 ký tự/tháng).
        {settings.translateKeySet && (
          <>
            {' '}
            <Popconfirm title="Xóa khóa API dịch?" okText="Xóa" cancelText="Không" onConfirm={removeTranslateKey}>
              <Typography.Link type="danger">Xóa khóa</Typography.Link>
            </Popconfirm>
          </>
        )}
      </Typography.Paragraph>
    </Card>
  );
}
