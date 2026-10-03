import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Flex, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { useAuth } from '../auth';

export default function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onFinish = async (v: { username: string; password: string }) => {
    setError(null);
    setLoading(true);
    try {
      await login(v.username, v.password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: 16, background: 'var(--ant-color-bg-layout)' }}>
      <Card style={{ width: '100%', maxWidth: 380 }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 4 }}>
          Quản lý vận tải
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
          Đăng nhập để tiếp tục
        </Typography.Paragraph>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="username" rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}>
            <Input size="large" prefix={<UserOutlined />} placeholder="Tên đăng nhập" autoFocus />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
            <Input.Password size="large" prefix={<LockOutlined />} placeholder="Mật khẩu" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            Đăng nhập
          </Button>
        </Form>
      </Card>
    </Flex>
  );
}
