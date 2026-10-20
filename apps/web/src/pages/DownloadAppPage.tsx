import { AndroidOutlined, AppleOutlined, DownloadOutlined, MobileOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Flex, QRCode, Row, Spin, Steps, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { downloadPageUrl, mb, type DriverAppInfo } from '../components/DriverAppCard';
import { BRAND } from '../theme';

/** App lái xe bản web cho iPhone / iPad (Safari → Thêm vào Màn hình chính) */
const iphoneUrl = () => `${window.location.origin}/laixe/`;

const ANDROID_STEPS = [
  { title: 'Bấm "Tải app"', description: 'Chờ tải xong file .apk (nếu Chrome hỏi "Vẫn tải xuống?" thì bấm Tải xuống).' },
  { title: 'Mở file vừa tải', description: 'Kéo thanh thông báo xuống, bấm vào file .apk (hoặc mở ứng dụng Tệp → Tải xuống).' },
  { title: 'Cho phép cài đặt', description: 'Lần đầu, điện thoại hỏi "Cho phép cài ứng dụng từ nguồn này" → Cho phép, rồi bấm Cài đặt. Nếu Play Protect cảnh báo, chọn "Vẫn cài đặt".' },
  { title: 'Mở app Vietnam Explore Driver và đăng nhập', description: 'Tên đăng nhập, mật khẩu do văn phòng cấp.' },
  { title: 'Cho phép thông báo', description: 'Bấm "Cho phép" khi app hỏi, để nhận chuyến mới ngay.' },
];

const IPHONE_STEPS = [
  { title: 'Mở bằng Safari', description: 'Bấm "Mở app trên iPhone" (hoặc quét mã QR bằng Camera) – phải mở bằng Safari, không dùng Zalo / Chrome.' },
  { title: 'Thêm vào Màn hình chính', description: 'Bấm nút Chia sẻ (ô vuông có mũi tên lên) ở thanh dưới Safari → kéo xuống chọn "Thêm vào Màn hình chính" → Thêm.' },
  { title: 'Mở app từ biểu tượng mới', description: 'Biểu tượng "VNE Driver" xuất hiện trên màn hình chính. Mở từ biểu tượng này (không mở trong Safari) và đăng nhập.' },
  { title: 'Bấm "Bật thông báo" → Cho phép', description: 'Nhận báo chuyến mới, đổi giờ, hủy chuyến trên màn hình khóa, kèm số đỏ trên biểu tượng app. Cần iOS 16.4 trở lên.' },
];

/**
 * Trang tải app lái xe (công khai, không cần đăng nhập): lái xe quét mã QR trong phần mềm văn phòng → mở trang này.
 * Android: tải file cài .apk. iPhone / iPad: app bản web, thêm vào Màn hình chính (không cần App Store).
 * Mở trên máy tính: hiện mã QR cho cả hai loại điện thoại.
 */
export default function DownloadAppPage() {
  const [info, setInfo] = useState<DriverAppInfo | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch('/api/app/driver')
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setError(true));
  }, []);
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIos = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isPhone = isAndroid || isIos;

  const android = (
    <>
      {!info && !error ? (
        <Flex justify="center" style={{ padding: 24 }}>
          <Spin />
        </Flex>
      ) : error || !info?.available ? (
        <Alert type="warning" showIcon message="Chưa có file cài đặt app Android" description="Liên hệ văn phòng điều hành." />
      ) : (
        <Flex vertical align="center" gap={6}>
          {isAndroid && (
            <Button type="primary" size="large" icon={<DownloadOutlined />} href="/api/app/driver/download" style={{ height: 52, fontSize: 17, paddingInline: 28 }}>
              Tải app ({mb(info.size)})
            </Button>
          )}
          {!isPhone && <QRCode value={downloadPageUrl()} size={180} type="svg" />}
          <Typography.Text type="secondary">
            <AndroidOutlined /> Android · bản {info.version} · {dayjs(info.updatedAt).format('DD/MM/YYYY')}
          </Typography.Text>
          {info.notes && <Typography.Text style={{ whiteSpace: 'pre-line', textAlign: 'center' }}>Có gì mới: {info.notes}</Typography.Text>}
        </Flex>
      )}
      <Steps direction="vertical" size="small" current={-1} style={{ marginTop: 16 }} items={ANDROID_STEPS} />
      <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: 8 }}>
        Cập nhật bản mới: app tự báo khi có bản mới, bấm vào rồi cài đè lên bản cũ – không mất dữ liệu, không phải đăng nhập lại.
      </Typography.Paragraph>
    </>
  );

  const iphone = (
    <>
      <Flex vertical align="center" gap={6}>
        {isIos && (
          <Button type="primary" size="large" icon={<MobileOutlined />} href="/laixe/" style={{ height: 52, fontSize: 17, paddingInline: 28 }}>
            Mở app trên iPhone
          </Button>
        )}
        {!isPhone && <QRCode value={iphoneUrl()} size={180} type="svg" />}
        <Typography.Text type="secondary">
          <AppleOutlined /> iPhone / iPad · không cần App Store · luôn là bản mới nhất
        </Typography.Text>
      </Flex>
      <Steps direction="vertical" size="small" current={-1} style={{ marginTop: 16 }} items={IPHONE_STEPS} />
    </>
  );

  return (
    <div style={{ minHeight: '100vh', background: BRAND.bg, padding: 16, boxSizing: 'border-box' }}>
      <Card style={{ maxWidth: isPhone ? 520 : 880, margin: '24px auto', borderRadius: 16 }}>
        <Flex vertical align="center" gap={8} style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src="/api/settings/logo" alt="" style={{ width: 84, height: 84, objectFit: 'contain' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
          <Typography.Title level={3} style={{ margin: 0 }}>
            Vietnam Explore Driver
          </Typography.Title>
          <Typography.Text type="secondary">App lái xe: nhận chuyến, kiểm tra trước chuyến, cập nhật trạng thái, chi phí, thu nhập</Typography.Text>
        </Flex>

        {isAndroid ? (
          android
        ) : isIos ? (
          iphone
        ) : (
          <Row gutter={[24, 24]}>
            <Col xs={24} md={12}>
              <Typography.Title level={5}>
                <AndroidOutlined /> Điện thoại Android
              </Typography.Title>
              {android}
            </Col>
            <Col xs={24} md={12}>
              <Typography.Title level={5}>
                <AppleOutlined /> iPhone / iPad
              </Typography.Title>
              {iphone}
            </Col>
          </Row>
        )}
      </Card>
    </div>
  );
}
