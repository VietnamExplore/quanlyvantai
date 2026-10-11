import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, loadSession, setToken, setUnauthorizedHandler } from './src/api';
import { clearKnown, onNotificationOpen, setupNotifications, takeNew, type AppNotification } from './src/notify';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { EarningsScreen } from './src/screens/EarningsScreen';
import { FuelScreen } from './src/screens/FuelScreen';
import { VehicleScreen } from './src/screens/VehicleScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TripDetailScreen } from './src/screens/TripDetailScreen';
import { TripsScreen } from './src/screens/TripsScreen';
import { contentFrame, CONTENT_MAX_WIDTH } from './src/platform';
import { BRAND, colors } from './src/theme';

const LOGO = require('./assets/logo.png');

/** "Lê Hùng Vũ" → "LV" */
const initials = (name: string) => {
  const p = name.trim().split(/\s+/);
  return ((p.length > 1 ? p[0][0] : '') + p[p.length - 1][0]).toUpperCase();
};
import type { AuthUser } from './src/types';

type Tab = 'trips' | 'vehicle' | 'fuel' | 'earnings';
type Screen = { name: Tab } | { name: 'trip'; id: number; from: Tab } | { name: 'profile' } | { name: 'notifications' };

/** Kiểm tra thông báo mới mỗi 30 giây khi app đang mở */
const POLL_MS = 30_000;

/** Thanh tab dưới cùng */
const TABS: { key: Tab; icon: string; label: string; title: string }[] = [
  { key: 'trips', icon: '🚐', label: 'Chuyến', title: 'Chuyến của tôi' },
  { key: 'vehicle', icon: '🛡️', label: 'Kiểm tra', title: 'Kiểm tra trước chuyến' },
  { key: 'fuel', icon: '⛽', label: 'Xăng dầu', title: 'Xăng dầu' },
  { key: 'earnings', icon: '💰', label: 'Thu nhập', title: 'Thu nhập của tôi' },
];
const isTab = (n: Screen['name']): n is Tab => n === 'trips' || n === 'vehicle' || n === 'fuel' || n === 'earnings';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'trips' });
  const [unread, setUnread] = useState(0);
  // Băng nhắc trượt xuống khi có thông báo mới (tự ẩn sau vài giây)
  const [toast, setToast] = useState<{ n: AppNotification; more: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pollNotifications = useCallback(async () => {
    try {
      const { items, unread: count } = await api<{ items: AppNotification[]; unread: number }>('/notifications?limit=20');
      setUnread(count);
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
    return onNotificationOpen((tripId) => setScreen({ name: 'trip', id: tripId, from: 'trips' }));
  }, [user]);

  // Nút Back của Android: quay về danh sách thay vì thoát app (iPhone/iPad dùng nút ‹ trên đầu trang)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name !== 'trips') {
        setScreen({ name: screen.name === 'trip' ? screen.from : 'trips' });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  async function logout() {
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
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 24 }} />
      </LinearGradient>
    );
  }

  const title = screen.name === 'trip' ? 'Chi tiết chuyến' : screen.name === 'profile' ? 'Tài khoản' : screen.name === 'notifications' ? 'Thông báo' : 'Chuyến xe';
  const tab = isTab(screen.name) ? screen.name : null;
  const back = () => setScreen({ name: screen.name === 'trip' ? screen.from : 'trips' });
  const openTrip = (id: number, from: Tab) => setScreen({ name: 'trip', id, from });

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!user ? (
        <LoginScreen onLoggedIn={setUser} />
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <SafeAreaView edges={['top']}>
              <View style={s.header}>
                {tab ? (
                  <View style={s.brand}>
                    <View style={s.brandLogo}>
                      <Image source={LOGO} style={{ width: 32, height: 32 }} resizeMode="contain" />
                    </View>
                    <View>
                      <Text style={s.brandName}>{BRAND.company}</Text>
                      <Text style={s.headerTitle}>{TABS.find((t) => t.key === tab)!.title}</Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <Pressable onPress={back} hitSlop={12} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
                      <Text style={s.backIcon}>‹</Text>
                    </Pressable>
                    <Text style={[s.headerTitle, { flex: 1 }]}>{title}</Text>
                  </>
                )}
                {tab && (
                  <Pressable onPress={() => setScreen({ name: 'notifications' })} hitSlop={8} style={({ pressed }) => [s.bell, pressed && { opacity: 0.8 }]}>
                    <Text style={{ fontSize: 20 }}>🔔</Text>
                    {unread > 0 && (
                      <View style={s.bellBadge}>
                        <Text style={s.bellBadgeText}>{unread > 99 ? '99+' : unread}</Text>
                      </View>
                    )}
                  </Pressable>
                )}
                {tab && (
                  <Pressable onPress={() => setScreen({ name: 'profile' })} hitSlop={10} style={({ pressed }) => [s.avatar, pressed && { opacity: 0.8 }]}>
                    <Text style={s.avatarText}>{initials(user.fullName)}</Text>
                  </Pressable>
                )}
              </View>
            </SafeAreaView>
          </LinearGradient>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
            <View style={contentFrame}>
              {screen.name === 'trips' && <TripsScreen onOpen={(id) => openTrip(id, 'trips')} />}
              {screen.name === 'vehicle' && <VehicleScreen />}
              {screen.name === 'fuel' && <FuelScreen />}
              {screen.name === 'earnings' && <EarningsScreen onOpenTrip={(id) => openTrip(id, 'earnings')} />}
              {screen.name === 'trip' && <TripDetailScreen key={screen.id} tripId={screen.id} onBack={back} />}
              {screen.name === 'profile' && <ProfileScreen user={user} onLogout={logout} />}
              {screen.name === 'notifications' && (
                <NotificationsScreen onOpenTrip={(id) => setScreen({ name: 'trip', id, from: 'trips' })} onChanged={pollNotifications} />
              )}
              {toast && (
                <Pressable onPress={openToast} style={({ pressed }) => [s.toast, pressed && { opacity: 0.9 }]}>
                  <Text style={s.toastTitle} numberOfLines={1}>
                    🔔 {toast.n.title}
                  </Text>
                  <Text style={s.toastBody} numberOfLines={2}>
                    {toast.n.body}
                    {toast.more > 0 ? ` · và ${toast.more} thông báo khác` : ''}
                  </Text>
                </Pressable>
              )}
            </View>
            {tab && (
              <View style={s.tabBar}>
                {TABS.map((t) => (
                  <Pressable key={t.key} onPress={() => setScreen({ name: t.key })} style={s.tabItem}>
                    <View style={[s.tabIcon, tab === t.key && s.tabIconActive]}>
                      <Text style={{ fontSize: 20 }}>{t.icon}</Text>
                    </View>
                    <Text style={[s.tabLabel, tab === t.key && s.tabLabelActive]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </SafeAreaView>
        </View>
      )}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bootLogo: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 10 },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 10, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandLogo: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  brandName: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  headerTitle: { color: '#fff', fontSize: 19, fontWeight: '800' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: '#fff', fontSize: 30, fontWeight: '600', marginTop: -4, marginLeft: -2 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  bell: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
  bellBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
  toast: { position: 'absolute', top: 8, left: 10, right: 10, backgroundColor: '#0f1b2d', borderRadius: 16, padding: 14, elevation: 12, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  toastTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  toastBody: { color: 'rgba(255,255,255,0.85)', fontSize: 13.5, marginTop: 2 },
  tabBar: { flexDirection: 'row', justifyContent: 'center', backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 6, paddingBottom: 4 },
  tabItem: { flex: 1, maxWidth: 200, alignItems: 'center', gap: 2 },
  tabIcon: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tabIconActive: { backgroundColor: colors.primarySoft },
  tabLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },
  tabLabelActive: { color: colors.primary, fontWeight: '800' },
});
