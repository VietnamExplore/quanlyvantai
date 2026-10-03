import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Form, Input, Row, Typography } from 'antd';
import { useEffect } from 'react';
import { api } from '../api';
import { useSettings } from '../components/common';
import type { Settings } from '../types';

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

  return (
    <Card style={{ maxWidth: 860 }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Thông tin công ty
      </Typography.Title>
      <Typography.Paragraph type="secondary">In trên phần đầu và cuối của báo giá gửi khách.</Typography.Paragraph>
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
          <Col span={24}>
            <Form.Item name="quoteFooter" label="Ghi chú cuối báo giá" extra="Điều khoản giá bao gồm / không bao gồm, hiệu lực báo giá, chính sách hủy…">
              <Input.TextArea rows={5} />
            </Form.Item>
          </Col>
        </Row>
        <Button type="primary" htmlType="submit" loading={save.isPending}>
          Lưu
        </Button>
      </Form>
    </Card>
  );
}
