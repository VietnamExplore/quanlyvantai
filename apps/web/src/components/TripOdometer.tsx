import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Flex, InputNumber, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatVnd } from './common';

export interface OdometerTrip {
  id: number;
  startKm?: number | null;
  endKm?: number | null;
  fuelNorm?: string | null;
  fuelPrice?: string | null;
  fuelLiters?: string | null;
  fuelCost?: string | null;
}

/** "120 km · 13,2 L · 290.000đ" (rỗng nếu chưa đủ km) */
export function odometerText(t: OdometerTrip) {
  if (t.startKm == null || t.endKm == null) return '';
  return [
    `${(t.endKm - t.startKm).toLocaleString('vi-VN')} km`,
    t.fuelLiters != null && `${Number(t.fuelLiters).toLocaleString('vi-VN')} L`,
    t.fuelCost != null && formatVnd(t.fuelCost),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Km đồng hồ của chuyến xe công ty và chi phí xăng theo định mức.
 * Lái xe ghi trên app; văn phòng xem và sửa được ở đây (cùng một dữ liệu).
 */
export function TripOdometer({ trip, canEdit }: { trip: OdometerTrip; canEdit: boolean }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ startKm: trip.startKm ?? null, endKm: trip.endKm ?? null, fuelNorm: trip.fuelNorm ? Number(trip.fuelNorm) : null });
  useEffect(() => setV({ startKm: trip.startKm ?? null, endKm: trip.endKm ?? null, fuelNorm: trip.fuelNorm ? Number(trip.fuelNorm) : null }), [trip]);

  async function save() {
    setBusy(true);
    try {
      await api(`/trips/${trip.id}/odometer`, { method: 'POST', body: v });
      message.success('Đã lưu km và tính lại chi phí xăng');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['/dispatch'] });
      queryClient.invalidateQueries({ queryKey: ['/bookings'] });
      queryClient.invalidateQueries({ queryKey: ['/reports'] });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const km = trip.startKm != null && trip.endKm != null ? trip.endKm - trip.startKm : null;
  return (
    <Card
      size="small"
      style={{ marginTop: 16 }}
      title="Km & xăng theo định mức"
      extra={canEdit && !editing && <Button size="small" onClick={() => setEditing(true)}>Sửa</Button>}
    >
      {editing ? (
        <Flex vertical gap={12}>
          <Space wrap>
            <div>
              <div>Km bắt đầu</div>
              <InputNumber min={0} value={v.startKm} onChange={(x) => setV({ ...v, startKm: x })} placeholder="Tự lấy chuyến trước" style={{ width: 170 }} />
            </div>
            <div>
              <div>Km kết thúc</div>
              <InputNumber min={0} value={v.endKm} onChange={(x) => setV({ ...v, endKm: x })} style={{ width: 150 }} />
            </div>
            <div>
              <div>Định mức (L/100km)</div>
              <InputNumber min={1} max={100} step={0.5} value={v.fuelNorm} onChange={(x) => setV({ ...v, fuelNorm: x })} placeholder="Theo lái xe" style={{ width: 150 }} />
            </div>
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Bỏ trống km bắt đầu để lấy km kết thúc của chuyến trước của xe. Sửa km kết thúc thì km bắt đầu của chuyến kế tiếp tự cập nhật theo.
          </Typography.Text>
          <Space>
            <Button type="primary" loading={busy} onClick={save}>Lưu</Button>
            <Button onClick={() => setEditing(false)}>Hủy</Button>
          </Space>
        </Flex>
      ) : (
        <Flex wrap gap={24}>
          <Stat label="Km bắt đầu" value={trip.startKm != null ? trip.startKm.toLocaleString('vi-VN') : '—'} />
          <Stat label="Km kết thúc" value={trip.endKm != null ? trip.endKm.toLocaleString('vi-VN') : '—'} />
          <Stat label="Quãng đường" value={km != null ? `${km.toLocaleString('vi-VN')} km` : '—'} />
          <Stat label="Định mức" value={trip.fuelNorm ? `${Number(trip.fuelNorm)} L/100km` : '—'} />
          <Stat label="Xăng theo định mức" value={trip.fuelLiters != null ? `${Number(trip.fuelLiters).toLocaleString('vi-VN')} L` : '—'} />
          <Stat
            label={trip.fuelPrice ? `Chi phí (${Number(trip.fuelPrice).toLocaleString('vi-VN')}đ/L)` : 'Chi phí'}
            value={trip.fuelCost != null ? formatVnd(trip.fuelCost) : km != null ? 'Chưa có giá xăng' : '—'}
            strong
          />
        </Flex>
      )}
    </Card>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Typography.Text>
      <div style={{ fontWeight: strong ? 700 : 500 }}>{value}</div>
    </div>
  );
}
