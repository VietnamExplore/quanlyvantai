import { CloseOutlined, DownloadOutlined, DownOutlined, SwapOutlined, UserSwitchOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Dropdown, Flex, Input, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api } from '../api';
import { routeText } from '../booking-utils';
import { downloadExcel } from '../excel';
import { BOOKING_STATUS } from '../labels';
import type { Booking, BookingStatus } from '../types';
import { TRANSITIONS } from './BookingStatusMenu';
import { useSalesStaffOptions } from './common';

/** Trạng thái đổi được hàng loạt và nhãn nút */
const BULK_STATUS: { status: BookingStatus; label: string }[] = [
  { status: 'BAO_GIA', label: 'Đã gửi báo giá' },
  { status: 'XAC_NHAN', label: 'Khách xác nhận' },
  { status: 'HOAN_THANH', label: 'Hoàn thành' },
  { status: 'HUY', label: 'Hủy booking' },
];

/**
 * Thanh thao tác hàng loạt trên danh sách booking đã chọn:
 * đổi trạng thái, gán NV kinh doanh, xuất Excel. Booking không hợp lệ cho thao tác thì bỏ qua và báo lại.
 */
export function BookingBulkBar({
  selected,
  total,
  canEdit,
  onSelectAll,
  onClear,
  compact,
  canEditRow = () => true,
}: {
  /** Booking người dùng được sửa (của mình / Admin); còn lại bỏ qua khi đổi trạng thái, gán NV */
  canEditRow?: (b: Booking) => boolean;
  /** Điện thoại: nút nhỏ, nhãn ngắn để thanh không che màn hình */
  compact?: boolean;
  selected: Booking[];
  /** Tổng số booking theo bộ lọc (để chọn tất cả qua mọi trang) */
  total: number;
  canEdit: boolean;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const salesOptions = useSalesStaffOptions();
  const [busy, setBusy] = useState(false);
  if (!selected.length) return null;

  /** Chạy lần lượt từng booking, cuối cùng báo kết quả */
  async function run(title: string, list: Booking[], action: (b: Booking) => Promise<unknown>, skipped: { code: string; reason: string }[] = []) {
    setBusy(true);
    const failed: { code: string; reason: string }[] = [...skipped];
    let done = 0;
    for (const b of list) {
      try {
        await action(b);
        done++;
      } catch (e) {
        failed.push({ code: b.code, reason: (e as Error).message });
      }
    }
    setBusy(false);
    queryClient.invalidateQueries({ queryKey: ['/bookings'] });
    queryClient.invalidateQueries({ queryKey: ['/dispatch'] });
    queryClient.invalidateQueries({ queryKey: ['/reports'] });
    if (!failed.length) {
      message.success(`${title}: xong ${done} booking`);
      onClear();
      return;
    }
    modal.info({
      title: `${title}: xong ${done} / ${done + failed.length} booking`,
      width: 560,
      content: (
        <div style={{ maxHeight: 320, overflow: 'auto' }}>
          <Typography.Paragraph type="secondary">Các booking không thực hiện được:</Typography.Paragraph>
          {failed.map((f) => (
            <div key={f.code}>
              <b>{f.code}</b>: {f.reason}
            </div>
          ))}
        </div>
      ),
    });
  }

  function changeStatus(status: BookingStatus) {
    const ok = selected.filter((b) => canEditRow(b) && TRANSITIONS[b.status].includes(status) && !(status !== 'HUY' && !b.trips.length));
    const skipped = selected
      .filter((b) => !ok.includes(b))
      .map((b) => !canEditRow(b) ? { code: b.code, reason: 'booking của người khác, bạn không được sửa' } : ({ code: b.code, reason: b.status === status ? `đã ở trạng thái ${BOOKING_STATUS[status].label}` : `đang ${BOOKING_STATUS[b.status].label}, không chuyển sang ${BOOKING_STATUS[status].label} được` }));
    const label = BULK_STATUS.find((x) => x.status === status)!.label;
    if (!ok.length) {
      message.warning(`Không có booking nào trong số đã chọn chuyển được sang "${BOOKING_STATUS[status].label}"`);
      return;
    }
    let reason = '';
    modal.confirm({
      title: `${label}: ${ok.length} booking?`,
      width: 520,
      content: (
        <>
          {skipped.length > 0 && <Typography.Paragraph type="warning">Bỏ qua {skipped.length} booking không chuyển được trạng thái này.</Typography.Paragraph>}
          {status === 'HUY' && <Input.TextArea rows={3} autoFocus placeholder="Lý do hủy (bắt buộc, dùng chung cho các booking)" onChange={(e) => (reason = e.target.value)} />}
        </>
      ),
      okText: label,
      okButtonProps: { danger: status === 'HUY' },
      cancelText: 'Không',
      onOk: () => {
        if (status === 'HUY' && !reason.trim()) {
          message.warning('Vui lòng nhập lý do hủy');
          return Promise.reject();
        }
        return run(label, ok, (b) => api(`/bookings/${b.id}/status`, { method: 'POST', body: { status, cancelReason: status === 'HUY' ? reason.trim() : undefined } }), skipped);
      },
    });
  }

  function assignSales() {
    let salesUserId: number | null = null;
    const editable = selected.filter((b) => b.status !== 'HUY' && canEditRow(b));
    modal.confirm({
      title: `Gán nhân viên kinh doanh cho ${editable.length} booking`,
      content: <Select style={{ width: '100%', marginTop: 8 }} showSearch optionFilterProp="label" allowClear placeholder="Chọn nhân viên (bỏ trống = bỏ gán)" options={salesOptions} onChange={(v) => (salesUserId = v ?? null)} />,
      okText: 'Gán',
      cancelText: 'Không',
      onOk: () =>
        run(
          'Gán NV kinh doanh',
          editable,
          (b) => api(`/bookings/${b.id}`, { method: 'PATCH', body: { salesUserId } }),
          selected
            .filter((b) => !editable.includes(b))
            .map((b) => ({ code: b.code, reason: b.status === 'HUY' ? 'booking đã hủy, không sửa được' : 'booking của người khác, bạn không được sửa' })),
        ),
    });
  }

  async function exportExcel() {
    await downloadExcel(`booking-da-chon-${dayjs().format('YYYYMMDD-HHmm')}.xlsx`, [
      {
        name: 'Booking',
        title: `DANH SÁCH BOOKING ĐÃ CHỌN (${selected.length})`,
        headers: ['Mã booking', 'Mã khách', 'Khách hàng', 'Người liên hệ', 'SĐT', 'Ngày đi', 'Hành trình', 'Số chuyến', 'Trạng thái', 'Tổng tiền', 'Đã thu', 'Còn phải thu', 'NV kinh doanh', 'Ngày tạo'],
        sumColumns: [9, 10, 11],
        totalLabel: 'Tổng cộng',
        rows: selected.map((b) => {
          const trips = b.trips.filter((t) => t.status !== 'HUY');
          return [
            b.code,
            b.customerRef ?? '',
            b.customer?.name ?? '',
            b.contactName,
            b.contactPhone,
            b.trips[0] ? dayjs(b.trips[0].pickupTime).format('DD/MM/YYYY HH:mm') : '',
            trips.map((t) => routeText(t)).join(' | '),
            trips.length,
            BOOKING_STATUS[b.status].label,
            Number(b.total),
            Number(b.paid),
            b.status === 'HUY' ? 0 : Math.max(0, Number(b.balance)),
            b.salesUser?.fullName ?? '',
            dayjs(b.createdAt).format('DD/MM/YYYY'),
          ];
        }),
      },
    ]);
  }

  return (
    <Flex align="center" gap={compact ? 6 : 10} wrap className={compact ? 'bulk-bar bulk-bar-compact' : 'bulk-bar'}>
      <b>Đã chọn {selected.length}{compact ? '' : ' booking'}</b>
      {selected.length < total && (
        <Typography.Link onClick={onSelectAll}>{compact ? `Chọn cả ${total}` : `Chọn tất cả ${total} booking theo bộ lọc`}</Typography.Link>
      )}
      <span style={{ flex: 1 }} />
      {canEdit && (
        <>
          <Dropdown
            trigger={['click']}
            menu={{
              items: BULK_STATUS.map((x) => ({ key: x.status, label: x.label, danger: x.status === 'HUY' })),
              onClick: ({ key }) => changeStatus(key as BookingStatus),
            }}
          >
            <Button icon={<SwapOutlined />} loading={busy} size={compact ? 'small' : undefined}>
              {compact ? 'Trạng thái' : 'Đổi trạng thái'} <DownOutlined style={{ fontSize: 10 }} />
            </Button>
          </Dropdown>
          <Button icon={<UserSwitchOutlined />} onClick={assignSales} disabled={busy} size={compact ? 'small' : undefined}>
            {compact ? 'Gán NV' : 'Gán NV kinh doanh'}
          </Button>
        </>
      )}
      <Button icon={<DownloadOutlined />} onClick={exportExcel} disabled={busy} size={compact ? 'small' : undefined}>
        {compact ? 'Excel' : 'Xuất Excel'}
      </Button>
      <Button type="text" icon={<CloseOutlined />} onClick={onClear} disabled={busy} size={compact ? 'small' : undefined} title="Bỏ chọn">
        {!compact && 'Bỏ chọn'}
      </Button>
    </Flex>
  );
}
