import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput } from 'react-native';
import { api, getServer } from '../api';
import { colors, fmtDate } from '../theme';
import type { AuthUser, DriverProfile } from '../types';
import { Button, Card, Row, styles as ui } from '../ui';

function expiryText(iso: string | null) {
  if (!iso) return 'Chưa cập nhật';
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return `${fmtDate(iso)}${days < 0 ? ' (ĐÃ HẾT HẠN)' : days <= 30 ? ` (còn ${days} ngày)` : ''}`;
}

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
      <Card>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{user.fullName}</Text>
        <Text style={{ color: colors.text2, marginBottom: 8 }}>{user.username}</Text>
        {profile && (
          <>
            <Row label="SĐT">{profile.phone}</Row>
            <Row label="Xe thường lái">{profile.defaultVehicles.map((v) => v.plateNumber).join(', ') || '—'}</Row>
            <Row label="Hạng bằng">{profile.licenseClass ?? '—'}</Row>
            <Row label="Hạn bằng lái">{expiryText(profile.licenseExpiry)}</Row>
            <Row label="Hạn khám SK">{expiryText(profile.healthCheckExpiry)}</Row>
          </>
        )}
      </Card>

      <Card>
        <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Đổi mật khẩu</Text>
        <TextInput placeholderTextColor={colors.muted} style={ui.input} secureTextEntry placeholder="Mật khẩu hiện tại" value={current} onChangeText={setCurrent} />
        <TextInput placeholderTextColor={colors.muted} style={ui.input} secureTextEntry placeholder="Mật khẩu mới (ít nhất 6 ký tự)" value={next} onChangeText={setNext} />
        <Button title="Đổi mật khẩu" variant="outline" onPress={changePassword} loading={busy} />
      </Card>

      <Button
        title="Đăng xuất"
        variant="danger"
        onPress={() =>
          Alert.alert('Đăng xuất?', 'Bạn sẽ không nhận được thông báo chuyến mới cho đến khi đăng nhập lại.', [
            { text: 'Không', style: 'cancel' },
            { text: 'Đăng xuất', style: 'destructive', onPress: onLogout },
          ])
        }
      />
      <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 16 }}>
        Máy chủ: {getServer()} · Phiên bản {Constants.expoConfig?.version}
      </Text>
    </ScrollView>
  );
}
