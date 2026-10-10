import { ReloadOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Flex, Segmented, Switch, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api } from '../api';
import { fuelType, useFuelPrices, type FuelPriceState } from '../fuel';

/** Bảng giá xăng dầu Petrolimex dùng tính chi phí xăng của chuyến; tự cập nhật lúc 15:00 hằng ngày */
export function FuelPriceCard() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading } = useFuelPrices();
  const [busy, setBusy] = useState(false);

  const call = async (fn: () => Promise<FuelPriceState>, ok: string) => {
    setBusy(true);
    try {
      const st = await fn();
      qc.setQueryData(['/fuel-prices'], st);
      if (st.lastError && fn === refresh) message.warning('Chưa lấy được giá Petrolimex, giữ giá cũ');
      else message.success(ok);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const refresh = () => api<FuelPriceState>('/fuel-prices/refresh', { method: 'POST' });

  return (
    <Card
      size="small"
      loading={isLoading}
      title="Giá xăng dầu Petrolimex (tự cập nhật 15:00 hằng ngày)"
      extra={
        <Button size="small" icon={<ReloadOutlined />} loading={busy} onClick={() => call(refresh, 'Đã cập nhật giá xăng dầu')}>
          Cập nhật ngay
        </Button>
      }
      style={{ marginBottom: 16 }}
    >
      {data && (
        <Flex vertical gap={10}>
          <Flex gap={16} wrap align="center">
            <span>
              Vùng giá:{' '}
              <Segmented
                size="small"
                value={data.zone}
                onChange={(z) => call(() => api<FuelPriceState>('/fuel-prices/config', { method: 'PUT', body: { zone: z } }), 'Đã đổi vùng giá')}
                options={[
                  { value: 1, label: 'Vùng 1' },
                  { value: 2, label: 'Vùng 2' },
                ]}
              />
            </span>
            <span>
              Tự cập nhật:{' '}
              <Switch
                size="small"
                checked={data.auto}
                onChange={(v) => call(() => api<FuelPriceState>('/fuel-prices/config', { method: 'PUT', body: { auto: v } }), v ? 'Đã bật tự cập nhật' : 'Đã tắt tự cập nhật')}
              />
            </span>
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
              {data.effectiveAt ? `Giá Petrolimex cập nhật lúc ${dayjs(data.effectiveAt).format('HH:mm DD/MM/YYYY')}` : 'Chưa lấy được giá'}
              {data.updatedAt && ` · lấy về lúc ${dayjs(data.updatedAt).format('HH:mm DD/MM')}`}
            </Typography.Text>
          </Flex>
          {data.lastError && <Alert type="warning" showIcon title={`Lần lấy giá gần nhất bị lỗi: ${data.lastError.split(' · ').slice(1).join(' · ')}`} />}
          <Table
            size="small"
            pagination={false}
            rowKey="title"
            dataSource={data.items}
            columns={[
              { title: 'Mặt hàng', dataIndex: 'title', render: (v, r) => <>{v} {fuelType(r.code) && <Tag color={fuelType(r.code)!.color}>dùng cho xe</Tag>}</> },
              { title: 'Vùng 1', dataIndex: 'zone1', align: 'right', render: (v) => <span style={{ fontWeight: data.zone === 1 ? 700 : 400 }}>{v.toLocaleString('vi-VN')}</span> },
              { title: 'Vùng 2', dataIndex: 'zone2', align: 'right', render: (v) => <span style={{ fontWeight: data.zone === 2 ? 700 : 400 }}>{v.toLocaleString('vi-VN')}</span> },
            ]}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
            Chi phí xăng dầu của chuyến (km × định mức × giá) dùng giá đúng loại nhiên liệu của xe (chọn ở Danh mục → Xe). Giá được chốt vào chuyến lúc ghi km kết
            thúc. Đơn vị: đồng/lít.
          </Typography.Text>
        </Flex>
      )}
    </Card>
  );
}
