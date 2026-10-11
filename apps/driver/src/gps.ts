import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert, Platform } from 'react-native';
import { api, getServer, loadSession } from './api';
import type { Trip } from './types';

/**
 * Giám sát hành trình: app gửi vị trí lên máy chủ khi lái xe đang chạy chuyến
 * (từ "Bắt đầu đi đón" đến "Hoàn thành"); hết chuyến thì tự dừng. Chạy cả khi tắt màn hình
 * (dịch vụ nền có thông báo cố định "Đang chia sẻ vị trí chuyến").
 */
export const GPS_TASK = 'lai-xe-gps';
/** Trạng thái chuyến cần gửi vị trí */
export const TRACK_STATUSES = ['DANG_DEN_DON', 'DA_DON_KHACH'];

type Point = { lat: number; lng: number; speed: number | null; heading: number | null; accuracy: number | null; at: number };

// Điểm chưa gửi được (mất mạng): giữ tối đa 2000 điểm, gửi lại lần sau
let queue: Point[] = [];
let sending = false;

const toPoint = (l: Location.LocationObject): Point => ({
  lat: l.coords.latitude,
  lng: l.coords.longitude,
  // m/s → km/h; thiết bị không đo được thì null
  speed: l.coords.speed != null && l.coords.speed >= 0 ? Math.round(l.coords.speed * 36) / 10 : null,
  heading: l.coords.heading ?? null,
  accuracy: l.coords.accuracy ?? null,
  at: l.timestamp,
});

async function flush() {
  if (sending || !queue.length) return;
  sending = true;
  try {
    // Tác vụ nền có thể chạy khi app đã bị tắt: nạp lại địa chỉ máy chủ + phiên đăng nhập
    if (!getServer()) await loadSession();
    while (queue.length) {
      const batch = queue.slice(0, 500);
      await api('/driver/gps', { method: 'POST', body: { points: batch } });
      queue = queue.slice(batch.length);
    }
  } catch {
    /* mất mạng / máy chủ lỗi: giữ lại, gửi lần sau */
  } finally {
    sending = false;
  }
}

function enqueue(locations: Location.LocationObject[]) {
  queue.push(...locations.map(toPoint));
  if (queue.length > 2000) queue = queue.slice(-2000);
  return flush();
}

// Tác vụ nền phải khai báo ở cấp module (nạp từ index.ts trước khi chạy app)
if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(GPS_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    await enqueue(data.locations);
  });
}

// Dự phòng khi lái xe không cho phép vị trí nền: chỉ theo dõi khi app đang mở
let watcher: Location.LocationSubscription | null = null;
let asked = false;

/** Bật gửi vị trí (gọi khi có chuyến đang chạy). Trả về: 'background' | 'foreground' | 'denied' */
export async function startTracking(): Promise<'background' | 'foreground' | 'denied' | 'off'> {
  if (Platform.OS === 'web') return 'off';
  try {
    if (await Location.hasStartedLocationUpdatesAsync(GPS_TASK)) return 'background';
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return 'denied';
    let bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted' && !asked) {
      asked = true;
      // Android 11+: mở trang cài đặt, cần giải thích trước
      await new Promise<void>((resolve) =>
        Alert.alert(
          'Cho phép vị trí khi chạy chuyến',
          'Văn phòng cần theo dõi vị trí xe trong lúc chạy chuyến (cả khi tắt màn hình). Ở màn hình tiếp theo, chọn “Luôn cho phép” (Allow all the time).',
          [{ text: 'Đồng ý', onPress: () => resolve() }],
        ),
      );
      bg = await Location.requestBackgroundPermissionsAsync();
    }
    if (bg.status === 'granted') {
      await Location.startLocationUpdatesAsync(GPS_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 15_000,
        distanceInterval: 30,
        deferredUpdatesInterval: 30_000,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.AutomotiveNavigation,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Đang chia sẻ vị trí chuyến',
          notificationBody: 'Văn phòng theo dõi hành trình trong lúc bạn chạy chuyến. Tự tắt khi hoàn thành.',
          notificationColor: '#0F6BE0',
          killServiceOnDestroy: false,
        },
      });
      watcher?.remove();
      watcher = null;
      return 'background';
    }
    // Không có quyền nền: theo dõi khi app đang mở
    if (!watcher) {
      watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 15_000, distanceInterval: 30 }, (l) => void enqueue([l]));
    }
    return 'foreground';
  } catch {
    return 'off';
  }
}

export async function stopTracking() {
  if (Platform.OS === 'web') return;
  watcher?.remove();
  watcher = null;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(GPS_TASK)) await Location.stopLocationUpdatesAsync(GPS_TASK);
  } catch {
    /* bỏ qua */
  }
  await flush();
}

/** Đồng bộ theo danh sách chuyến: còn chuyến đang chạy thì bật, hết thì tắt */
export async function syncTracking(trips: Pick<Trip, 'status'>[]) {
  if (trips.some((t) => TRACK_STATUSES.includes(t.status))) return startTracking();
  await stopTracking();
  return 'off' as const;
}
