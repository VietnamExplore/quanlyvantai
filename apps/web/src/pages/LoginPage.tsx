import { CarOutlined, FileDoneOutlined, LockOutlined, ScheduleOutlined, TranslationOutlined, UserOutlined, WalletOutlined } from '@ant-design/icons';
import { Alert, Button, Flex, Form, Grid, Input, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import { useAuth } from '../auth';
import { BRAND } from '../theme';
import { UiLanguageSwitcher } from '../components/UiLanguage';

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <FileDoneOutlined />, title: 'Booking & báo giá', text: 'Tính giá tự động theo tuyến, theo ngày; báo giá in đẹp, gửi Zalo' },
  { icon: <ScheduleOutlined />, title: 'Điều xe trực quan', text: 'Lịch xe theo ngày, tuần, tháng; giao xe công ty hoặc nhà xe đối tác' },
  { icon: <WalletOutlined />, title: 'Công nợ & lương', text: 'Thu chi, công nợ khách – nhà xe, lương lái xe theo doanh số' },
  { icon: <TranslationOutlined />, title: 'Khách quốc tế', text: 'Giấy tờ Anh – Hàn – Trung – Nhật, dịch tự động' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const screens = Grid.useBreakpoint();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logoOk, setLogoOk] = useState(true);

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
    <Flex style={{ minHeight: '100vh', background: BRAND.bg }}>
      {/* Cột giới thiệu (ẩn trên điện thoại) */}
      {screens.lg && (
        <Flex
          vertical
          justify="space-between"
          style={{
            flex: '1 1 52%',
            padding: '48px 56px',
            color: '#e2e8f0',
            background: `radial-gradient(1200px 600px at 0% 0%, rgba(37,99,235,.35), transparent 60%), radial-gradient(900px 500px at 100% 100%, rgba(124,58,237,.25), transparent 60%), ${BRAND.navy}`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Flex align="center" gap={12}>
            <span
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `linear-gradient(135deg, ${BRAND.primary}, #60a5fa)`,
                boxShadow: '0 6px 20px rgba(37,99,235,.45)',
              }}
            >
              <CarOutlined style={{ color: '#fff', fontSize: 22 }} />
            </span>
            <span style={{ fontWeight: 700, fontSize: 18, color: '#fff' }}>Quản lý vận tải</span>
          </Flex>

          <div style={{ maxWidth: 520 }}>
            <div style={{ fontSize: 38, lineHeight: 1.15, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
              Vận hành đội xe
              <br />
              <span style={{ background: 'linear-gradient(90deg, #60a5fa, #c4b5fd)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                gọn gàng, chính xác
              </span>
            </div>
            <p style={{ fontSize: 15, color: 'rgba(226,232,240,.75)', marginTop: 16, lineHeight: 1.6 }}>
              Từ báo giá, điều xe, theo dõi chuyến đến công nợ và báo cáo – tất cả trong một phần mềm cho công ty du lịch, vận chuyển hành khách.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 32 }}>
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  style={{ padding: 16, borderRadius: 14, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', backdropFilter: 'blur(6px)' }}
                >
                  <div style={{ fontSize: 20, color: '#93c5fd' }}>{f.icon}</div>
                  <div style={{ fontWeight: 600, color: '#fff', marginTop: 8 }}>{f.title}</div>
                  <div style={{ fontSize: 13, color: 'rgba(226,232,240,.65)', marginTop: 4, lineHeight: 1.5 }}>{f.text}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'rgba(148,163,184,.7)' }}>© {new Date().getFullYear()} · Phần mềm quản lý vận tải hành khách</div>
        </Flex>
      )}

      {/* Cột đăng nhập */}
      <Flex flex="1 1 48%" align="center" justify="center" style={{ padding: 24, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 16, right: 16 }}>
          <UiLanguageSwitcher />
        </div>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <Flex vertical align="center" style={{ marginBottom: 28 }}>
            {logoOk && (
              <img
                src="/api/settings/logo"
                alt=""
                onError={() => setLogoOk(false)}
                style={{ maxHeight: 64, maxWidth: 220, objectFit: 'contain', marginBottom: 16 }}
              />
            )}
            <Typography.Title level={2} style={{ margin: 0, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Đăng nhập
            </Typography.Title>
            <Typography.Text type="secondary" style={{ marginTop: 6 }}>
              Chào mừng bạn quay lại. Nhập tài khoản để tiếp tục.
            </Typography.Text>
          </Flex>

          <div style={{ background: '#fff', borderRadius: 18, padding: 28, border: '1px solid #e9eef5', boxShadow: '0 10px 40px rgba(15,23,42,.08)' }}>
            {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
            <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
              <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}>
                <Input size="large" prefix={<UserOutlined style={{ color: BRAND.muted }} />} placeholder="Tên đăng nhập" autoFocus autoComplete="username" />
              </Form.Item>
              <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
                <Input.Password size="large" prefix={<LockOutlined style={{ color: BRAND.muted }} />} placeholder="Mật khẩu" autoComplete="current-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ marginTop: 4, height: 46, fontWeight: 600 }}>
                Đăng nhập
              </Button>
            </Form>
          </div>
          <Typography.Paragraph type="secondary" style={{ textAlign: 'center', fontSize: 12, marginTop: 18 }}>
            Quên mật khẩu? Liên hệ quản trị viên để được cấp lại.
          </Typography.Paragraph>
        </div>
      </Flex>
    </Flex>
  );
}
