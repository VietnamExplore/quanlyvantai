import { CheckCircleFilled, PrinterOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Checkbox, Flex, Input, Result, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { ContractDoc, LEGAL_CSS } from '../components/ContractDoc';
import { DOC_CSS } from '../components/PrintDoc';
import type { ContractData } from '../contract';

/** Gọi API công khai (không gửi phiên đăng nhập) */
async function publicApi<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api/public' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(Array.isArray(data?.message) ? data.message.join('\n') : (data?.message ?? 'Có lỗi xảy ra'));
  return data as T;
}

/**
 * Hợp đồng vận chuyển điện tử: mở bằng đường dẫn / mã QR, không cần đăng nhập.
 * Lái xe xuất trình khi kiểm tra; bên thuê xem và bấm xác nhận đồng ý.
 */
export default function PublicContractPage({ token }: { token: string }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['public-contract', token],
    queryFn: () => publicApi<ContractData>(`/contracts/${encodeURIComponent(token)}`),
    retry: false,
  });
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.contract) document.title = `Hợp đồng vận chuyển ${data.contract.number}`;
  }, [data]);

  if (isLoading) {
    return (
      <Flex justify="center" style={{ padding: 48 }}>
        <Spin size="large" />
      </Flex>
    );
  }
  if (error || !data?.contract) return <Result status="404" title="Không tìm thấy hợp đồng" subTitle="Đường dẫn không đúng hoặc hợp đồng không còn hiệu lực." />;

  const c = data.contract;
  const accept = async () => {
    setSaving(true);
    try {
      await publicApi(`/contracts/${encodeURIComponent(token)}/accept`, { name });
      message.success('Đã xác nhận hợp đồng');
      await qc.invalidateQueries({ queryKey: ['public-contract', token] });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{DOC_CSS + LEGAL_CSS}</style>
      <div className="toolbar" style={{ position: 'static' }}>
        <Flex vertical gap={8} style={{ maxWidth: 820, margin: '0 auto' }}>
          <Flex justify="space-between" align="center" wrap gap={8}>
            <Typography.Text strong>
              Hợp đồng điện tử số {c.number} · {data.trips.length} chuyến · {data.passengers.length || '—'} hành khách
            </Typography.Text>
            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
              In / Lưu PDF
            </Button>
          </Flex>
          {data.booking.status === 'HUY' && <Alert type="error" showIcon title="Booking của hợp đồng này đã hủy" />}
          {c.acceptedAt ? (
            <Alert
              type="success"
              icon={<CheckCircleFilled />}
              showIcon
              title={`Bên thuê đã xác nhận đồng ý: ${c.acceptedName} · ${dayjs(c.acceptedAt).format('HH:mm DD/MM/YYYY')}`}
            />
          ) : (
            <Card size="small" title="Dành cho Bên A (bên thuê vận tải): xác nhận đồng ý hợp đồng">
              <Flex vertical gap={8}>
                <Input placeholder="Họ tên người xác nhận" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)}>
                  Tôi đã đọc và đồng ý toàn bộ nội dung hợp đồng và danh sách hành khách kèm theo
                </Checkbox>
                <Button type="primary" disabled={!agree || !name.trim()} loading={saving} onClick={accept}>
                  Xác nhận đồng ý hợp đồng
                </Button>
              </Flex>
            </Card>
          )}
        </Flex>
      </div>
      <div className="doc" lang="vi">
        <ContractDoc data={data} contract={c} />
      </div>
    </>
  );
}
