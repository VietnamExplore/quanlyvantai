import { HistoryOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Collapse, Empty, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { api } from '../api';

export interface AuditChange {
  field: string;
  from: string;
  to: string;
}

export interface AuditEntry {
  id: number;
  createdAt: string;
  userId: number | null;
  userName: string | null;
  action: string;
  method: string;
  path: string;
  entity: string | null;
  entityId: string | null;
  entityLabel: string | null;
  bookingId: number | null;
  detail: string | null;
  changes: AuditChange[] | null;
  ip: string | null;
  success: boolean;
}

/** Danh sách thay đổi "Trường: cũ → mới" */
export function ChangesList({ changes }: { changes: AuditChange[] | null }) {
  if (!changes?.length) return null;
  return (
    <ul className="audit-changes">
      {changes.map((c, i) => (
        <li key={i}>
          <b>{c.field}</b>
          {c.from || c.to ? ': ' : ''}
          {c.from && <span className="audit-from">{c.from}</span>}
          {c.from && c.to && ' → '}
          {c.to && <span className="audit-to">{c.to}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Lịch sử thay đổi của một booking (ai sửa gì, lúc nào) – thu gọn mặc định */
export function BookingHistoryCard({ bookingId }: { bookingId: number }) {
  return (
    <Collapse
      style={{ marginTop: 16, background: '#fff' }}
      items={[
        {
          key: 'h',
          label: (
            <span>
              <HistoryOutlined /> <b>Lịch sử thay đổi</b>
            </span>
          ),
          children: <BookingHistory bookingId={bookingId} />,
        },
      ]}
    />
  );
}

function BookingHistory({ bookingId }: { bookingId: number }) {
  const { data, isLoading } = useQuery({ queryKey: ['/audit-logs', 'booking', bookingId], queryFn: () => api<AuditEntry[]>(`/audit-logs/booking/${bookingId}`) });
  if (isLoading) return <Spin />;
  if (!data?.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có thay đổi nào được ghi lại" />;
  return (
    <div className="audit-timeline">
      {data.map((l) => (
        <div key={l.id} className="audit-row">
          <div className="audit-time">{dayjs(l.createdAt).format('HH:mm DD/MM/YYYY')}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div>
              <b>{l.userName ?? 'Hệ thống'}</b> · {l.action}
              {l.entity === 'Trip' && l.entityLabel && <Typography.Text type="secondary"> ({l.entityLabel.split(' · ').pop()})</Typography.Text>}
              {!l.success && (
                <Tag color="red" style={{ marginLeft: 6 }}>
                  Thất bại
                </Tag>
              )}
            </div>
            {l.detail && <Typography.Text type="secondary">{l.detail}</Typography.Text>}
            <ChangesList changes={l.changes} />
          </div>
        </div>
      ))}
    </div>
  );
}

export const AUDIT_ENTITY: Record<string, string> = {
  Booking: 'Booking',
  Trip: 'Chuyến xe',
  Payment: 'Thu tiền khách',
  Voucher: 'Phiếu thu chi',
  Advance: 'Tạm ứng',
  TripCost: 'Chi phí chuyến',
  Partner: 'Nhà xe đối tác',
  PartnerPayment: 'Thanh toán nhà xe',
  Vehicle: 'Xe',
  Driver: 'Lái xe',
  Customer: 'Khách hàng',
  Location: 'Địa điểm',
  VehicleType: 'Loại xe',
  Service: 'Dịch vụ',
  CostCategory: 'Loại chi phí',
  CustomerSource: 'Nguồn khách',
  RoutePrice: 'Giá tuyến',
  Surcharge: 'Phụ thu',
  Holiday: 'Ngày lễ',
  User: 'Người dùng / đăng nhập',
  Settings: 'Cài đặt công ty',
};

