import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { ActivityIndicator, AppState, BackHandler, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, getServer, loadSession, setToken, setUnauthorizedHandler } from './src/api';
import { clearKnown, onNotificationOpen, setupNotifications, takeNew, type AppNotification } from './src/notify';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { EarningsScreen } from './src/screens/EarningsScreen';
import { FuelScreen } from './src/screens/FuelScreen';
import { VehicleScreen } from './src/screens/VehicleScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TripDetailScreen } from './src/screens/TripDetailScreen';
import { TripsScreen } from './src/screens/TripsScreen';
import { RunScreen } from './src/screens/RunScreen';
import { Icon } from './src/icons';
import { useLayout } from './src/layout';
import { disableWebPush, onWebPushOpen, registerWorker, setAppBadge, syncWebPush } from './src/webpush';
import { WebPushBanner } from './src/WebPushBanner';
import { BRAND, colors } from './src/theme';

const LOGO = require('./assets/logo.png');

/** "Lê Hùng Vũ" → "LV" */
const initials = (name: string) => {
  const p = name.trim().split(/\s+/);
  return ((p.length > 1 ? p[0][0] : '') + p[p.length - 1][0]).toUpperCase();
};
import type { AuthUser } from './src/types';

type Tab = 'trips' | 'vehicle' | 'fuel' | 'earnings';
type Screen = { name: Tab } | { name: 'trip'; id: number; from: Tab; runId?: number } | { name: 'run'; id: number } | { name: 'profile' } | { name: 'notifications' };

/** Mã phiên bản app đang cài (Android versionCode) – so với bản mới nhất văn phòng phát hành */
const CURRENT_CODE = Number(Constants.expoConfig?.android?.versionCode ?? 0);

/** Kiểm tra thông báo mới mỗi 30 giây khi app đang mở */
const POLL_MS = 30_000;

/** Thanh điều hướng (dưới cùng trên điện thoại, bên trái trên máy tính bảng ngang) */
const TABS: { key: Tab; icon: string; iconOn: string; label: string; title: string }[] = [
  { key: 'trips', icon: 'car-outline', iconOn: 'car', label: 'Chuyến', title: 'Chuyến của tôi' },
  { key: 'vehicle', icon: 'shield-checkmark-outline', iconOn: 'shield-checkmark', label: 'Kiểm tra xe', title: 'Kiểm tra xe' },
  { key: 'fuel', icon: 'mci:gas-station-outline', iconOn: 'mci:gas-station', label: 'Xăng dầu', title: 'Xăng dầu' },
  { key: 'earnings', icon: 'wallet-outline', iconOn: 'wallet', label: 'Thu nhập', title: 'Thu nhập của tôi' },
];
const isTab = (n: Screen['name']): n is Tab => n === 'trips' || n === 'vehicle' || n === 'fuel' || n === 'earnings';

export default function App() {
  const L = useLayout();
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'trips' });
  const [unread, setUnread] = useState(0);
  // Băng nhắc trượt xuống khi có thông báo mới (tự ẩn sau vài giây)
  const [toast, setToast] = useState<{ n: AppNotification; more: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Có bản app mới trên máy chủ (Android): nhắc lái xe cập nhật
  const [update, setUpdate] = useState<{ version: string } | null>(null);

  const pollNotifications = useCallback(async () => {
    try {
      const { items, unread: count } = await api<{ items: AppNotification[]; unread: number }>('/notifications?limit=20');
      setUnread(count);
      setAppBadge(count);
      const fresh = await takeNew(items);
      if (fresh.length) {
        setToast({ n: fresh[fresh.length - 1], more: fresh.length - 1 });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 6000);
      }
    } catch {
      /* mất mạng: thử lại lần sau */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    pollNotifications();
    const timer = setInterval(() => AppState.currentState === 'active' && pollNotifications(), POLL_MS);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && pollNotifications());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [user, pollNotifications]);

  function openToast() {
    if (!toast) return;
    const { n } = toast;
    setToast(null);
    api(`/notifications/${n.id}/read`, { method: 'POST' }).then(pollNotifications).catch(() => undefined);
    if (n.tripId && n.type !== 'TRIP_MOVED' && n.type !== 'TRIP_CANCELLED') setScreen({ name: 'trip', id: n.tripId, from: 'trips' });
    else setScreen({ name: 'notifications' });
  }

  // Kiểm tra bản app mới khi mở app / quay lại app
  useEffect(() => {
    if (!user || Platform.OS !== 'android') return;
    const check = () =>
      api<{ available: boolean; version?: string; versionCode?: number }>('/app/driver')
        .then((r) => setUpdate(r.available && r.versionCode && r.versionCode > CURRENT_CODE ? { version: r.version! } : null))
        .catch(() => undefined);
    check();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && check());
    return () => sub.remove();
  }, [user]);

  // Khôi phục phiên đăng nhập đã lưu
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    (async () => {
      const { serverUrl, token } = await loadSession();
      if (serverUrl && token) {
        // Hết phiên (401) thì về màn đăng nhập; máy chủ đang khởi động lại / mất mạng thì thử lại tối đa ~30 giây
        for (let attempt = 0; attempt < 15; attempt++) {
          try {
            setUser(await api<AuthUser>('/auth/me'));
            break;
          } catch (e) {
            if (e instanceof ApiError && e.status === 401) break;
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      }
      setBooting(false);
    })();
  }, []);

  // Sau khi đăng nhập: bật thông báo; bấm vào thông báo thì mở chuyến
  useEffect(() => {
    if (!user) return;
    setupNotifications().catch(() => undefined);
    const off = onNotificationOpen((tripId) => setScreen({ name: 'trip', id: tripId, from: 'trips' }));
    // Bản web (iPhone): đăng ký nhận thông báo đẩy (đã cho phép), bấm thông báo → mở chuyến
    if (Platform.OS === 'web') {
      registerWorker().then(() => syncWebPush()).catch(() => undefined);
      const trip = Number(new URLSearchParams(window.location.search).get('trip'));
      if (trip) {
        setScreen({ name: 'trip', id: trip, from: 'trips' });
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
    const offWeb = onWebPushOpen((tripId) => setScreen(tripId ? { name: 'trip', id: tripId, from: 'trips' } : { name: 'notifications' }));
    return () => {
      off();
      offWeb();
    };
  }, [user]);

  // Nút Back của Android: quay về danh sách thay vì thoát app (iPhone/iPad dùng nút ‹ trên đầu trang)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name !== 'trips') {
        setScreen(screen.name === 'trip' && screen.runId ? { name: 'run', id: screen.runId } : { name: screen.name === 'trip' ? screen.from : 'trips' });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  async function logout() {
    await disableWebPush();
    await api('/driver/push-token', { method: 'POST', body: { token: null } }).catch(() => undefined);
    await setToken(null);
    await clearKnown();
    setUnread(0);
    setUser(null);
    setScreen({ name: 'trips' });
  }

  if (booting) {
    return (
      <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.center}>
        <View style={s.bootLogo}>
          <Image source={LOGO} style={{ width: 96, height: 96 }} resizeMode="contain" />
        </View>
        <Text style={s.bootName}>{BRAND.appName}</Text>
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 20 }} />
      </LinearGradient>
    );
  }

  const title = screen.name === 'run' ? 'Chuyến xe ghép' : screen.name === 'trip' ? 'Chi tiết chuyến' : screen.name === 'profile' ? 'Tài khoản' : screen.name === 'notifications' ? 'Thông báo' : 'Chuyến xe';
  const tab = isTab(screen.name) ? screen.name : null;
  const back = () => setScreen(screen.name === 'trip' && screen.runId ? { name: 'run', id: screen.runId } : { name: screen.name === 'trip' ? screen.from : 'trips' });
  const openTrip = (id: number, from: Tab) => setScreen({ name: 'trip', id, from });

  const go = (k: Tab) => setScreen({ name: k });
  const tabBar = (vertical: boolean) => (
    <View style={vertical ? s.rail : s.tabBar}>
      {vertical && (
        <View style={s.railLogo}>
          <Image source={LOGO} style={{ width: 34, height: 34 }} resizeMode="contain" />
        </View>
      )}
      {TABS.map((t) => {
        const on = tab === t.key;
        return (
          <Pressable key={t.key} onPress={() => go(t.key)} style={({ pressed }) => [vertical ? s.railItem : s.tabItem, pressed && { opacity: 0.75 }]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <View style={[s.tabIcon, on && s.tabIconActive]}>
              <Icon name={on ? t.iconOn : t.icon} size={L.compact ? 21 : 23} color={on ? colors.primary : colors.muted} />
            </View>
            <Text style={[s.tabLabel, on && s.tabLabelActive, L.compact && { fontSize: 11 }]} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!user ? (
        <LoginScreen onLoggedIn={setUser} />
      ) : (
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
          {/* Máy tính bảng ngang: thanh điều hướng bên trái, luôn hiện */}
          {L.rail && <SafeAreaView edges={['top', 'bottom', 'left']} style={{ backgroundColor: '#fff' }}>{tabBar(true)}</SafeAreaView>}
          <View style={{ flex: 1 }}>
            <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <SafeAreaView edges={L.rail ? ['top', 'right'] : ['top', 'left', 'right']}>
                <View style={[s.header, { maxWidth: L.maxWidth, paddingHorizontal: L.pad }]}>
                  {tab ? (
                    <View style={s.brand}>
                      {!L.rail && !L.compact && (
                        <View style={s.brandLogo}>
                          <Image source={LOGO} style={{ width: 30, height: 30 }} resizeMode="contain" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={s.brandName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                          {BRAND.appName.toUpperCase()}
                        </Text>
                        <Text style={[s.headerTitle, L.compact && { fontSize: 17 }]} numberOfLines={1}>
                          {TABS.find((t) => t.key === tab)!.title}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <>
                      <Pressable onPress={back} hitSlop={12} style={({ pressed }) => [s.roundBtn, pressed && { opacity: 0.7 }]} accessibilityLabel="Quay lại">
                        <Icon name="chevron-back" size={24} color="#fff" />
                      </Pressable>
                      <Text style={[s.headerTitle, { flex: 1 }, L.compact && { fontSize: 17 }]} numberOfLines={1}>
                        {title}
                      </Text>
                    </>
                  )}
                  {tab && (
                    <Pressable onPress={() => setScreen({ name: 'notifications' })} hitSlop={8} style={({ pressed }) => [s.roundBtn, pressed && { opacity: 0.8 }]} accessibilityLabel="Thông báo">
                      <Icon name={unread > 0 ? 'notifications' : 'notifications-outline'} size={22} color="#fff" />
                      {unread > 0 && (
                        <View style={s.bellBadge}>
                          <Text style={s.bellBadgeText}>{unread > 99 ? '99+' : unread}</Text>
                        </View>
                      )}
                    </Pressable>
                  )}
                  {tab && (
                    <Pressable onPress={() => setScreen({ name: 'profile' })} hitSlop={10} style={({ pressed }) => [s.avatar, pressed && { opacity: 0.8 }]} accessibilityLabel="Tài khoản">
                      <Text style={s.avatarText}>{initials(user.fullName)}</Text>
                    </Pressable>
                  )}
                </View>
              </SafeAreaView>
            </LinearGradient>
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={L.rail ? ['bottom', 'right'] : ['bottom', 'left', 'right']}>
              <View style={{ flex: 1, width: '100%', maxWidth: L.maxWidth, alignSelf: 'center' }}>
                {update && tab && (
                  <Pressable onPress={() => Linking.openURL(`${getServer()}/tai-app`)} style={({ pressed }) => [s.update, { marginHorizontal: L.pad }, pressed && { opacity: 0.85 }]}>
                    <View style={s.updateIcon}>
                      <Icon name="cloud-download-outline" size={22} color="#047857" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.updateTitle}>Có bản app mới {update.version}</Text>
                      <Text style={s.updateBody}>Bấm để tải và cài đặt (cài đè, không mất dữ liệu)</Text>
                    </View>
                    <Icon name="chevron-forward" size={20} color="#047857" />
                  </Pressable>
                )}
                {screen.name === 'trips' && Platform.OS === 'web' && <WebPushBanner margin={L.pad} />}
                {screen.name === 'trips' && <TripsScreen onOpen={(id) => openTrip(id, 'trips')} onOpenRun={(id) => setScreen({ name: 'run', id })} />}
                {screen.name === 'run' && <RunScreen key={screen.id} runId={screen.id} onOpenTrip={(id) => setScreen({ name: 'trip', id, from: 'trips', runId: screen.id })} />}
                {screen.name === 'vehicle' && <VehicleScreen />}
                {screen.name === 'fuel' && <FuelScreen />}
                {screen.name === 'earnings' && <EarningsScreen onOpenTrip={(id) => openTrip(id, 'earnings')} />}
                {screen.name === 'trip' && <TripDetailScreen key={screen.id} tripId={screen.id} onBack={back} onOpenRun={(id) => setScreen({ name: 'run', id })} />}
                {screen.name === 'profile' && <ProfileScreen user={user} onLogout={logout} />}
                {screen.name === 'notifications' && <NotificationsScreen onOpenTrip={(id) => setScreen({ name: 'trip', id, from: 'trips' })} onChanged={pollNotifications} />}
                {toast && (
                  <Pressable onPress={openToast} style={({ pressed }) => [s.toast, pressed && { opacity: 0.9 }]}>
                    <View style={s.toastIcon}>
                      <Icon name="notifications" size={18} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.toastTitle} numberOfLines={1}>
                        {toast.n.title}
                      </Text>
                      <Text style={s.toastBody} numberOfLines={2}>
                        {toast.n.body}
                        {toast.more > 0 ? ` · và ${toast.more} thông báo khác` : ''}
                      </Text>
                    </View>
                  </Pressable>
                )}
              </View>
              {tab && !L.rail && tabBar(false)}
            </SafeAreaView>
          </View>
        </View>
      )}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bootLogo: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 10 },
  bootName: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 18, letterSpacing: 0.5 },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10, width: '100%', alignSelf: 'center' },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandLogo: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  brandName: { color: 'rgba(255,255,255,0.82)', fontSize: 10.5, fontWeight: '800', letterSpacing: 1.4 },
  headerTitle: { color: '#fff', fontSize: 19, fontWeight: '800' },
  roundBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  bellBadge: { position: 'absolute', top: -3, right: -3, minWidth: 19, height: 19, borderRadius: 10, backgroundColor: colors.accent, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
  bellBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
  update: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ecfdf5', borderWidth: 1.5, borderColor: '#6ee7b7', borderRadius: 16, padding: 12, marginTop: 10 },
  updateIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center' },
  updateTitle: { fontSize: 15, fontWeight: '800', color: '#047857' },
  updateBody: { fontSize: 12.5, color: colors.text2, marginTop: 2 },
  toast: { position: 'absolute', top: 8, left: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0f1b2d', borderRadius: 18, padding: 12, elevation: 12, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  toastIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  toastTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  toastBody: { color: 'rgba(255,255,255,0.85)', fontSize: 13.5, marginTop: 2 },
  tabBar: { flexDirection: 'row', justifyContent: 'center', backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 6, paddingBottom: 6 },
  tabItem: { flex: 1, maxWidth: 180, alignItems: 'center', gap: 3, paddingVertical: 2 },
  rail: { flex: 1, width: 96, backgroundColor: '#fff', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border, alignItems: 'center', paddingTop: 12, gap: 6 },
  railLogo: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  railItem: { width: 88, alignItems: 'center', gap: 4, paddingVertical: 8 },
  tabIcon: { width: 58, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tabIconActive: { backgroundColor: colors.primarySoft },
  tabLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },
  tabLabelActive: { color: colors.primary, fontWeight: '800' },
});
