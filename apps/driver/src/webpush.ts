import { Platform } from 'react-native';
import { api } from './api';

/**
 * Thông báo đẩy cho app lái xe bản web (iPhone / iPad: Safari → Chia sẻ → "Thêm vào Màn hình chính", iOS 16.4+).
 * Chỉ dùng trên web; bản Android / iOS cài đặt dùng expo-notifications.
 */
const web = Platform.OS === 'web' && typeof window !== 'undefined';

/** Đang mở dạng app đã thêm vào Màn hình chính (không phải tab trình duyệt) */
export const isStandalone = () =>
  web && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** iPhone / iPad (iPadOS báo là Mac có màn hình cảm ứng) */
export const isIOS = () => web && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Trình duyệt hỗ trợ thông báo đẩy (iPhone: chỉ khi đã thêm vào Màn hình chính) */
export const pushSupported = () => web && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export type WebPushState = 'unsupported' | 'install' | 'ask' | 'on' | 'denied';

/** Tình trạng: cần thêm vào Màn hình chính / chưa bật / đã bật / bị chặn */
export function webPushState(): WebPushState {
  if (!web) return 'unsupported';
  if (isIOS() && !isStandalone()) return 'install';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' ? 'on' : 'ask';
}

/** Đăng ký service worker (file sw.js cạnh index.html) */
export async function registerWorker() {
  if (!web || !('serviceWorker' in navigator)) return null;
  try {
    const base = document.baseURI.replace(/[^/]*$/, '');
    return await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
  } catch {
    return null;
  }
}

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/**
 * Bật thông báo: phải gọi ngay khi người dùng bấm nút (iPhone chỉ cho xin quyền theo thao tác bấm).
 * Xin quyền → đăng ký nhận đẩy với khóa của máy chủ → lưu lên máy chủ → gửi thử 1 thông báo.
 */
export async function enableWebPush(): Promise<WebPushState> {
  if (!pushSupported()) return webPushState();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return webPushState();
  await syncWebPush(true);
  return 'on';
}

/** Đã cho phép thông báo: đảm bảo máy chủ có đăng ký của máy này (mở app / đăng nhập lại) */
export async function syncWebPush(test = false) {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const reg = (await registerWorker()) ?? (await navigator.serviceWorker.ready);
  const { publicKey } = await api<{ publicKey: string }>('/driver/webpush/key');
  let sub = await reg.pushManager.getSubscription();
  // Khóa máy chủ đổi: đăng ký lại
  const current = sub?.options.applicationServerKey;
  if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== publicKey.replace(/=+$/, '')) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  await api('/driver/webpush/subscribe', { method: 'POST', body: sub.toJSON() });
  if (test) await api('/driver/webpush/test', { method: 'POST' }).catch(() => undefined);
}

/** Đăng xuất: máy này không nhận thông báo của tài khoản cũ nữa */
export async function disableWebPush() {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api('/driver/webpush/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => undefined);
      await sub.unsubscribe();
    }
  } catch {
    /* bỏ qua */
  }
  setAppBadge(0);
}

/** Số đỏ trên biểu tượng app (số thông báo chưa đọc); 0 = xóa */
export function setAppBadge(n: number) {
  if (!web) return;
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (n > 0) nav.setAppBadge?.(n)?.catch(() => undefined);
    else nav.clearAppBadge?.()?.catch(() => undefined);
  } catch {
    /* trình duyệt không hỗ trợ */
  }
}

/** Bấm vào thông báo khi app đang mở: service worker gửi mã chuyến để mở chi tiết */
export function onWebPushOpen(fn: (tripId: number | null) => void) {
  if (!web || !('serviceWorker' in navigator)) return () => undefined;
  const h = (e: MessageEvent) => {
    if (e.data?.type === 'open-notification') fn(typeof e.data.tripId === 'number' ? e.data.tripId : null);
  };
  navigator.serviceWorker.addEventListener('message', h);
  return () => navigator.serviceWorker.removeEventListener('message', h);
}
