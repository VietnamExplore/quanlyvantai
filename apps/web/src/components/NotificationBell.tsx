import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Badge, Button, Empty, Flex, Popover, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { enableWebPush, isIOS, setBadge, syncWebPush, webPushState, type WebPushState } from '../webpush';

dayjs.extend(relativeTime);

interface Noti {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

/** Biểu tượng theo loại thông báo */
const ICON: Record<string, string> = {
  BOOKING_NEW: '📝',
  BOOKING_CONFIRMED: '✅',
  COLLECTED: '💵',
  ADVANCE_NEW: '🤝',
  TRIP_REJECTED: '⛔',
  PARTNER_TRIP_NEW: '🚌',
  PARTNER_TRIP_MOVED: '↪️',
  PARTNER_TRIP_CHANGED: '🕘',
  PARTNER_TRIP_CANCELLED: '❌',
  PARTNER_ACCEPTED: '🤝',
  PARTNER_REJECTED: '⛔',
  PARTNER_VEHICLE: '🚐',
  PARTNER_DONE: '🏁',
  PARTNER_COST_ADJUSTED: '💲',
  PARTNER_EXTRA: '➕',
  PARTNER_EXTRA_APPROVED: '✅',
  PARTNER_EXTRA_REJECTED: '⛔',
  BACKUP_FAILED: '💾',
};

const POLL_MS = 30_000;

/**
 * Chuông thông báo trên thanh trên cùng: số chưa đọc, danh sách thông báo,
 * tự kiểm tra mỗi 30 giây và hiện nhắc ở góc màn hình khi có thông báo mới.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notification, message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [push, setPush] = useState<WebPushState>(() => webPushState());
  const [pushBusy, setPushBusy] = useState(false);
  const { data: count } = useQuery({
    queryKey: ['/notifications', 'count'],
    queryFn: () => api<{ unread: number; latestId: number }>('/notifications/unread-count'),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });
  const { data: list, isFetching } = useQuery({
    queryKey: ['/notifications', 'list'],
    queryFn: () => api<{ items: Noti[]; unread: number }>('/notifications', { query: { limit: 30 } }),
    enabled: open,
  });

  // Có thông báo mới hơn lần trước: hiện nhắc ở góc phải (lần tải đầu tiên không nhắc)
  const lastSeen = useRef<number | null>(null);
  useEffect(() => {
    if (!count) return;
    const prev = lastSeen.current;
    lastSeen.current = count.latestId;
    if (prev === null || count.latestId <= prev) return;
    api<{ items: Noti[] }>('/notifications', { query: { limit: 5 } })
      .then(({ items }) => {
        for (const n of items.filter((x) => x.id > prev && !x.readAt).reverse()) {
          notification.info({
            key: `noti-${n.id}`,
            title: `${ICON[n.type] ?? "🔔"} ${n.title}`,
            description: n.body,
            placement: 'topRight',
            duration: 8,
            onClick: () => openItem(n),
            style: { cursor: n.link ? 'pointer' : undefined },
          });
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count?.latestId]);

  // Thông báo đẩy: máy đã cho phép thì gắn đăng ký với tài khoản đang đăng nhập; bấm thông báo → mở trang liên quan
  useEffect(() => {
    if (webPushState() === 'on') syncWebPush().catch(() => undefined);
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'open-link') return;
      refresh();
      if (e.data.link) navigate(e.data.link);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Số đỏ trên biểu tượng app (đã cài lên màn hình chính) = số chưa đọc
  useEffect(() => {
    if (count) setBadge(count.unread);
  }, [count?.unread]);

  async function turnOnPush() {
    setPushBusy(true);
    try {
      const s = await enableWebPush();
      setPush(s);
      if (s === 'on') message.success('Đã bật thông báo trên máy này – vừa gửi 1 thông báo thử');
      else if (s === 'denied') message.warning('Thông báo đang bị chặn: mở cài đặt trình duyệt / điện thoại để cho phép');
    } catch (e) {
      message.error(`Không bật được thông báo: ${(e as Error).message}`);
    } finally {
      setPushBusy(false);
    }
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['/notifications'] });

  async function openItem(n: Noti) {
    if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
    notification.destroy(`noti-${n.id}`);
    setOpen(false);
    refresh();
    if (n.link) navigate(n.link);
  }

  async function readAll() {
    await api('/notifications/read-all', { method: 'POST' }).catch(() => undefined);
    refresh();
  }

  const items = list?.items ?? [];
  const content = (
    <div style={{ width: 'min(380px, calc(100vw - 32px))' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
        <b>Thông báo</b>
        {(count?.unread ?? 0) > 0 && (
          <Button size="small" type="link" icon={<CheckOutlined />} onClick={readAll}>
            Đánh dấu đã đọc hết
          </Button>
        )}
      </Flex>
      {isFetching && !items.length ? (
        <Flex justify="center" style={{ padding: 24 }}>
          <Spin />
        </Flex>
      ) : !items.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có thông báo" />
      ) : (
        <div style={{ maxHeight: 'min(460px, 70vh)', overflowY: 'auto', margin: '0 -12px' }}>
          {items.map((n) => (
            <div key={n.id} className={`noti-item${n.readAt ? '' : ' noti-unread'}`} onClick={() => openItem(n)}>
              <span className="noti-icon">{ICON[n.type] ?? '🔔'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="noti-title">{n.title}</div>
                <div className="noti-body">{n.body}</div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {dayjs(n.createdAt).locale('vi').fromNow()}
                </Typography.Text>
              </div>
              {!n.readAt && <span className="noti-dot" />}
            </div>
          ))}
        </div>
      )}
      {/* Thông báo đẩy trên máy này (nhận cả khi đã đóng phần mềm) */}
      <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 8, paddingTop: 8 }}>
        {push === 'ask' && (
          <Button block type="primary" ghost icon={<BellOutlined />} loading={pushBusy} onClick={turnOnPush}>
            Bật thông báo đẩy trên máy này
          </Button>
        )}
        {push === 'install' && (
          <Alert
            type="info"
            showIcon
            title={isIOS() ? 'iPhone / iPad: nhận thông báo như app' : 'Cài phần mềm lên màn hình chính'}
            description="Mở bằng Safari → bấm Chia sẻ (ô vuông có mũi tên) → Thêm vào MH chính. Mở phần mềm từ biểu tượng mới, vào chuông 🔔 và bấm Bật thông báo."
          />
        )}
        {push === 'denied' && <Typography.Text type="warning">Thông báo đang bị chặn trên máy này – mở cài đặt trình duyệt / điện thoại để cho phép.</Typography.Text>}
        {push === 'on' && (
          <Flex justify="space-between" align="center">
            <Typography.Text type="success">✓ Máy này đang nhận thông báo đẩy</Typography.Text>
            <Button size="small" type="link" onClick={() => api('/notifications/webpush/test', { method: 'POST' }).then(() => message.success('Đã gửi thông báo thử'))}>
              Gửi thử
            </Button>
          </Flex>
        )}
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger="click" placement="bottomRight" open={open} onOpenChange={(o) => (setOpen(o), o && refresh())} arrow={false}>
      <Badge count={count?.unread ?? 0} size="small" offset={[-4, 4]}>
        <Button type="text" shape="circle" icon={<BellOutlined style={{ fontSize: 18 }} />} aria-label="Thông báo" />
      </Badge>
    </Popover>
  );
}
