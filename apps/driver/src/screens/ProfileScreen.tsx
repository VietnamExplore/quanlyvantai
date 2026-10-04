import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, getServer } from '../api';
import { BRAND, colors, fmtDate } from '../theme';
import type { AuthUser, DriverProfile } from '../types';
import { Button, Card, Row, Section, styles as ui } from '../ui';

/** Hạn giấy tờ: hết hạn → đỏ, còn ≤ 30 ngày → cam */
function Expiry({ iso }: { iso: string | null }) {
  if (!iso) return <Text style={{ color: colors.muted, fontSize: 15 }}>Chưa cập nhật</Text>;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  const tone = days < 0 ? { bg: '#fdecec', fg: colors.danger, text: 'Đã hết hạn' } : days <= 30 ? { bg: '#fff3e2', fg: colors.warning, text: `Còn ${days} ngày` } : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{fmtDate(iso)}</Text>
      {tone && (
        <View style={{ backgroundColor: tone.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: tone.fg, fontSize: 12, fontWeight: '800' }}>{tone.text}</Text>
        </View>
      )}
    </View>
  );
}

const initials = (name: string) => {
  const p = name.trim().split(/\s+/);
  return ((p.length > 1 ? p[0][0] : '') + p[p.length - 1][0]).toUpperCase();
};

export function ProfileScreen({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<DriverProfile>('/drivers/me').then(setProfile).catch(() => undefined);
  }, []);

  async function changePassword() {
    if (next.length < 6) return Alert.alert('Mật khẩu mới phải có ít nhất 6 ký tự');
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      setCurrent('');
      setNext('');
      Alert.alert('Đã đổi mật khẩu');
    } catch (e) {
      Alert.alert('Không đổi được mật khẩu', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
      <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={p.hero}>
        <View style={p.avatar}>
          <Text style={p.avatarText}>{initials(user.fullName)}</Text>
        </View>
        <Text style={p.name}>{user.fullName}</Text>
        <Text style={p.username}>@{user.username}</Text>
        {profile?.defaultVehicles.length ? (
          <View style={p.vehicle}>
            <Text style={p.vehicleText}>🚐 {profile.defaultVehicles.map((v) => v.plateNumber).join(', ')}</Text>
          </View>
        ) : null}
      </LinearGradient>

      {profile && (
        <Card>
          <Section icon="🪪" title="Hồ sơ lái xe" />
          <Row label="Số điện thoại">{profile.phone}</Row>
          <Row label="Hạng bằng">{profile.licenseClass ?? '—'}</Row>
          <Row label="Hạn bằng lái">
            <Expiry iso={profile.licenseExpiry} />
          </Row>
          <Row label="Hạn khám SK">
            <Expiry iso={profile.healthCheckExpiry} />
          </Row>
        </Card>
      )}

      <Card>
        <Section icon="🔒" title="Đổi mật khẩu" />
        <TextInput placeholderTextColor={colors.muted} style={ui.input} secureTextEntry placeholder="Mật khẩu hiện tại" value={current} onChangeText={setCurrent} />
        <TextInput placeholderTextColor={colors.muted} style={ui.input} secureTextEntry placeholder="Mật khẩu mới (ít nhất 6 ký tự)" value={next} onChangeText={setNext} />
        <Button title="Đổi mật khẩu" variant="soft" size="sm" onPress={changePassword} loading={busy} />
      </Card>

      <Button
        title="Đăng xuất"
        icon="⎋"
        variant="danger"
        onPress={() =>
          Alert.alert('Đăng xuất?', 'Bạn sẽ không nhận được thông báo chuyến mới cho đến khi đăng nhập lại.', [
            { text: 'Không', style: 'cancel' },
            { text: 'Đăng xuất', style: 'destructive', onPress: onLogout },
          ])
        }
      />
      <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 16 }}>
        {BRAND.company} · Máy chủ: {getServer()} · Phiên bản {Constants.expoConfig?.version}
      </Text>
    </ScrollView>
  );
}

const p = StyleSheet.create({
  hero: { borderRadius: 22, padding: 20, alignItems: 'center', marginBottom: 12 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  name: { color: '#fff', fontSize: 21, fontWeight: '800', marginTop: 10 },
  username: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 2 },
  vehicle: { marginTop: 10, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5 },
  vehicleText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
