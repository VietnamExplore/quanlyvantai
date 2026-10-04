import { Col, Divider, Form, Input, Row, Typography } from 'antd';

const LANGS = [
  { code: 'en', label: 'Tiếng Anh' },
  { code: 'ko', label: 'Tiếng Hàn' },
  { code: 'zh', label: 'Tiếng Trung' },
  { code: 'ja', label: 'Tiếng Nhật' },
] as const;

/** Ô nhập tên ngoại ngữ (in trên giấy tờ gửi khách nước ngoài), lưu vào trường names { en, ko, zh, ja } */
export function ForeignNamesFields({ placeholders, hint }: { placeholders?: Partial<Record<(typeof LANGS)[number]['code'], string>>; hint?: string }) {
  return (
    <>
      <Divider titlePlacement="start" style={{ margin: '4px 0 8px', fontSize: 13 }}>
        Tên trên giấy tờ gửi khách nước ngoài
      </Divider>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
        {hint ?? 'Bỏ trống thì giấy tờ ngoại ngữ dùng tên tiếng Việt.'}
      </Typography.Paragraph>
      <Row gutter={12}>
        {LANGS.map((l) => (
          <Col xs={12} key={l.code}>
            <Form.Item name={['names', l.code]} label={l.label} style={{ marginBottom: 12 }}>
              <Input placeholder={placeholders?.[l.code]} allowClear />
            </Form.Item>
          </Col>
        ))}
      </Row>
    </>
  );
}
