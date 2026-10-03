import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { api, loadSession, setToken, setUnauthorizedHandler } from './src/api';
import { clearKnownTrips, setupNotifications } from './src/notify';
import { LoginScreen } from './src/screens/LoginScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TripDetailScreen } from './src/screens/TripDetailScreen';
import { TripsScreen } from './src/screens/TripsScreen';
import { colors } from './src/theme';
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
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const tripId = Number(res.notification.request.content.data?.tripId);
      if (tripId) setScreen({ name: 'trip', id: tripId });
    });
    return () => sub.remove();
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
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const title = screen.name === 'trip' ? 'Chi tiết chuyến' : screen.name === 'profile' ? 'Tài khoản' : 'Chuyến xe';

  return (
    <SafeAreaProvider>
      <StatusBar style={user ? 'light' : 'dark'} />
      {!user ? (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <LoginScreen onLoggedIn={setUser} />
        </SafeAreaView>
      ) : (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.primary }} edges={['top']}>
          <View style={s.header}>
            {screen.name !== 'trips' ? (
              <Pressable onPress={() => setScreen({ name: 'trips' })} hitSlop={12} style={s.headerBtn}>
                <Text style={s.headerBtnText}>‹ Quay lại</Text>
              </Pressable>
            ) : (
              <View style={s.headerBtn} />
            )}
            <Text style={s.headerTitle}>{title}</Text>
            {screen.name === 'trips' ? (
              <Pressable onPress={() => setScreen({ name: 'profile' })} hitSlop={12} style={[s.headerBtn, { alignItems: 'flex-end' }]}>
                <Text style={s.headerBtnText}>👤</Text>
              </Pressable>
            ) : (
              <View style={s.headerBtn} />
            )}
          </View>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
            {screen.name === 'trips' && <TripsScreen onOpen={(id) => setScreen({ name: 'trip', id })} />}
            {screen.name === 'trip' && <TripDetailScreen key={screen.id} tripId={screen.id} onBack={() => setScreen({ name: 'trips' })} />}
            {screen.name === 'profile' && <ProfileScreen user={user} onLogout={logout} />}
          </SafeAreaView>
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  header: { height: 54, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: '700' },
  headerBtn: { width: 96 },
  headerBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
