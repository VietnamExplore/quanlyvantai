import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuthImage } from '../api';
import type { Trip } from '../types';

/**
 * Bảng đón khách toàn màn hình: tự xoay ngang, chữ tự phóng to vừa màn hình, màn hình không tự tắt.
 * Booking có bảng đón khách gửi (ảnh hoặc PDF) thì mặc định hiện bảng đó, chuyển qua lại được với bảng chữ.
 */
export function SignScreen({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  useKeepAwake();
  const b = trip.booking;
  // Ảnh hoặc PDF khách gửi (PDF: máy chủ chuyển trang đầu thành ảnh)
  const hasImage = !!b.signFileType && (b.signFileType.startsWith('image/') || b.signFileType === 'application/pdf');
  const [mode, setMode] = useState<'text' | 'image'>(hasImage ? 'image' : 'text');
  // Tải lại ảnh khi bấm "Thử lại"
  const [reloadKey, setReloadKey] = useState(0);
  const img = useAuthImage(hasImage ? `/driver/trips/${trip.id}/sign-file` : null, reloadKey);
  const imgError = !!img.error;
  // Chưa nhập dòng chính: tên trưởng đoàn / HDV → khách đầu tiên → người liên hệ khách lẻ (không dùng tên công ty / đại lý đặt xe)
  const title = (b.signTitle || b.leaderName || b.passengers?.[0]?.fullName || (!b.customer ? b.contactName : '') || '').trim();
  const subtitle = b.signSubtitle?.trim();

  // Xoay ngang khi mở, trả về dọc khi đóng
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    };
  }, []);

  return (
    <Modal visible animationType="fade" statusBarTranslucent supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
      <StatusBar hidden />
      <View style={s.page}>
        {mode === 'image' && hasImage && !imgError ? (
          img.uri ? (
            <Image source={{ uri: img.uri }} style={s.image} resizeMode="contain" />
          ) : (
            <View style={s.loading}>
              <ActivityIndicator size="large" />
              <Text style={s.loadingText}>Đang tải bảng đón của khách…</Text>
            </View>
          )
        ) : (
          <View style={s.textWrap}>
            <Text style={s.title} adjustsFontSizeToFit numberOfLines={3} minimumFontScale={0.2}>
              {title.toUpperCase()}
            </Text>
            {subtitle ? (
              <Text style={s.subtitle} adjustsFontSizeToFit numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        )}

        <View style={s.toolbar}>
          {hasImage && (
            <Pressable
              onPress={() => {
                // Chuyển sang ảnh; lần trước lỗi thì tải lại
                if (mode === 'text' && imgError) setReloadKey((k) => k + 1);
                setMode(mode === 'image' && !imgError ? 'text' : 'image');
              }}
              style={s.toolBtn}
            >
              <Text style={s.toolText}>{mode === 'image' && !imgError ? 'Bảng chữ' : imgError ? 'Thử lại ảnh khách gửi' : 'Ảnh khách gửi'}</Text>
            </Pressable>
          )}
          <Pressable onPress={onClose} style={[s.toolBtn, s.closeBtn]} hitSlop={10}>
            <Text style={[s.toolText, { color: '#fff' }]}>✕ Đóng</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  image: { flex: 1, margin: 8 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 16, color: '#555' },
  // Chừa chỗ trên cho nút Đóng; chữ tự co vừa khung (không cố định khoảng cách dòng để chữ co được)
  textWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 48, paddingTop: 72, paddingBottom: 28 },
  title: { flexShrink: 1, fontSize: 120, fontWeight: '900', color: '#000', textAlign: 'center', width: '100%' },
  subtitle: { fontSize: 34, color: '#333', textAlign: 'center', marginTop: 14, width: '100%' },
  toolbar: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8, opacity: 0.85 },
  toolBtn: { backgroundColor: '#f0f0f0', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  closeBtn: { backgroundColor: '#333' },
  toolText: { fontSize: 14, fontWeight: '600', color: '#222' },
});
