import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, getServer, setServer, setToken } from '../api';
import { BRAND, colors } from '../theme';
import type { AuthUser } from '../types';

const LOGO = require('../../assets/logo.png');

/** Địa chỉ phần mềm của công ty */
const DEFAULT_SERVER = 'dieuxe.vietnamexplore.vn';

/** Ô nhập có biểu tượng bên trái, viền sáng khi đang nhập */
function Field({
  icon,
  right,
  ...props
}: React.ComponentProps<typeof TextInput> & { icon: string; right?: React.ReactNode }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[s.field, focused && s.fieldFocused]}>
      <Text style={s.fieldIcon}>{icon}</Text>
      <TextInput
        placeholderTextColor="#94a3b8"
        style={s.fieldInput}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
      {right}
    </View>
  );
}

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (user: AuthUser) => void }) {
  // Máy chủ mặc định của công ty (vẫn sửa được nếu văn phòng đổi địa chỉ)
  const [server, setServerInput] = useState(getServer() ?? DEFAULT_SERVER);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showServer, setShowServer] = useState(false);

  async function submit() {
    setError(null);
    if (!username.trim() || !password) return setError('Nhập tên đăng nhập và mật khẩu');
    if (!server.trim()) {
      setShowServer(true);
      return setError('Nhập địa chỉ máy chủ (văn phòng cung cấp)');
    }
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
    <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <StatusBar style="light" />
      {/* Vòng tròn mờ trang trí */}
      <View style={[s.bubble, { width: 320, height: 320, top: -110, right: -120 }]} />
      <View style={[s.bubble, { width: 220, height: 220, bottom: 60, left: -110 }]} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <View style={s.logoDisc}>
              <Image source={LOGO} style={s.logo} resizeMode="contain" />
            </View>
            <Text style={s.company}>{BRAND.company}</Text>
            <View style={s.appBadge}>
              <Text style={s.appBadgeText}>🚐  APP LÁI XE</Text>
            </View>
          </View>

          <View style={s.card}>
            <Text style={s.welcome}>Xin chào!</Text>
            <Text style={s.welcomeSub}>Đăng nhập để nhận và chạy chuyến</Text>

            <Field icon="👤" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="Tên đăng nhập / số điện thoại" returnKeyType="next" />
            <Field
              icon="🔒"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder="Mật khẩu"
              onSubmitEditing={submit}
              returnKeyType="go"
              right={
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10} style={{ paddingHorizontal: 4 }}>
                  <Text style={s.eye}>{showPassword ? 'Ẩn' : 'Hiện'}</Text>
                </Pressable>
              }
            />

            {showServer ? (
              <Field icon="🌐" value={server} onChangeText={setServerInput} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="Địa chỉ máy chủ, vd: vantai.congty.vn" />
            ) : (
              <Pressable onPress={() => setShowServer(true)} style={s.serverRow} hitSlop={6}>
                <Text style={s.serverText} numberOfLines={1}>
                  🌐 Máy chủ: {getServer()}
                </Text>
                <Text style={s.serverChange}>Đổi</Text>
              </Pressable>
            )}

            {error && (
              <View style={s.errorBox}>
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            <Pressable onPress={submit} disabled={loading} style={({ pressed }) => [s.btnWrap, { opacity: pressed ? 0.88 : 1 }]}>
              <LinearGradient colors={BRAND.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.btn}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>ĐĂNG NHẬP</Text>}
              </LinearGradient>
            </Pressable>
          </View>

          <Text style={s.footer}>Quên mật khẩu? Liên hệ văn phòng điều hành để được cấp lại.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  // width + maxWidth: trên iPad khung đăng nhập gọn ở giữa màn hình
  container: { flexGrow: 1, justifyContent: 'center', padding: 22, paddingTop: 56, width: '100%', maxWidth: 520, alignSelf: 'center' },
  bubble: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  header: { alignItems: 'center', marginBottom: 22 },
  logoDisc: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#001a4d',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  logo: { width: 112, height: 112 },
  company: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 1.2, marginTop: 14, textAlign: 'center' },
  appBadge: { marginTop: 8, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  appBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#001a4d',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  welcome: { fontSize: 24, fontWeight: '800', color: colors.text },
  welcomeSub: { fontSize: 14, color: colors.text2, marginTop: 2, marginBottom: 18 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f7fc',
    borderWidth: 1.5,
    borderColor: '#e3e9f3',
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 12,
    minHeight: 54,
  },
  fieldFocused: { borderColor: colors.primary, backgroundColor: '#fff' },
  fieldIcon: { fontSize: 18, width: 30 },
  fieldInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 12 },
  eye: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  serverRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  serverText: { flex: 1, fontSize: 13, color: colors.muted },
  serverChange: { fontSize: 13, color: colors.primary, fontWeight: '700', marginLeft: 8 },
  errorBox: { backgroundColor: '#fff1f0', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#ffccc7' },
  errorText: { color: colors.danger, fontSize: 14 },
  btnWrap: {
    borderRadius: 16,
    marginTop: 4,
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  btn: { borderRadius: 16, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 1.5 },
  footer: { color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'center', marginTop: 22, lineHeight: 19 },
});
