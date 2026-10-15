import { AndroidOutlined, DownloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Flex, QRCode, Spin, Steps, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { downloadPageUrl, mb, type DriverAppInfo } from '../components/DriverAppCard';
import { BRAND } from '../theme';

/**
 * Trang tải app lái xe (công khai, không cần đăng nhập): lái xe quét mã QR trong phần mềm văn phòng → mở trang này
 * trên điện thoại Android → Tải app → cài đặt. Trên máy tính hiện mã QR để quét bằng điện thoại.
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
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isPhone = isAndroid || isIos;
  const server = window.location.origin;

  return (
    <div style={{ minHeight: '100vh', background: BRAND.bg, padding: 16, boxSizing: 'border-box' }}>
      <Card style={{ maxWidth: 520, margin: '24px auto', borderRadius: 16 }}>
        <Flex vertical align="center" gap={8} style={{ textAlign: 'center' }}>
          <img src="/api/settings/logo" alt="" style={{ width: 84, height: 84, objectFit: 'contain' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
          <Typography.Title level={3} style={{ margin: 0 }}>
            App lái xe
          </Typography.Title>
          <Typography.Text type="secondary">Nhận chuyến, kiểm tra trước chuyến, cập nhật trạng thái, chi phí, thu nhập</Typography.Text>
        </Flex>

        {!info && !error ? (
          <Flex justify="center" style={{ padding: 40 }}>
            <Spin />
          </Flex>
        ) : error || !info?.available ? (
          <Alert style={{ marginTop: 20 }} type="warning" showIcon message="Chưa có file cài đặt app lái xe" description="Liên hệ văn phòng điều hành." />
        ) : (
          <>
            {isIos && <Alert style={{ marginTop: 16 }} type="info" showIcon message="App hiện chỉ có cho điện thoại Android. Bản iPhone sẽ có sau – liên hệ văn phòng." />}
            <Flex vertical align="center" gap={6} style={{ marginTop: 20 }}>
              <Button type="primary" size="large" icon={<DownloadOutlined />} href="/api/app/driver/download" disabled={isIos} style={{ height: 52, fontSize: 17, paddingInline: 28 }}>
                Tải app ({mb(info.size)})
              </Button>
              <Typography.Text type="secondary">
                <AndroidOutlined /> Android · bản {info.version} · {dayjs(info.updatedAt).format('DD/MM/YYYY')}
              </Typography.Text>
              {info.notes && <Typography.Text style={{ whiteSpace: 'pre-line', textAlign: 'center' }}>Có gì mới: {info.notes}</Typography.Text>}
            </Flex>

            {!isPhone && (
              <Flex vertical align="center" gap={6} style={{ marginTop: 20 }}>
                <Typography.Text type="secondary">Quét mã bằng điện thoại Android để tải app</Typography.Text>
                <QRCode value={downloadPageUrl()} size={200} type="svg" />
              </Flex>
            )}

            <Typography.Title level={5} style={{ marginTop: 24 }}>
              Cài đặt
            </Typography.Title>
            <Steps
              direction="vertical"
              size="small"
              current={-1}
              items={[
                { title: 'Bấm "Tải app"', description: 'Chờ tải xong file LaiXe-….apk (nếu Chrome hỏi "Vẫn tải xuống?" thì bấm Tải xuống).' },
                { title: 'Mở file vừa tải', description: 'Kéo thanh thông báo xuống, bấm vào file .apk (hoặc mở ứng dụng Tệp → Tải xuống).' },
                { title: 'Cho phép cài đặt', description: 'Lần đầu, điện thoại hỏi "Cho phép cài ứng dụng từ nguồn này" → bấm Cài đặt / Cho phép, rồi quay lại bấm Cài đặt. Nếu Play Protect cảnh báo, chọn "Vẫn cài đặt".' },
                { title: 'Mở app và đăng nhập', description: `Địa chỉ máy chủ: ${server.replace(/^https?:\/\//, '')} – tên đăng nhập, mật khẩu do văn phòng cấp.` },
                { title: 'Cho phép thông báo', description: 'Bấm "Cho phép" khi app hỏi, để nhận chuyến mới ngay.' },
              ]}
            />
            <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: 8 }}>
              Cập nhật bản mới: app tự báo khi có bản mới, bấm Cập nhật rồi cài đè lên bản cũ – không mất dữ liệu, không phải đăng nhập lại.
            </Typography.Paragraph>
          </>
        )}
      </Card>
    </div>
  );
}
