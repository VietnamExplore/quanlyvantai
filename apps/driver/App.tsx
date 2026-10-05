import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { api, loadSession, setToken, setUnauthorizedHandler } from './src/api';
import { clearKnownTrips, onNotificationOpen, setupNotifications } from './src/notify';
import { EarningsScreen } from './src/screens/EarningsScreen';
import { FuelScreen } from './src/screens/FuelScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TripDetailScreen } from './src/screens/TripDetailScreen';
import { TripsScreen } from './src/screens/TripsScreen';
import { BRAND, colors } from './src/theme';

const LOGO = require('./assets/logo.png');

/** "Lê Hùng Vũ" → "LV" */
const initials = (name: string) => {
  const p = name.trim().split(/\s+/);
  return ((p.length > 1 ? p[0][0] : '') + p[p.length - 1][0]).toUpperCase();
};
import type { AuthUser } from './src/types';

type Tab = 'trips' | 'fuel' | 'earnings';
type Screen = { name: Tab } | { name: 'trip'; id: number; from: Tab } | { name: 'profile' };

/** Thanh tab dưới cùng */
const TABS: { key: Tab; icon: string; label: string; title: string }[] = [
  { key: 'trips', icon: '🚐', label: 'Chuyến', title: 'Chuyến của tôi' },
  { key: 'fuel', icon: '⛽', label: 'Xăng dầu', title: 'Xăng dầu' },
  { key: 'earnings', icon: '💰', label: 'Thu nhập', title: 'Thu nhập của tôi' },
];
const isTab = (n: Screen['name']): n is Tab => n === 'trips' || n === 'fuel' || n === 'earnings';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'trips' });

  // Khôi phục phiên đăng nhập đã lưu
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    (async () => {
      const { serverUrl, token } = await loadSession();
      if (serverUrl && token) {
        try {
          setUser(await api<AuthUser>('/auth/me'));
        } catch {
          /* hết phiên hoặc mất mạng: về màn đăng nhập */
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

  // Nút Back của Android: quay về danh sách thay vì thoát app
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
    await clearKnownTrips();
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

  const title = screen.name === 'trip' ? 'Chi tiết chuyến' : screen.name === 'profile' ? 'Tài khoản' : 'Chuyến xe';
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
                  <Pressable onPress={() => setScreen({ name: 'profile' })} hitSlop={10} style={({ pressed }) => [s.avatar, pressed && { opacity: 0.8 }]}>
                    <Text style={s.avatarText}>{initials(user.fullName)}</Text>
                  </Pressable>
                )}
              </View>
            </SafeAreaView>
          </LinearGradient>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
            <View style={{ flex: 1 }}>
              {screen.name === 'trips' && <TripsScreen onOpen={(id) => openTrip(id, 'trips')} />}
              {screen.name === 'fuel' && <FuelScreen />}
              {screen.name === 'earnings' && <EarningsScreen onOpenTrip={(id) => openTrip(id, 'earnings')} />}
              {screen.name === 'trip' && <TripDetailScreen key={screen.id} tripId={screen.id} onBack={back} />}
              {screen.name === 'profile' && <ProfileScreen user={user} onLogout={logout} />}
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
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 10 },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandLogo: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  brandName: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  headerTitle: { color: '#fff', fontSize: 19, fontWeight: '800' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: '#fff', fontSize: 30, fontWeight: '600', marginTop: -4, marginLeft: -2 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 6, paddingBottom: 4 },
  tabItem: { flex: 1, alignItems: 'center', gap: 2 },
  tabIcon: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tabIconActive: { backgroundColor: colors.primarySoft },
  tabLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },
  tabLabelActive: { color: colors.primary, fontWeight: '800' },
});
