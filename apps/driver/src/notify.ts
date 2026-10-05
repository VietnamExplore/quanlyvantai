import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { storage } from './storage';
import { Platform } from 'react-native';
import { api } from './api';

const KNOWN_KEY = 'last_notification_id';

/**
 * Expo Go (dùng để test trên máy ảo) không còn hỗ trợ expo-notifications trên Android:
 * chỉ nạp thư viện khi chạy bản APK thật. Trong Expo Go app vẫn chạy, chỉ không hiện thông báo.
 */
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const Notifications: typeof NotificationsModule | null = inExpoGo ? null : require('expo-notifications');

// Hiện thông báo cả khi app đang mở
Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function setupNotifications() {
  if (!Notifications) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('trips', {
      name: 'Chuyến xe',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 200, 300],
      sound: 'default',
    });
  }
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') await Notifications.requestPermissionsAsync();

  // Thông báo đẩy từ máy chủ: chỉ hoạt động khi app được cấu hình Firebase (FCM).
  // Chưa cấu hình thì bỏ qua, app vẫn tự kiểm tra chuyến mới khi đang mở.
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (projectId) {
      const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
      await api('/driver/push-token', { method: 'POST', body: { token: data } });
      pushRegistered = true;
    }
  } catch {
    /* chưa có FCM: dùng cơ chế tự kiểm tra */
  }
}

/** Thông báo trong app (chuông) lấy từ máy chủ */
export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  tripId: number | null;
  createdAt: string;
  readAt: string | null;
}

/** Đã đăng ký nhận thông báo đẩy từ máy chủ: khi đó không tự hiện thông báo trên máy nữa (tránh báo 2 lần) */
let pushRegistered = false;

/**
 * Có thông báo mới (mã lớn hơn lần trước): trả về danh sách mới để hiện băng nhắc trong app,
 * và hiện thông báo trên điện thoại khi chưa có thông báo đẩy từ máy chủ.
 * Lần đầu đăng nhập: chỉ ghi nhớ, không báo các thông báo cũ.
 */
export async function takeNew(items: AppNotification[]): Promise<AppNotification[]> {
  const raw = await storage.get(KNOWN_KEY);
  const last = raw ? Number(raw) : null;
  const max = items.reduce((m, n) => Math.max(m, n.id), last ?? 0);
  await storage.set(KNOWN_KEY, String(max));
  if (last === null) return [];
  const fresh = items.filter((n) => n.id > last && !n.readAt).reverse();
  if (Notifications && !pushRegistered) {
    for (const n of fresh) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: { title: n.title, body: n.body, data: n.tripId ? { tripId: n.tripId } : {}, sound: 'default' },
          trigger: Platform.OS === 'android' ? { channelId: 'trips' } : null,
        });
      } catch {
        /* thiết bị không hỗ trợ / chưa cho phép thông báo */
      }
    }
  }
  return fresh;
}

/** Bấm vào thông báo: gọi lại với mã chuyến. Trả về hàm hủy đăng ký. */
export function onNotificationOpen(cb: (tripId: number) => void) {
  if (!Notifications) return () => undefined;
  const sub = Notifications.addNotificationResponseReceivedListener((res) => {
    const tripId = Number(res.notification.request.content.data?.tripId);
    if (tripId) cb(tripId);
  });
  return () => sub.remove();
}

export async function clearKnown() {
  await storage.remove(KNOWN_KEY);
  await storage.remove('known_trip_ids');
  pushRegistered = false;
}
