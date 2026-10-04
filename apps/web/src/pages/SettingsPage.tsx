import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Flex, Form, Input, Popconfirm, Row, Typography, Upload } from 'antd';
import { useEffect, useState } from 'react';
import { api, apiUpload } from '../api';
import { logoUrl } from '../components/PrintDoc';
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
