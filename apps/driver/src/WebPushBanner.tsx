import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './icons';
import { colors } from './theme';
import { enableWebPush, webPushState, type WebPushState } from './webpush';

/**
 * Băng nhắc trên app bản web (iPhone): chưa thêm vào Màn hình chính → hướng dẫn cài; chưa bật thông báo → nút bật
 * (iPhone chỉ cho xin quyền khi người dùng bấm); bị chặn → hướng dẫn mở lại trong Cài đặt.
 */
export function WebPushBanner({ margin }: { margin: number }) {
  const [state, setState] = useState<WebPushState>(() => webPushState());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (state === 'on' || state === 'unsupported') return null;

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      setState(await enableWebPush());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (state === 'install') {
    return (
      <View style={[s.box, s.install, { marginHorizontal: margin }]}>
        <View style={[s.icon, { backgroundColor: '#dbeafe' }]}>
          <Icon name="phone-portrait-outline" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.primaryDark }]}>Cài app lên màn hình iPhone để nhận thông báo</Text>
          <Text style={s.body}>
            Bấm nút <Text style={s.b}>Chia sẻ</Text> (ô vuông có mũi tên lên) ở thanh dưới Safari → <Text style={s.b}>Thêm vào Màn hình chính</Text> → Thêm. Sau đó mở app từ biểu tượng
            mới và bấm “Bật thông báo”.
          </Text>
        </View>
      </View>
    );
  }

  if (state === 'denied') {
    return (
      <View style={[s.box, s.denied, { marginHorizontal: margin }]}>
        <View style={[s.icon, { backgroundColor: '#fee2e2' }]}>
          <Icon name="notifications-off" size={22} color={colors.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.danger }]}>Thông báo đang bị tắt</Text>
          <Text style={s.body}>
            Vào <Text style={s.b}>Cài đặt → Thông báo → Vietnam Explore Driver</Text> → bật <Text style={s.b}>Cho phép thông báo</Text> và <Text style={s.b}>Biểu tượng</Text>, rồi mở lại app.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Pressable onPress={enable} disabled={busy} style={({ pressed }) => [s.box, s.ask, { marginHorizontal: margin }, pressed && { opacity: 0.85 }]}>
      <View style={[s.icon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
        <Icon name="notifications" size={22} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: '#fff' }]}>{busy ? 'Đang bật thông báo…' : 'Bấm để bật thông báo'}</Text>
        <Text style={[s.body, { color: 'rgba(255,255,255,0.9)' }]}>{error ?? 'Nhận báo chuyến mới, đổi giờ, hủy chuyến ngay trên màn hình khóa, kèm số đỏ trên biểu tượng app.'}</Text>
      </View>
      <Icon name="chevron-forward" size={20} color="#fff" />
    </Pressable>
  );
}

const s = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 12, marginTop: 10 },
  install: { backgroundColor: '#eff6ff', borderWidth: 1.5, borderColor: '#bfdbfe' },
  denied: { backgroundColor: '#fff1f2', borderWidth: 1.5, borderColor: '#fecdd3' },
  ask: { backgroundColor: colors.primary },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14.5, fontWeight: '800' },
  body: { fontSize: 12.5, color: colors.text2, marginTop: 2, lineHeight: 18 },
  b: { fontWeight: '800' },
});
