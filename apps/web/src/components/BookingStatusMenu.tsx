import { DownOutlined, SwapOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Dropdown, Input } from 'antd';
import { api } from '../api';
import { BOOKING_STATUS } from '../labels';
import type { Booking, BookingStatus } from '../types';

/** Các bước chuyển trạng thái được phép (giống máy chủ) */
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  NHAP: ['BAO_GIA', 'XAC_NHAN', 'HUY'],
  BAO_GIA: ['NHAP', 'XAC_NHAN', 'HUY'],
  XAC_NHAN: ['HOAN_THANH', 'HUY'],
  HOAN_THANH: ['XAC_NHAN'],
  HUY: [],
};

const ACTION_LABEL: Partial<Record<BookingStatus, string>> = {
  NHAP: 'Về nháp',
  BAO_GIA: 'Đã gửi báo giá',
  XAC_NHAN: 'Khách xác nhận',
  HOAN_THANH: 'Hoàn thành',
  HUY: 'Hủy booking',
};

/** Nút chọn nhanh trạng thái booking ngay trên danh sách */
export function BookingStatusMenu({ booking }: { booking: Pick<Booking, 'id' | 'code' | 'status' | 'trips'> }) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const next = TRANSITIONS[booking.status];
  if (!next.length) return null;

  async function change(status: BookingStatus, cancelReason?: string) {
    try {
      await api(`/bookings/${booking.id}/status`, { method: 'POST', body: { status, cancelReason } });
      message.success(`${booking.code}: ${BOOKING_STATUS[status].label}`);
      queryClient.invalidateQueries({ queryKey: ['/bookings'] });
      queryClient.invalidateQueries({ queryKey: ['/dispatch'] });
      queryClient.invalidateQueries({ queryKey: ['/reports'] });
    } catch (e) {
      message.error((e as Error).message);
      throw e;
    }
  }

  function pick(status: BookingStatus) {
    if (status === 'HUY') {
      let reason = '';
      modal.confirm({
        title: `Hủy booking ${booking.code}?`,
        content: <Input.TextArea rows={3} autoFocus placeholder="Lý do hủy (bắt buộc)" onChange={(e) => (reason = e.target.value)} />,
        okText: 'Hủy booking',
        okButtonProps: { danger: true },
        cancelText: 'Không',
        onOk: () => {
          if (!reason.trim()) {
            message.warning('Vui lòng nhập lý do hủy');
            return Promise.reject();
          }
          return change('HUY', reason);
        },
      });
      return;
    }
    // Hoàn thành / mở lại: hỏi lại cho chắc; các bước khác đổi ngay
    if (status === 'HOAN_THANH' || booking.status === 'HOAN_THANH') {
      modal.confirm({
        title: status === 'HOAN_THANH' ? `Đánh dấu ${booking.code} đã hoàn thành?` : `Mở lại booking ${booking.code}?`,
        content: booking.status === 'HOAN_THANH' ? 'Booking chuyển về Đã xác nhận để thêm chuyến / điều xe lại.' : undefined,
        okText: status === 'HOAN_THANH' ? 'Hoàn thành' : 'Mở lại',
        cancelText: 'Không',
        onOk: () => change(status),
      });
      return;
    }
    change(status).catch(() => undefined);
  }

  const noTrips = !booking.trips.length;
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: next.map((s) => ({
          key: s,
          danger: s === 'HUY',
          disabled: noTrips && (s === 'BAO_GIA' || s === 'XAC_NHAN'),
          label: booking.status === 'HOAN_THANH' && s === 'XAC_NHAN' ? 'Mở lại (về Đã xác nhận)' : ACTION_LABEL[s],
        })),
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation();
          pick(key as BookingStatus);
        },
      }}
    >
      <Button size="small" icon={<SwapOutlined />} onClick={(e) => e.stopPropagation()} title="Đổi trạng thái">
        Trạng thái <DownOutlined style={{ fontSize: 10 }} />
      </Button>
    </Dropdown>
  );
}
