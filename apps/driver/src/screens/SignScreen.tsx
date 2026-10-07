import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuthImage } from '../api';
import { BrandSign } from '../BrandSign';
import { isPad, MODAL_ORIENTATIONS } from '../platform';
import type { Trip } from '../types';

/**
 * Bảng đón khách toàn màn hình: tự xoay ngang, màn hình không tự tắt. Bảng chữ kiểu mới có logo, tên công ty, hotline,
 * dòng Chào mừng và thông tin liên hệ (giống bản in của văn phòng).
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

  // Nút trên cùng tự ẩn sau vài giây để không che hotline trên bảng; chạm màn hình để hiện lại
  const [tools, setTools] = useState(true);
  useEffect(() => {
    if (!tools) return;
    const timer = setTimeout(() => setTools(false), 4000);
    return () => clearTimeout(timer);
  }, [tools]);

  // Xoay ngang khi mở, trả về dọc khi đóng (iPad: trả lại tự xoay theo cách cầm máy)
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
    return () => {
      (isPad ? ScreenOrientation.unlockAsync() : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)).catch(() => undefined);
    };
  }, []);

  return (
    <Modal visible animationType="fade" statusBarTranslucent supportedOrientations={MODAL_ORIENTATIONS} onRequestClose={onClose}>
      <StatusBar hidden />
      <Pressable style={s.page} onPress={() => setTools(true)}>
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
          <BrandSign title={title} subtitle={subtitle} lang={b.docLanguage} />
        )}

        {tools && (
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
        )}
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  image: { flex: 1, margin: 8 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 16, color: '#555' },
  toolbar: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8, opacity: 0.85 },
  toolBtn: { backgroundColor: '#f0f0f0', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  closeBtn: { backgroundColor: '#333' },
  toolText: { fontSize: 14, fontWeight: '600', color: '#222' },
});
