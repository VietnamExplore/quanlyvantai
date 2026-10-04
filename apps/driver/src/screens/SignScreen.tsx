import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { authImage } from '../api';
import type { Trip } from '../types';

/**
 * Bảng đón khách toàn màn hình: tự xoay ngang, chữ tự phóng to vừa màn hình, màn hình không tự tắt.
 * Booking có ảnh bảng đón khách gửi thì xem được cả ảnh đó.
 */
export function SignScreen({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  useKeepAwake();
  const b = trip.booking;
  const hasImage = !!b.signFileType?.startsWith('image/');
  const [mode, setMode] = useState<'text' | 'image'>(hasImage ? 'image' : 'text');
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const title = (b.signTitle || b.customer?.name || b.contactName || '').trim();
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
        {mode === 'image' && hasImage ? (
          <>
            <Image
              source={authImage(`/driver/trips/${trip.id}/sign-file`)}
              style={s.image}
              resizeMode="contain"
              onLoadEnd={() => setImgLoading(false)}
              onError={() => {
                setImgError(true);
                setMode('text');
              }}
            />
            {imgLoading && <ActivityIndicator size="large" style={StyleSheet.absoluteFill} />}
          </>
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
          {hasImage && !imgError && (
            <Pressable onPress={() => setMode(mode === 'image' ? 'text' : 'image')} style={s.toolBtn}>
              <Text style={s.toolText}>{mode === 'image' ? 'Bảng chữ' : 'Ảnh khách gửi'}</Text>
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
  textWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 24 },
  title: { fontSize: 140, lineHeight: 150, fontWeight: '900', color: '#000', textAlign: 'center', width: '100%' },
  subtitle: { fontSize: 40, color: '#222', textAlign: 'center', marginTop: 12, width: '100%' },
  toolbar: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8, opacity: 0.85 },
  toolBtn: { backgroundColor: '#f0f0f0', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  closeBtn: { backgroundColor: '#333' },
  toolText: { fontSize: 14, fontWeight: '600', color: '#222' },
});
