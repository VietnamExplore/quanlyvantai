import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, apiUpload } from '../api';
import { KEYBOARD_BEHAVIOR, MODAL_ORIENTATIONS, sheetFrame } from '../platform';
import { colors, fmtDate, fmtHour } from '../theme';
import type { Incident, IncidentType } from '../types';
import { Button, Card, Section, styles as ui } from '../ui';
import { pickPhoto, type Photo } from './TripCosts';
import { Icon } from '../icons';

export const INCIDENT_TYPES: { value: IncidentType; label: string; icon: string }[] = [
  { value: 'HONG_XE', label: 'Hỏng xe', icon: 'construct' },
  { value: 'VA_CHAM', label: 'Va chạm / tai nạn', icon: 'mci:car-emergency' },
  { value: 'TRE_GIO', label: 'Kẹt xe / trễ giờ', icon: 'time' },
  { value: 'KHACH_VANG', label: 'Khách không có mặt', icon: 'person-remove' },
  { value: 'DOI_LICH_TRINH', label: 'Khách đổi lịch trình', icon: 'git-compare' },
  { value: 'KHAC', label: 'Khác', icon: 'alert-circle' },
];
const TYPE_LABEL = Object.fromEntries(INCIDENT_TYPES.map((t) => [t.value, t.label])) as Record<IncidentType, string>;

export const INCIDENT_STATUS: Record<string, { label: string; color: string }> = {
  MOI: { label: 'Đã gửi, chờ văn phòng', color: colors.warning },
  DANG_XU_LY: { label: 'Văn phòng đang xử lý', color: colors.primary },
  DA_XU_LY: { label: 'Đã xử lý', color: colors.success },
};

const MAX_PHOTOS = 4;

/** Chọn chụp ảnh mới hay lấy ảnh có sẵn */
export function askPhoto(title: string, onPicked: (p: Photo) => void) {
  const go = (src: 'camera' | 'library') => pickPhoto(src).then((p) => p && onPicked(p)).catch((e) => Alert.alert('Không lấy được ảnh', (e as Error).message));
  Alert.alert(title, undefined, [
    { text: '📷 Chụp ảnh', onPress: () => go('camera') },
    { text: '🖼 Chọn ảnh có sẵn', onPress: () => go('library') },
    { text: 'Thôi', style: 'cancel' },
  ]);
}

/** Dãy ảnh chờ gửi + nút thêm ảnh */
export function PhotoStrip({ photos, onChange, max = MAX_PHOTOS, title = 'Ảnh hiện trường' }: { photos: Photo[]; onChange: (p: Photo[]) => void; max?: number; title?: string }) {
  return (
    <View style={s.strip}>
      {photos.map((p, i) => (
        <Pressable key={p.uri} onLongPress={() => onChange(photos.filter((_, j) => j !== i))}>
          <Image source={{ uri: p.uri }} style={s.thumb} />
        </Pressable>
      ))}
      {photos.length < max && (
        <Pressable style={[s.thumb, s.addThumb]} onPress={() => askPhoto(title, (p) => onChange([...photos, p]))}>
          <Text style={{ fontSize: 26 }}>📷</Text>
          <Text style={{ fontSize: 11, color: colors.text2 }}>Thêm ảnh</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Tải lần lượt các ảnh lên một bản ghi (sự cố / nhận xe); trả về số ảnh lỗi */
export async function uploadPhotos(path: string, photos: Photo[]) {
  let failed = 0;
  for (const p of photos) {
    try {
      await apiUpload(path, p);
    } catch {
      failed++;
    }
  }
  return failed;
}

/** Màn hình báo sự cố: loại, mô tả, ảnh. Gửi xong điều hành nhận thông báo ngay. */
export function IncidentSheet({ visible, tripId, onClose, onSent }: { visible: boolean; tripId?: number | null; onClose: () => void; onSent?: () => void }) {
  const [type, setType] = useState<IncidentType | null>(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);

  // Đóng màn hình thì xóa nội dung đã nhập
  const close = () => {
    setType(null);
    setNote('');
    setPhotos([]);
    onClose();
  };

  const send = async () => {
    if (!type) return Alert.alert('Chọn loại sự cố');
    if (!note.trim()) return Alert.alert('Mô tả ngắn sự cố', 'Ví dụ: xe báo đèn động cơ, đang dừng ở km 12 QL1A');
    setBusy(true);
    try {
      const inc = await api<Incident>('/driver/incidents', { method: 'POST', body: { tripId: tripId ?? null, type, note } });
      const failed = await uploadPhotos(`/driver/incidents/${inc.id}/photos`, photos);
      onSent?.();
      close();
      Alert.alert('Đã báo sự cố', `Văn phòng điều hành đã nhận thông báo.${failed ? ` (${failed} ảnh chưa gửi được)` : ''} Nếu khẩn cấp hãy gọi điện trực tiếp.`);
    } catch (e) {
      Alert.alert('Chưa gửi được', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[{ padding: 16 }, sheetFrame]} keyboardShouldPersistTaps="handled">
            <View style={s.typeRow}>
              <Icon name="warning" size={22} color={colors.warning} />
              <Text style={s.title}>Báo sự cố</Text>
            </View>
            <Text style={s.sub}>Điều hành nhận thông báo ngay. Trường hợp nguy hiểm, hãy đảm bảo an toàn và gọi điện cho văn phòng.</Text>
            <Text style={ui.label}>Loại sự cố</Text>
            <View style={s.types}>
              {INCIDENT_TYPES.map((t) => (
                <Pressable key={t.value} onPress={() => setType(t.value)} style={[s.type, s.typeRow, type === t.value && s.typeOn]}>
                  <Icon name={t.icon} size={16} color={type === t.value ? '#fff' : colors.text2} />
                  <Text style={[s.typeText, type === t.value && { color: '#fff' }]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={ui.label}>Mô tả</Text>
            <TextInput style={[ui.input, { minHeight: 90, textAlignVertical: 'top' }]} multiline value={note} onChangeText={setNote} placeholder="Chuyện gì xảy ra, đang ở đâu, cần văn phòng hỗ trợ gì…" />
            <Text style={ui.label}>Ảnh (tối đa {MAX_PHOTOS}, giữ lâu vào ảnh để bỏ)</Text>
            <PhotoStrip photos={photos} onChange={setPhotos} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <Button title="Thôi" variant="outline" onPress={close} style={{ flex: 1 }} />
              <Button title="Gửi báo cáo" variant="danger" onPress={send} loading={busy} style={{ flex: 2 }} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

/** Sự cố đã báo của chuyến (hiện tình trạng văn phòng xử lý) */
export function TripIncidents({ tripId, reloadKey }: { tripId: number; reloadKey: number }) {
  const [items, setItems] = useState<Incident[]>([]);
  const load = useCallback(() => {
    api<Incident[]>(`/driver/incidents?tripId=${tripId}`)
      .then(setItems)
      .catch(() => undefined);
  }, [tripId]);
  useEffect(() => {
    load();
  }, [load, reloadKey]);
  if (!items.length) return null;
  return (
    <Card>
      <Section icon="warning" title="Sự cố đã báo" />
      {items.map((i) => (
        <IncidentRow key={i.id} item={i} />
      ))}
    </Card>
  );
}

export function IncidentRow({ item: i }: { item: Incident }) {
  const st = INCIDENT_STATUS[i.status] ?? INCIDENT_STATUS.MOI;
  return (
    <View style={s.row}>
      <Text style={s.rowTitle}>
        {TYPE_LABEL[i.type] ?? i.type} · {fmtHour(i.createdAt)} {fmtDate(i.createdAt)}
      </Text>
      <Text style={s.rowNote}>{i.note}</Text>
      <Text style={[s.rowStatus, { color: st.color }]}>
        {st.label}
        {i.photos.length ? ` · ${i.photos.length} ảnh` : ''}
      </Text>
      {i.handleNote && <Text style={s.rowNote}>Văn phòng: {i.handleNote}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  sub: { color: colors.text2, marginTop: 4, marginBottom: 14 },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  type: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border },
  typeOn: { backgroundColor: colors.danger, borderColor: colors.danger },
  typeText: { fontWeight: '700', color: colors.text },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 76, height: 76, borderRadius: 12, backgroundColor: '#dde4ee' },
  addThumb: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: '#fff' },
  row: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowTitle: { fontWeight: '700', color: colors.text },
  rowNote: { color: colors.text2, marginTop: 2 },
  rowStatus: { fontWeight: '700', marginTop: 4, fontSize: 13 },
});
