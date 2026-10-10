import { useQuery } from '@tanstack/react-query';
import { Image, Space, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiBlob } from '../api';

export const INCIDENT_TYPE: Record<string, { label: string; color: string }> = {
  HONG_XE: { label: 'Hỏng xe', color: 'red' },
  VA_CHAM: { label: 'Va chạm / tai nạn', color: 'magenta' },
  TRE_GIO: { label: 'Kẹt xe / trễ giờ', color: 'orange' },
  KHACH_VANG: { label: 'Khách không có mặt', color: 'gold' },
  DOI_LICH_TRINH: { label: 'Khách đổi lịch trình', color: 'blue' },
  KHAC: { label: 'Khác', color: 'default' },
};

export const INCIDENT_STATUS: Record<string, { label: string; color: string }> = {
  MOI: { label: 'Mới', color: 'red' },
  DANG_XU_LY: { label: 'Đang xử lý', color: 'processing' },
  DA_XU_LY: { label: 'Đã xử lý', color: 'success' },
};

export const FUEL_LABEL: Record<number, string> = { 0: 'Cạn', 25: '¼', 50: '½', 75: '¾', 100: 'Đầy' };

export interface FieldIncident {
  id: number;
  tripId: number | null;
  type: string;
  note: string;
  photos: string[];
  status: string;
  handleNote: string | null;
  handledAt: string | null;
  createdAt: string;
  driver: { id: number; fullName: string; phone: string };
  vehicle: { id: number; plateNumber: string } | null;
  handledBy: { id: number; fullName: string } | null;
  trip: {
    id: number;
    seq: number;
    pickupTime: string;
    pickupAddress: string;
    dropoffAddress: string | null;
    status: string;
    booking: { id: number; code: string; contactName: string; contactPhone: string };
  } | null;
}

export interface VehicleCheckRow {
  id: number;
  kind: 'NHAN' | 'TRA';
  odometerKm: number | null;
  fuelLevel: number | null;
  items: { key: string; label: string; ok: boolean; note: string | null }[];
  defects: number;
  photos: string[];
  note: string | null;
  createdAt: string;
  vehicle: { id: number; plateNumber: string };
  driver: { id: number; fullName: string; phone: string };
}

/** Ảnh hiện trường (tải kèm đăng nhập), bấm để phóng to */
function FieldPhoto({ name, size }: { name: string; size: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let obj: string | null = null;
    apiBlob(`/field/photos/${encodeURIComponent(name)}`)
      .then((b) => {
        obj = URL.createObjectURL(b);
        if (alive) setUrl(obj);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [name]);
  if (!url)
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f2f4f7', borderRadius: 8 }}>
        <Spin size="small" />
      </div>
    );
  return <Image src={url} width={size} height={size} style={{ objectFit: 'cover', borderRadius: 8 }} />;
}

export function FieldPhotos({ photos, size = 72 }: { photos: string[]; size?: number }) {
  if (!photos.length) return null;
  return (
    <Image.PreviewGroup>
      <Space wrap size={6}>
        {photos.map((p) => (
          <FieldPhoto key={p} name={p} size={size} />
        ))}
      </Space>
    </Image.PreviewGroup>
  );
}

/** Chữ ký khách (SVG path khung 600×300) */
export function SignatureImage({ svg, height = 70 }: { svg: string; height?: number }) {
  return (
    <svg viewBox="0 0 600 300" style={{ height, width: height * 2, display: 'block' }}>
      <path d={svg} stroke="#0f1b2d" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** Khối "Khách ký nhận" trong chi tiết chuyến */
export function SignoffBlock({ trip }: { trip: { signoffName?: string | null; signoffAt?: string | null; signoffSvg?: string | null; signoffNote?: string | null } }) {
  if (!trip.signoffAt || !trip.signoffSvg) return null;
  return (
    <div style={{ border: '1px solid #d9f7be', background: '#f6ffed', borderRadius: 8, padding: '8px 12px' }}>
      <Typography.Text strong style={{ color: '#389e0d' }}>
        ✔ Khách đã ký nhận hoàn thành: {trip.signoffName} · {dayjs(trip.signoffAt).format('HH:mm DD/MM/YYYY')}
      </Typography.Text>
      <SignatureImage svg={trip.signoffSvg} />
      {trip.signoffNote && <Typography.Text type="secondary">Góp ý của khách: {trip.signoffNote}</Typography.Text>}
    </div>
  );
}

export function IncidentTags({ i }: { i: FieldIncident }) {
  const t = INCIDENT_TYPE[i.type] ?? INCIDENT_TYPE.KHAC;
  const st = INCIDENT_STATUS[i.status] ?? INCIDENT_STATUS.MOI;
  return (
    <>
      <Tag color={t.color}>{t.label}</Tag>
      <Tag color={st.color}>{st.label}</Tag>
    </>
  );
}

/** Sự cố lái xe đã báo trong chuyến (chi tiết chuyến ở trang Điều xe) */
export function TripIncidentList({ tripId }: { tripId: number }) {
  const { data = [] } = useQuery({ queryKey: ['/field/incidents', 'trip', tripId], queryFn: () => api<FieldIncident[]>('/field/incidents', { query: { tripId } }) });
  if (!data.length) return null;
  return (
    <div style={{ border: '1px solid #ffccc7', background: '#fff2f0', borderRadius: 8, padding: '8px 12px' }}>
      <Typography.Text strong>⚠ Sự cố lái xe báo</Typography.Text>
      {data.map((i) => (
        <div key={i.id} style={{ marginTop: 6 }}>
          <IncidentTags i={i} /> <Typography.Text type="secondary">{dayjs(i.createdAt).format('HH:mm DD/MM')}</Typography.Text>{' '}
          <Link to={`/field?incident=${i.id}`}>Xử lý</Link>
          <div style={{ whiteSpace: 'pre-wrap' }}>{i.note}</div>
          <FieldPhotos photos={i.photos} size={56} />
        </div>
      ))}
    </div>
  );
}
