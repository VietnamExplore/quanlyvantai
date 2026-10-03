import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, getServer, setServer, setToken } from '../api';
import { colors } from '../theme';
import type { AuthUser } from '../types';
import { Button, styles as ui } from '../ui';

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (user: AuthUser) => void }) {
  const [server, setServerInput] = useState(getServer() ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showServer, setShowServer] = useState(!getServer());

  async function submit() {
    setError(null);
    if (!server.trim()) return setError('Nhập địa chỉ máy chủ (văn phòng cung cấp)');
    if (!username.trim() || !password) return setError('Nhập tên đăng nhập và mật khẩu');
    setLoading(true);
    try {
      await setServer(server);
      const res = await api<{ accessToken: string; user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: { username: username.trim(), password },
      });
      if (!res.user.roles.includes('LAI_XE')) throw new Error('Tài khoản này không phải tài khoản lái xe. Vui lòng dùng web văn phòng.');
      if (!res.user.driverId) throw new Error('Tài khoản chưa được liên kết với hồ sơ lái xe. Liên hệ văn phòng.');
      await setToken(res.accessToken);
      onLoggedIn(res.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Text style={s.logo}>🚐</Text>
        <Text style={s.title}>App Lái Xe</Text>
        <Text style={s.subtitle}>Đăng nhập để nhận chuyến</Text>

        <View style={s.form}>
          <Text style={ui.label}>Tên đăng nhập</Text>
          <TextInput placeholderTextColor={colors.muted} style={ui.input} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="Số điện thoại" keyboardType="default" />
          <Text style={ui.label}>Mật khẩu</Text>
          <TextInput placeholderTextColor={colors.muted} style={ui.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Mật khẩu" onSubmitEditing={submit} />

          {showServer ? (
            <>
              <Text style={ui.label}>Địa chỉ máy chủ</Text>
              <TextInput
                placeholderTextColor={colors.muted}
                style={ui.input}
                value={server}
                onChangeText={setServerInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="vd: vantai.congty.vn"
              />
            </>
          ) : (
            <Text style={s.serverLink} onPress={() => setShowServer(true)}>
              Máy chủ: {getServer()} (đổi)
            </Text>
          )}

          {error && <Text style={ui.error}>{error}</Text>}
          <Button title="Đăng nhập" onPress={submit} loading={loading} big />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 56, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', color: colors.text, marginTop: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', color: colors.text2, marginBottom: 28 },
  form: { backgroundColor: colors.card, borderRadius: 16, padding: 20 },
  serverLink: { color: colors.primary, fontSize: 13, marginBottom: 14 },
});
