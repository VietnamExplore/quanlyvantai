import { api } from './api';

/**
 * Thông báo đẩy cho web văn phòng / cổng nhà xe: máy tính (Chrome, Edge…), Android,
 * iPhone / iPad (Safari → Chia sẻ → "Thêm vào MH chính", iOS 16.4+). Nhận cả khi đã đóng phần mềm.
 */

/** Đang mở dạng app đã thêm vào Màn hình chính (không phải tab trình duyệt) */
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhone / iPad (iPadOS báo là Mac có màn hình cảm ứng) */
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export type WebPushState = 'unsupported' | 'install' | 'ask' | 'on' | 'denied';

/** Tình trạng: cần thêm vào Màn hình chính (iPhone) / chưa bật / đã bật / bị chặn */
export function webPushState(): WebPushState {
  if (isIOS() && !isStandalone()) return 'install';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' ? 'on' : 'ask';
}

const registerWorker = () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const bytesToB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Bật thông báo: gọi ngay khi bấm nút (iPhone chỉ cho xin quyền theo thao tác bấm), gửi thử 1 thông báo */
export async function enableWebPush(): Promise<WebPushState> {
  if (!pushSupported()) return webPushState();
  if ((await Notification.requestPermission()) !== 'granted') return webPushState();
  await syncWebPush(true);
  return 'on';
}

/** Đã cho phép thông báo: đảm bảo máy chủ có đăng ký của máy này cho tài khoản đang đăng nhập */
export async function syncWebPush(test = false) {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const reg = (await registerWorker()) ?? (await navigator.serviceWorker.ready);
  const { publicKey } = await api<{ publicKey: string }>('/notifications/webpush/key');
  let sub = await reg.pushManager.getSubscription();
  // Khóa máy chủ đổi: đăng ký lại
  const current = sub?.options.applicationServerKey;
  if (sub && current && bytesToB64(current) !== publicKey.replace(/=+$/, '')) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  await api('/notifications/webpush/subscribe', { method: 'POST', body: sub.toJSON() });
  if (test) await api('/notifications/webpush/test', { method: 'POST' }).catch(() => undefined);
}

/** Đăng xuất: máy này không nhận thông báo của tài khoản này nữa (quyền thông báo vẫn giữ) */
export async function disableWebPush() {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await api('/notifications/webpush/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe();
  } catch {
    // bỏ qua
  }
}

/** Số đỏ trên biểu tượng app = số thông báo chưa đọc */
export function setBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  (count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => undefined);
}
