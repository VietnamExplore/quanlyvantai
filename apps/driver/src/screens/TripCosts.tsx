import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, apiUpload, useAuthImage } from '../api';
import { colors, fmtDate } from '../theme';
import type { CostCategory, TripCost } from '../types';
import { Button, Card, styles as ui } from '../ui';

const vnd = (v: number | string) => `${Number(v).toLocaleString('vi-VN')}đ`;

export type Photo = { uri: string; name: string; type: string };

/** Chụp ảnh hóa đơn (camera) hoặc chọn ảnh có sẵn trong máy; ảnh được nén nhẹ cho nhanh */
export async function pickPhoto(source: 'camera' | 'library'): Promise<Photo | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Chưa cho phép dùng camera', 'Vào Cài đặt điện thoại → Ứng dụng để cho phép camera.');
      return null;
    }
  }
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  const type = a.mimeType ?? 'image/jpeg';
  return { uri: a.uri, type, name: a.fileName ?? `hoa-don-${Date.now()}.${type.split('/')[1] ?? 'jpg'}` };
}

/** Ảnh hóa đơn đã gửi (tải kèm đăng nhập) */
function ReceiptImage({ costId }: { costId: number }) {
  const img = useAuthImage(`/driver/trip-costs/${costId}/receipt`);
  if (img.uri) return <Image source={{ uri: img.uri }} style={s.viewerImg} resizeMode="contain" />;
  return (
    <View style={[s.viewerImg, { alignItems: 'center', justifyContent: 'center' }]}>
      {img.error ? <Text style={{ color: '#fff' }}>{img.error}</Text> : <ActivityIndicator color="#fff" size="large" />}
    </View>
  );
}

/** Hỏi chụp mới hay chọn ảnh có sẵn */
function askPhoto(onPicked: (p: Photo) => void) {
  const go = (src: 'camera' | 'library') => pickPhoto(src).then((p) => p && onPicked(p)).catch((e) => Alert.alert('Không lấy được ảnh', (e as Error).message));
  Alert.alert('Ảnh hóa đơn / vé', undefined, [
    { text: '📷 Chụp ảnh', onPress: () => go('camera') },
    { text: '🖼 Chọn ảnh có sẵn', onPress: () => go('library') },
    { text: 'Thôi', style: 'cancel' },
  ]);
}

/** Chi phí chuyến do lái xe nhập: xăng dầu, cầu đường, ăn ở… */
export function TripCosts({ tripId, canAdd }: { tripId: number; canAdd: boolean }) {
  const [costs, setCosts] = useState<TripCost[]>([]);
  const [categories, setCategories] = useState<CostCategory[]>([]);
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [viewing, setViewing] = useState<TripCost | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setCosts(await api<TripCost[]>(`/driver/trips/${tripId}/costs`));
    } catch {
      /* chưa có quyền xem (chuyến chưa nhận) */
    }
  }, [tripId]);

  useEffect(() => {
    load();
    api<CostCategory[]>('/driver/cost-categories')
      .then((list) => setCategories(list.filter((c) => c.isActive)))
      .catch(() => undefined);
  }, [load]);

  const total = costs.reduce((s, c) => s + Number(c.amount), 0);

  async function add() {
    const value = Number(amount.replace(/\D/g, ''));
    if (!category) return Alert.alert('Chọn loại chi phí');
    if (!value) return Alert.alert('Nhập số tiền');
    setBusy(true);
    try {
      const before = new Set(costs.map((c) => c.id));
      let list = await api<TripCost[]>(`/driver/trips/${tripId}/costs`, { method: 'POST', body: { categoryCode: category, amount: value, note: note.trim() || null } });
      setCosts(list);
      // Khoản vừa tạo = khoản mới xuất hiện trong danh sách
      const created = list.find((c) => !before.has(c.id) && c.byDriver);
      if (photo && created) {
        try {
          list = await apiUpload<TripCost[]>(`/driver/trip-costs/${created.id}/receipt`, photo);
          setCosts(list);
        } catch (e) {
          Alert.alert('Đã lưu chi phí nhưng chưa gửi được ảnh', `${(e as Error).message}\nBấm "+ Ảnh" ở khoản chi phí để gửi lại.`);
        }
      }
      setAdding(false);
      setCategory(null);
      setAmount('');
      setNote('');
      setPhoto(null);
    } catch (e) {
      Alert.alert('Không lưu được', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Thêm / thay ảnh cho khoản chi phí đã lưu */
  function attach(c: TripCost) {
    askPhoto(async (p) => {
      setUploadingId(c.id);
      try {
        setCosts(await apiUpload<TripCost[]>(`/driver/trip-costs/${c.id}/receipt`, p));
      } catch (e) {
        Alert.alert('Không gửi được ảnh', (e as Error).message);
      } finally {
        setUploadingId(null);
      }
    });
  }

  function remove(c: TripCost) {
    Alert.alert('Xóa chi phí?', `${c.category.name}: ${vnd(c.amount)}`, [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            setCosts(await api<TripCost[]>(`/driver/trip-costs/${c.id}/delete`, { method: 'POST' }));
          } catch (e) {
            Alert.alert('Không xóa được', (e as Error).message);
          }
        },
      },
    ]);
  }

  return (
    <Card>
      <View style={s.head}>
        <Text style={s.section}>💰  Chi phí chuyến</Text>
        {costs.length > 0 && <Text style={s.total}>{vnd(total)}</Text>}
      </View>
      {costs.length === 0 && !adding && <Text style={s.empty}>Chưa có chi phí. Nhập xăng dầu, cầu đường, gửi xe… nếu bạn đã chi.</Text>}
      {costs.map((c) => (
        <View key={c.id} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{c.category.name}</Text>
            <Text style={s.meta}>
              {fmtDate(c.spentAt)}
              {c.note ? ` · ${c.note}` : ''}
              {!c.byDriver ? ' · văn phòng nhập' : ''}
            </Text>
          </View>
          <Text style={s.amount}>{vnd(c.amount)}</Text>
          {uploadingId === c.id ? (
            <ActivityIndicator style={{ marginLeft: 10 }} color={colors.primary} />
          ) : c.receiptFile ? (
            <Pressable onPress={() => setViewing(c)} hitSlop={8} style={s.photoBtn}>
              <Text style={s.photoBtnText}>📷 Xem</Text>
            </Pressable>
          ) : (
            c.byDriver &&
            canAdd && (
              <Pressable onPress={() => attach(c)} hitSlop={8} style={[s.photoBtn, s.photoAdd]}>
                <Text style={[s.photoBtnText, { color: colors.muted }]}>+ Ảnh</Text>
              </Pressable>
            )
          )}
          {c.byDriver && (
            <Pressable onPress={() => remove(c)} hitSlop={10} style={{ marginLeft: 10 }}>
              <Text style={{ color: colors.danger, fontSize: 18 }}>✕</Text>
            </Pressable>
          )}
        </View>
      ))}

      {canAdd && !adding && <Button title="Thêm chi phí" icon="➕" size="sm" variant="soft" onPress={() => setAdding(true)} style={{ marginTop: 10 }} />}
      {adding && (
        <View style={{ marginTop: 10 }}>
          <Text style={ui.label}>Loại chi phí</Text>
          <View style={s.chips}>
            {categories.map((c) => (
              <Pressable key={c.code} onPress={() => setCategory(c.code)} style={[s.chip, category === c.code && s.chipActive]}>
                <Text style={[s.chipText, category === c.code && s.chipTextActive]}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={ui.label}>Số tiền (đồng)</Text>
          <TextInput
            placeholderTextColor={colors.muted}
            style={ui.input}
            keyboardType="number-pad"
            value={amount ? Number(amount.replace(/\D/g, '')).toLocaleString('vi-VN') : ''}
            onChangeText={(t) => setAmount(t.replace(/\D/g, ''))}
            placeholder="500.000"
          />
          <TextInput placeholderTextColor={colors.muted} style={ui.input} value={note} onChangeText={setNote} placeholder="Ghi chú (không bắt buộc)" />
          <Text style={ui.label}>Ảnh hóa đơn / vé (không bắt buộc)</Text>
          {photo ? (
            <View style={s.preview}>
              <Image source={{ uri: photo.uri }} style={s.previewImg} />
              <View style={{ flex: 1, gap: 6 }}>
                <Button title="Đổi ảnh" size="sm" variant="soft" onPress={() => askPhoto(setPhoto)} />
                <Button title="Bỏ ảnh" size="sm" variant="ghost" onPress={() => setPhoto(null)} />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <Button title="Chụp hóa đơn" icon="📷" size="sm" variant="soft" onPress={() => pickPhoto('camera').then((p) => p && setPhoto(p))} style={{ flex: 1 }} />
              <Button title="Chọn ảnh" icon="🖼" size="sm" variant="soft" onPress={() => pickPhoto('library').then((p) => p && setPhoto(p))} style={{ flex: 1 }} />
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              title="Hủy"
              variant="ghost"
              onPress={() => {
                setAdding(false);
                setPhoto(null);
              }}
              style={{ flex: 1 }}
            />
            <Button title="Lưu chi phí" onPress={add} loading={busy} style={{ flex: 2 }} />
          </View>
        </View>
      )}

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={s.viewer} onPress={() => setViewing(null)}>
          {viewing && <ReceiptImage costId={viewing.id} />}
          <Text style={s.viewerHint}>
            {viewing ? `${viewing.category.name}: ${vnd(viewing.amount)}` : ''} · bấm để đóng
          </Text>
        </Pressable>
      </Modal>
    </Card>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  section: { fontSize: 12.5, fontWeight: '800', color: colors.muted, letterSpacing: 0.8, textTransform: 'uppercase' },
  total: { fontSize: 17, fontWeight: '800', color: colors.primary },
  empty: { color: colors.muted, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { fontSize: 15, color: colors.text, fontWeight: '600' },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '600', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: '#f4f7fc' },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 14, color: colors.text2 },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
  photoBtn: { marginLeft: 10, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#e6f0fb' },
  photoAdd: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  photoBtnText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  preview: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 },
  previewImg: { width: 96, height: 96, borderRadius: 8, backgroundColor: '#eee' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: 12 },
  viewerImg: { flex: 1 },
  viewerHint: { color: '#fff', textAlign: 'center', paddingVertical: 12, fontSize: 14 },
});
