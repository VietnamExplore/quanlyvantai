import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { api, apiUpload, useAuthImage } from '../api';
import { colors, fmtDate } from '../theme';
import { Button, Card, MonthSwitcher, Section, thisMonth, styles as ui } from '../ui';
import { pickPhoto, type Photo } from './TripCosts';

const vnd = (v: number) => `${v.toLocaleString('vi-VN')}đ`;

interface FuelItem {
  id: number;
  code: string;
  date: string;
  amount: number;
  liters: number | null;
  odometerKm: number | null;
  driverPaid: boolean;
  note: string | null;
  hasReceipt: boolean;
  vehicle: { id: number; plateNumber: string } | null;
}

interface FuelData {
  month: string;
  items: FuelItem[];
  vehicles: { id: number; plateNumber: string }[];
  defaultVehicleId: number | null;
}

/** Ngày hôm nay dạng YYYY-MM-DD (giờ máy) */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function ReceiptImage({ id }: { id: number }) {
  const img = useAuthImage(`/driver/fuel/${id}/receipt`);
  if (img.uri) return <Image source={{ uri: img.uri }} style={{ flex: 1 }} resizeMode="contain" />;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      {img.error ? <Text style={{ color: '#fff' }}>{img.error}</Text> : <ActivityIndicator color="#fff" size="large" />}
    </View>
  );
}

/** Xăng dầu: ghi riêng theo xe, không gắn vào chuyến */
export function FuelScreen() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<FuelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<FuelItem | null>(null);

  // Form ghi đổ xăng
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [liters, setLiters] = useState('');
  const [km, setKm] = useState('');
  const [driverPaid, setDriverPaid] = useState(false);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<FuelData>(`/driver/fuel?month=${month}`));
    } catch (e) {
      Alert.alert('Không tải được', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  function openForm() {
    setVehicleId(data?.defaultVehicleId ?? data?.vehicles[0]?.id ?? null);
    setAmount('');
    setLiters('');
    setKm('');
    setDriverPaid(false);
    setNote('');
    setPhoto(null);
    setAdding(true);
  }

  async function save() {
    const value = Number(amount);
    if (!vehicleId) return Alert.alert('Chọn xe đã đổ xăng');
    if (!value) return Alert.alert('Nhập số tiền');
    const lit = liters ? Number(liters.replace(',', '.')) : null;
    if (lit !== null && !(lit > 0)) return Alert.alert('Số lít không hợp lệ');
    setBusy(true);
    try {
      const created = await api<{ id: number }>('/driver/fuel', {
        method: 'POST',
        body: { date: today(), vehicleId, amount: value, liters: lit, odometerKm: km ? Number(km) : null, driverPaid, note: note.trim() || null },
      });
      if (photo) {
        try {
          await apiUpload(`/driver/fuel/${created.id}/receipt`, photo);
        } catch (e) {
          Alert.alert('Đã lưu nhưng chưa gửi được ảnh hóa đơn', (e as Error).message);
        }
      }
      setAdding(false);
      if (month !== thisMonth()) setMonth(thisMonth());
      else load();
    } catch (e) {
      Alert.alert('Không lưu được', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function remove(f: FuelItem) {
    Alert.alert('Xóa lần đổ xăng này?', `${fmtDate(f.date)} · ${vnd(f.amount)}`, [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/driver/fuel/${f.id}/delete`, { method: 'POST' });
            load();
          } catch (e) {
            Alert.alert('Không xóa được', (e as Error).message);
          }
        },
      },
    ]);
  }

  const items = data?.items ?? [];
  const total = items.reduce((s, f) => s + f.amount, 0);
  const totalLiters = items.reduce((s, f) => s + (f.liters ?? 0), 0);
  const selfPaid = items.filter((f) => f.driverPaid).reduce((s, f) => s + f.amount, 0);

  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[colors.primary]} />}>
      <MonthSwitcher month={month} onChange={setMonth} />

      <View style={s.stats}>
        <View style={s.stat}>
          <Text style={s.statLabel}>Tổng tiền xăng</Text>
          <Text style={s.statValue}>{vnd(total)}</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statLabel}>Số lít</Text>
          <Text style={s.statValue}>{totalLiters ? `${totalLiters.toLocaleString('vi-VN')} L` : '—'}</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statLabel}>Tôi tự trả</Text>
          <Text style={[s.statValue, selfPaid > 0 && { color: colors.warning }]}>{vnd(selfPaid)}</Text>
        </View>
      </View>

      {!adding && <Button title="GHI ĐỔ XĂNG" icon="⛽" size="lg" onPress={openForm} style={{ marginBottom: 12 }} />}

      {adding && (
        <Card>
          <Section icon="⛽" title="Ghi đổ xăng hôm nay" />
          <Text style={ui.label}>Xe</Text>
          <View style={s.chips}>
            {(data?.vehicles ?? []).map((v) => (
              <Pressable key={v.id} onPress={() => setVehicleId(v.id)} style={[s.chip, vehicleId === v.id && s.chipActive]}>
                <Text style={[s.chipText, vehicleId === v.id && s.chipTextActive]}>🚐 {v.plateNumber}</Text>
              </Pressable>
            ))}
            {!data?.vehicles.length && <Text style={{ color: colors.muted }}>Chưa có xe công ty nào</Text>}
          </View>
          <Text style={ui.label}>Số tiền (đồng)</Text>
          <TextInput
            style={[ui.input, { fontSize: 20, fontWeight: '800' }]}
            keyboardType="number-pad"
            placeholder="1.000.000"
            placeholderTextColor={colors.muted}
            value={amount ? Number(amount).toLocaleString('vi-VN') : ''}
            onChangeText={(t) => setAmount(t.replace(/\D/g, ''))}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={ui.label}>Số lít</Text>
              <TextInput style={ui.input} keyboardType="decimal-pad" placeholder="45,5" placeholderTextColor={colors.muted} value={liters} onChangeText={(t) => setLiters(t.replace(/[^\d.,]/g, ''))} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ui.label}>Số km đồng hồ</Text>
              <TextInput style={ui.input} keyboardType="number-pad" placeholder="125430" placeholderTextColor={colors.muted} value={km} onChangeText={(t) => setKm(t.replace(/\D/g, ''))} />
            </View>
          </View>
          <Pressable onPress={() => setDriverPaid(!driverPaid)} style={s.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.switchTitle}>Tôi tự trả tiền</Text>
              <Text style={s.switchHint}>Bật nếu bạn bỏ tiền túi ra trả — công ty hoàn lại vào lương tháng.</Text>
            </View>
            <Switch value={driverPaid} onValueChange={setDriverPaid} trackColor={{ true: colors.primary }} />
          </Pressable>
          <TextInput style={ui.input} placeholder="Ghi chú: cây xăng, loại dầu… (không bắt buộc)" placeholderTextColor={colors.muted} value={note} onChangeText={setNote} />
          <Text style={ui.label}>Ảnh hóa đơn (nên chụp)</Text>
          {photo ? (
            <View style={s.preview}>
              <Image source={{ uri: photo.uri }} style={s.previewImg} />
              <Button title="Bỏ ảnh" size="sm" variant="ghost" onPress={() => setPhoto(null)} style={{ flex: 1 }} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <Button title="Chụp hóa đơn" icon="📷" size="sm" variant="soft" onPress={() => pickPhoto('camera').then((p) => p && setPhoto(p))} style={{ flex: 1 }} />
              <Button title="Chọn ảnh" icon="🖼" size="sm" variant="soft" onPress={() => pickPhoto('library').then((p) => p && setPhoto(p))} style={{ flex: 1 }} />
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Hủy" variant="ghost" onPress={() => setAdding(false)} style={{ flex: 1 }} />
            <Button title="Lưu" onPress={save} loading={busy} style={{ flex: 2 }} />
          </View>
        </Card>
      )}

      <Card>
        <Section icon="🧾" title={`Lần đổ trong tháng (${items.length})`} />
        {items.length === 0 && <Text style={{ color: colors.muted, fontSize: 14 }}>Chưa có lần đổ xăng nào trong tháng này.</Text>}
        {items.map((f) => (
          <View key={f.id} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>
                {fmtDate(f.date).slice(0, 5)} · {f.vehicle?.plateNumber ?? '—'}
              </Text>
              <Text style={s.rowMeta}>
                {[f.liters ? `${f.liters.toLocaleString('vi-VN')} L` : null, f.odometerKm ? `${f.odometerKm.toLocaleString('vi-VN')} km` : null, f.note].filter(Boolean).join(' · ') || f.code}
              </Text>
              {f.driverPaid && <Text style={s.selfPaid}>Tự trả · chờ hoàn lại</Text>}
            </View>
            <Text style={s.rowAmount}>{vnd(f.amount)}</Text>
            {f.hasReceipt && (
              <Pressable onPress={() => setViewing(f)} hitSlop={8} style={s.photoBtn}>
                <Text style={s.photoBtnText}>📷</Text>
              </Pressable>
            )}
            <Pressable onPress={() => remove(f)} hitSlop={10} style={{ marginLeft: 10 }}>
              <Text style={{ color: colors.danger, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>
        ))}
      </Card>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={s.viewer} onPress={() => setViewing(null)}>
          {viewing && <ReceiptImage id={viewing.id} />}
          <Text style={s.viewerHint}>Bấm để đóng</Text>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12 },
  statLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  statValue: { fontSize: 16, color: colors.text, fontWeight: '800', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: '#f4f7fc' },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 14, color: colors.text2 },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f4f7fc', borderRadius: 14, padding: 12, marginBottom: 12 },
  switchTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  switchHint: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  preview: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 },
  previewImg: { width: 96, height: 96, borderRadius: 8, backgroundColor: '#eee' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  selfPaid: { fontSize: 12, color: colors.warning, fontWeight: '700', marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: '700', color: colors.text },
  photoBtn: { marginLeft: 10, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#e6f0fb' },
  photoBtnText: { fontSize: 13 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: 12 },
  viewerHint: { color: '#fff', textAlign: 'center', paddingVertical: 12, fontSize: 14 },
});
