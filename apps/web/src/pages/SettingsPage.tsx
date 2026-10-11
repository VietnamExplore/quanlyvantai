import { DeleteOutlined, KeyOutlined, TranslationOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Divider, Flex, Form, Input, Popconfirm, Row, Select, Tabs, Tag, Typography, Upload } from 'antd';
import { useEffect, useState } from 'react';
import { api, apiUpload } from '../api';
import { logoUrl } from '../components/PrintDoc';
import { useSettings } from '../components/common';
import { FuelPriceCard } from '../components/FuelPriceCard';
import { DEFAULT_CONTRACT_TERMS, DEFAULT_CONTRACT_TERMS_EN } from '../contract';
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
    <Card style={{ maxWidth: 920 }}>
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
        <Divider titlePlacement="start" style={{ marginTop: 0 }}>
          Thông tin công ty
        </Divider>
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
          <Col xs={24} md={8}>
            <Form.Item name="companyWebsite" label="Website">
              <Input placeholder="vd: www.congty.vn" />
            </Form.Item>
          </Col>
          <Col xs={24} md={16}>
            <Form.Item name="companySlogan" label="Khẩu hiệu / dịch vụ" tooltip="Hiện dưới tên công ty trên bảng đón khách, ví dụ: Dịch vụ đưa đón sân bay & du lịch">
              <Input placeholder="vd: Airport Transfer & Travel Service" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="bankInfo" label="Thông tin chuyển khoản" tooltip="Ví dụ: Vietcombank – STK 0123456789 – CTY TNHH DU LỊCH ABC">
              <Input.TextArea rows={3} />
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
          <Col xs={24} md={16}>
            <Form.Item
              name="zaloDriverGroup"
              label="Link nhóm Zalo lái xe"
              tooltip="Gán xe xong, phần mềm tự sao chép lệnh điều xe và có nút mở nhóm này để dán gửi. Lấy link: mở nhóm Zalo → Tùy chọn → Link tham gia nhóm → Sao chép."
              rules={[{ pattern: /^https?:\/\//, message: 'Dán đường dẫn bắt đầu bằng https://' }]}
            >
              <Input placeholder="https://zalo.me/g/abcxyz" />
            </Form.Item>
          </Col>
        </Row>

        <Divider titlePlacement="start">Vận hành &amp; giám sát hành trình</Divider>
        <Row gutter={16}>
          <Col xs={12} md={6}>
            <Form.Item name="gpsSpeedLimit" label="Giới hạn tốc độ" tooltip="Giám sát GPS: cảnh báo khi xe chạy quá tốc độ này (km/h). Mặc định 80.">
              <Input inputMode="numeric" placeholder="80" suffix="km/h" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="gpsStopMinutes" label="Dừng lâu khi chở khách" tooltip="Cảnh báo khi xe đứng yên quá số phút này lúc đang chở khách. Mặc định 20.">
              <Input inputMode="numeric" placeholder="20" suffix="phút" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="gpsLostMinutes" label="Mất tín hiệu GPS" tooltip="Cảnh báo khi chuyến đang chạy mà quá số phút này không nhận được vị trí. Mặc định 10.">
              <Input inputMode="numeric" placeholder="10" suffix="phút" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="preTripCheckRequired"
              label="Kiểm tra trước chuyến"
              // Chưa cài = bắt buộc
              getValueProps={(v) => ({ value: v === '0' ? '0' : '1' })}
              tooltip="Bắt buộc: trước mỗi chuyến xe công ty, lái xe kiểm tra trên app – đo nồng độ cồn (ảnh máy đo không bắt buộc), sức khỏe, giấy tờ, km, nhiên liệu, kỹ thuật xe. Chưa kiểm tra trong ngày hoặc lái xe không đạt (có cồn > 0 mg/L…) thì không bắt đầu được chuyến; điều hành được báo ngay."
            >
              <Select
                options={[
                  { value: '1', label: 'Bắt buộc' },
                  { value: '0', label: 'Không bắt buộc' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider titlePlacement="start">Tỷ lệ đóng bảo hiểm lái xe</Divider>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: -4 }}>
          % trên mức lương đóng bảo hiểm (cài ở Lương lái xe). Bỏ trống = tỷ lệ mặc định theo luật hiện hành.
        </Typography.Paragraph>
        {(
          [
            ['lai_xe', 'Lái xe đóng', 'trừ vào lương', { bhxh: '8', bhyt: '1.5', bhtn: '1' }],
            ['cong_ty', 'Công ty đóng', 'chi phí công ty', { bhxh: '17.5', bhyt: '3', bhtn: '1' }],
          ] as const
        ).map(([who, whoLabel, whoHint, def], row) => (
          <Row gutter={16} key={who} align="bottom">
            <Col xs={24} md={6}>
              <div style={{ paddingBottom: 24 }}>
                <Typography.Text strong>{whoLabel}</Typography.Text>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {whoHint}
                  </Typography.Text>
                </div>
              </div>
            </Col>
            {(['bhxh', 'bhyt', 'bhtn'] as const).map((k) => (
              <Col xs={8} md={6} key={k}>
                <Form.Item
                  name={`insuranceRate_${who}_${k}`}
                  label={row === 0 ? k.toUpperCase() : undefined}
                  rules={[{ pattern: /^\d{1,2}([.,]\d{1,2})?$/, message: 'Nhập số %' }]}
                  normalize={(v: string) => v?.replace(',', '.')}
                >
                  <Input inputMode="decimal" placeholder={def[k].replace('.', ',')} suffix="%" />
                </Form.Item>
              </Col>
            ))}
          </Row>
        ))}

        <Divider titlePlacement="start">Bản đồ giám sát GPS</Divider>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="vietmapKey"
              label="Khóa VietMap (khuyên dùng)"
              tooltip="Bản đồ của doanh nghiệp Việt Nam, thể hiện đúng chủ quyền (Hoàng Sa, Trường Sa). Đăng ký tại maps.vietmap.vn → Console → tạo API key; nên giới hạn khóa theo tên miền / IP của công ty. Có khóa VietMap thì dùng VietMap."
            >
              <Input placeholder="Khóa API VietMap" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="googleMapsKey"
              label="Khóa Google Maps"
              tooltip="Dùng khi chưa có khóa VietMap. Tạo ở console.cloud.google.com → APIs & Services → bật Maps JavaScript API → Credentials → Create API key; nên giới hạn theo địa chỉ web của công ty. Google tính phí theo lượt tải bản đồ, có hạn mức miễn phí hằng tháng."
            >
              <Input placeholder="AIza…" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: -8 }}>
              Chưa có khóa: dùng Google Maps nhúng miễn phí (tiếng Việt, vùng Việt Nam), mỗi lần xem một xe / một tuyến.
            </Typography.Paragraph>
          </Col>
        </Row>

        <Divider titlePlacement="start">Giá nhiên liệu</Divider>
        <FuelPriceCard />

        <Divider titlePlacement="start">Báo giá</Divider>
        <Form.Item name="quoteFooter" label="Ghi chú cuối báo giá" tooltip="Điều khoản giá bao gồm / không bao gồm, hiệu lực báo giá, chính sách hủy…">
          <Input.TextArea rows={5} />
        </Form.Item>

        <Divider titlePlacement="start">
          Hợp đồng vận chuyển &amp; lệnh vận chuyển (NĐ 158/2024, TT 36/2024)
        </Divider>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="companyRepresentative" label="Người đại diện ký hợp đồng" tooltip="In ở Bên B trên hợp đồng, Thủ trưởng đơn vị trên lệnh vận chuyển">
              <Input placeholder="Họ tên" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="companyRepresentativeTitle" label="Chức vụ">
              <Input placeholder="vd: Giám đốc" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="companyRepresentativeId" label="Số CCCD người đại diện">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="companyTransportLicense" label="Số giấy phép kinh doanh vận tải">
              <Input placeholder="vd: 4800xxxxxx" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="companyHotline" label="Số điện thoại tiếp nhận phản ánh, khiếu nại" tooltip="Bắt buộc ghi trên hợp đồng. Bỏ trống = Hotline công ty">
              <Input placeholder="Hotline công ty" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              name="contractTerms"
              label="Điều khoản hợp đồng (từ Điều 4)"
              extra={
                <>
                  Điều 1–3 (nội dung, hành trình, giá trị thanh toán) tự lấy từ booking. Dòng bắt đầu bằng ĐIỀU … được in đậm; {"{hotline}"} = số tiếp nhận phản ánh. Bỏ trống = dùng điều khoản mẫu.{" "}
                  <a onClick={() => form.setFieldValue("contractTerms", DEFAULT_CONTRACT_TERMS)}>Chép điều khoản mẫu vào để sửa</a>
                </>
              }
            >
              <Input.TextArea rows={8} placeholder={DEFAULT_CONTRACT_TERMS} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              name="contractTerms_en"
              label="Điều khoản hợp đồng tiếng Anh (bản song ngữ)"
              extra={
                <>
                  Dùng khi in hợp đồng song ngữ Việt – Anh. Mỗi điều bắt đầu bằng ARTICLE … theo đúng thứ tự Điều 4, 5… của bản tiếng Việt. Bỏ trống = dùng bản dịch của điều khoản mẫu.{' '}
                  <a onClick={() => form.setFieldValue('contractTerms_en', DEFAULT_CONTRACT_TERMS_EN)}>Chép bản dịch mẫu vào để sửa</a>
                </>
              }
            >
              <Input.TextArea rows={6} placeholder={DEFAULT_CONTRACT_TERMS_EN} />
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
