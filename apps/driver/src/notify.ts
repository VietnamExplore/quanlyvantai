import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { storage } from './storage';
import { Platform } from 'react-native';
import { api } from './api';
import { fmtTime } from './theme';
import type { Trip } from './types';

const KNOWN_KEY = 'known_trip_ids';

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
    }
  } catch {
    /* chưa có FCM: dùng cơ chế tự kiểm tra */
  }
}

/**
 * So sánh danh sách chuyến mới tải với lần trước:
 * báo chuyến mới được giao và chuyến bị chuyển đi.
 */
export async function notifyChanges(trips: Trip[]) {
  const raw = await storage.get(KNOWN_KEY);
  const known: number[] | null = raw ? JSON.parse(raw) : null;
  const ids = trips.map((t) => t.id);
  await storage.set(KNOWN_KEY, JSON.stringify(ids));
  if (!known) return; // lần đầu đăng nhập: không báo các chuyến đã có sẵn

  const added = trips.filter((t) => !known.includes(t.id));
  if (!Notifications) return;
  for (const t of added) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Bạn có chuyến mới', body: `${fmtTime(t.pickupTime)} · ${t.pickupAddress}`, data: { tripId: t.id }, sound: 'default' },
        trigger: Platform.OS === 'android' ? { channelId: 'trips' } : null,
      });
    } catch {
      /* thiết bị không hỗ trợ / chưa cho phép thông báo */
    }
  }
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

export async function clearKnownTrips() {
  await storage.remove(KNOWN_KEY);
}
