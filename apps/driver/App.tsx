import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { api, loadSession, setToken, setUnauthorizedHandler } from './src/api';
import { clearKnownTrips, onNotificationOpen, setupNotifications } from './src/notify';
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

type Screen = { name: 'trips' } | { name: 'trip'; id: number } | { name: 'profile' };

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
    return onNotificationOpen((tripId) => setScreen({ name: 'trip', id: tripId }));
  }, [user]);

  // Nút Back của Android: quay về danh sách thay vì thoát app
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name !== 'trips') {
        setScreen({ name: 'trips' });
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
                {screen.name === 'trips' ? (
                  <View style={s.brand}>
                    <View style={s.brandLogo}>
                      <Image source={LOGO} style={{ width: 32, height: 32 }} resizeMode="contain" />
                    </View>
                    <View>
                      <Text style={s.brandName}>{BRAND.company}</Text>
                      <Text style={s.headerTitle}>Chuyến của tôi</Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <Pressable onPress={() => setScreen({ name: 'trips' })} hitSlop={12} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
                      <Text style={s.backIcon}>‹</Text>
                    </Pressable>
                    <Text style={[s.headerTitle, { flex: 1 }]}>{title}</Text>
                  </>
                )}
                {screen.name === 'trips' && (
                  <Pressable onPress={() => setScreen({ name: 'profile' })} hitSlop={10} style={({ pressed }) => [s.avatar, pressed && { opacity: 0.8 }]}>
                    <Text style={s.avatarText}>{initials(user.fullName)}</Text>
                  </Pressable>
                )}
              </View>
            </SafeAreaView>
          </LinearGradient>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
            {screen.name === 'trips' && <TripsScreen onOpen={(id) => setScreen({ name: 'trip', id })} />}
            {screen.name === 'trip' && <TripDetailScreen key={screen.id} tripId={screen.id} onBack={() => setScreen({ name: 'trips' })} />}
            {screen.name === 'profile' && <ProfileScreen user={user} onLogout={logout} />}
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
});
