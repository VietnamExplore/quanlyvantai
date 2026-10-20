import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api';
import { KEYBOARD_BEHAVIOR, keyboardScroll, MODAL_ORIENTATIONS, sheetFrame } from '../platform';
import { colors, fmtDate, fmtHour } from '../theme';
import type { CheckItem, PreCheck, Trip, VehicleCheck, VehicleCheckState } from '../types';
import { Button, Card, Section, styles as ui } from '../ui';
import { PhotoStrip, uploadPhotos } from './IncidentSheet';
import type { Photo } from './TripCosts';

export const FUEL = [
  { value: 0, label: 'Cạn' },
  { value: 25, label: '¼' },
  { value: 50, label: '½' },
  { value: 75, label: '¾' },
  { value: 100, label: 'Đầy' },
];
export const fuelLabel = (v: number | null) => FUEL.find((f) => f.value === v)?.label ?? '—';
export const km = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('vi-VN')} km`);
export const mgl = (v: number | null) => `${(v ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 })} mg/L`;

/** Lần kiểm tra đạt trong hôm nay: được bắt đầu chuyến */
export const preCheckPassed = (c: PreCheck | null | undefined) => !!c && c.driverOk === true && fmtDate(c.createdAt) === fmtDate(new Date().toISOString());

/** Danh sách mục Đạt / Không đạt, mục không đạt ghi rõ tình trạng */
function CheckList({ items, onChange, okText, badText }: { items: CheckItem[]; onChange: (key: string, patch: Partial<CheckItem>) => void; okText: string; badText: string }) {
  return (
    <>
      {items.map((i) => (
        <View key={i.key} style={s.item}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.itemLabel}>{i.label}</Text>
            <Pressable onPress={() => onChange(i.key, { ok: true })} style={[s.ok, i.ok && { backgroundColor: colors.success, borderColor: colors.success }]}>
              <Text style={[s.okText, i.ok && { color: '#fff' }]}>{okText}</Text>
            </Pressable>
            <Pressable onPress={() => onChange(i.key, { ok: false })} style={[s.ok, !i.ok && { backgroundColor: colors.danger, borderColor: colors.danger }]}>
              <Text style={[s.okText, !i.ok && { color: '#fff' }]}>{badText}</Text>
            </Pressable>
          </View>
          {!i.ok && <TextInput style={[ui.input, { marginTop: 6, marginBottom: 0 }]} value={i.note ?? ''} onChangeText={(t) => onChange(i.key, { note: t })} placeholder="Ghi rõ tình trạng" />}
        </View>
      ))}
    </>
  );
}

/** Kiểm tra xe và lái xe trước chuyến: nồng độ cồn, sức khỏe, giấy tờ; km, nhiên liệu, kỹ thuật xe, ảnh */
export function PreCheckForm({ trip, onClose, onSaved }: { trip: Trip; onClose: () => void; onSaved: (c: VehicleCheck) => void }) {
  const [state, setState] = useState<VehicleCheckState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alcohol, setAlcohol] = useState('');
  const [alcoholPhoto, setAlcoholPhoto] = useState<Photo[]>([]);
  const [driverItems, setDriverItems] = useState<CheckItem[]>([]);
  const [odo, setOdo] = useState(trip.suggestStartKm != null ? String(trip.suggestStartKm) : '');
  const [fuel, setFuel] = useState<number | null>(null);
  const [items, setItems] = useState<CheckItem[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<VehicleCheckState>('/driver/vehicle-checks')
      .then((st) => {
        if (!alive) return;
        setState(st);
        setDriverItems(st.driverItems.map((i) => ({ ...i, ok: true, note: '' })));
        setItems(st.items.map((i) => ({ ...i, ok: true, note: '' })));
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const alcoholVal = alcohol.trim() ? Number(alcohol.trim().replace(',', '.')) : null;
  const positive = alcoholVal != null && alcoholVal > 0;
  const patch = (set: typeof setItems) => (key: string, p: Partial<CheckItem>) => set((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const save = async () => {
    if (!state) return;
    if (state.required && alcoholVal == null) return Alert.alert('Đo nồng độ cồn', 'Thổi máy đo rồi nhập kết quả (mg/L). Không có cồn bấm "0 – Không có cồn".');
    if (alcoholVal != null && (!Number.isFinite(alcoholVal) || alcoholVal < 0 || alcoholVal > 5)) return Alert.alert('Kết quả đo không hợp lệ', 'Nhập số mg/L, ví dụ 0 hoặc 0,15');
    const odometerKm = odo.trim() ? Number(odo.replace(/\D/g, '')) : null;
    if (odometerKm == null) return Alert.alert('Nhập số km trên đồng hồ xe');
    if (fuel == null) return Alert.alert('Chọn mức nhiên liệu');
    if (items.some((i) => !i.ok && !i.note?.trim())) return Alert.alert('Ghi rõ lỗi', 'Hạng mục xe chọn "Lỗi" cần ghi ngắn tình trạng.');
    setBusy(true);
    try {
      const c = await api<VehicleCheck>('/driver/vehicle-checks', {
        method: 'POST',
        body: { tripId: trip.id, alcoholMgL: alcoholVal, driverItems, odometerKm, fuelLevel: fuel, items, note: note.trim() || null },
      });
      const failed = (await uploadPhotos(`/driver/vehicle-checks/${c.id}/alcohol-photo`, alcoholPhoto)) + (await uploadPhotos(`/driver/vehicle-checks/${c.id}/photos`, photos));
      onSaved(c);
      onClose();
      const photoNote = failed ? ` ${failed} ảnh chưa gửi được.` : '';
      if (c.driverOk === false) {
        return Alert.alert(
          '🚫 Chưa đủ điều kiện lái xe',
          (c.alcoholOk === false ? `Có nồng độ cồn (${mgl(c.alcoholMgL)}). ` : 'Tình trạng lái xe chưa đạt. ') +
            'Kết quả đã báo về điều hành. Chưa được bắt đầu chuyến cho đến khi kiểm tra lại đạt.' +
            photoNote,
        );
      }
      Alert.alert('✅ Đủ điều kiện', (c.defects ? `${c.defects} hạng mục xe lỗi đã báo về văn phòng. ` : 'Xe và lái xe đạt. ') + 'Có thể bắt đầu chuyến.' + photoNote);
    } catch (e) {
      Alert.alert('Chưa lưu được', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal supportedOrientations={MODAL_ORIENTATIONS} visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: 40 }, sheetFrame]} {...keyboardScroll}>
            <Text style={s.title}>🛡️ Kiểm tra trước chuyến</Text>
            <Text style={s.sub}>
              {trip.booking.code} · {trip.vehicle?.plateNumber} · đón {fmtHour(trip.pickupTime)} {fmtDate(trip.pickupTime)}. Đạt mới được bắt đầu chuyến; mục không đạt được báo ngay về văn phòng.
            </Text>
            {!state ? (
              error ? <Text style={ui.error}>{error}</Text> : <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Card style={positive ? { borderColor: colors.danger, borderWidth: 1.5 } : undefined}>
                  <Section icon="person-outline" title="Lái xe" />
                  <Text style={s.group}>Nồng độ cồn{state.required ? ' (bắt buộc)' : ''}</Text>
                  <Text style={s.hint}>Thổi máy đo. Luật giao thông cấm lái xe có nồng độ cồn – chỉ đạt khi kết quả bằng 0.</Text>
                  <View style={[s.chips, { marginTop: 8, marginBottom: 6 }]}>
                    <Pressable onPress={() => setAlcohol('0')} style={[s.chip, alcohol.trim() === '0' && { backgroundColor: colors.success, borderColor: colors.success }]}>
                      <Text style={[s.chipText, alcohol.trim() === '0' && { color: '#fff' }]}>0 – Không có cồn</Text>
                    </Pressable>
                  </View>
                  <Text style={ui.label}>Kết quả đo (mg/L khí thở)</Text>
                  <TextInput style={ui.input} keyboardType="decimal-pad" value={alcohol} onChangeText={setAlcohol} placeholder="Ví dụ 0 hoặc 0,15" />
                  {positive && <Text style={s.bad}>🚫 Có nồng độ cồn: không được lái xe. Kết quả vẫn được gửi về điều hành.</Text>}
                  <Text style={[ui.label, { marginTop: 6 }]}>Ảnh màn hình máy đo (không bắt buộc)</Text>
                  <PhotoStrip photos={alcoholPhoto} onChange={setAlcoholPhoto} max={1} title="Ảnh máy đo nồng độ cồn" />
                  <Text style={[s.group, { marginTop: 14 }]}>Tình trạng lái xe</Text>
                  <CheckList items={driverItems} onChange={patch(setDriverItems)} okText="Đạt" badText="Không" />
                </Card>

                <Card>
                  <Section icon="car" title={`Xe ${trip.vehicle?.plateNumber ?? ''}`} />
                  <Text style={ui.label}>Số km đồng hồ (km bắt đầu chuyến)</Text>
                  <TextInput style={ui.input} keyboardType="number-pad" value={odo} onChangeText={setOdo} placeholder="Ví dụ 125430" />
                  <Text style={ui.label}>Mức nhiên liệu</Text>
                  <View style={s.chips}>
                    {FUEL.map((f) => (
                      <Pressable key={f.value} onPress={() => setFuel(f.value)} style={[s.fuel, fuel === f.value && s.chipOn]}>
                        <Text style={[s.chipText, fuel === f.value && { color: '#fff' }]}>{f.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={s.group}>Kỹ thuật xe</Text>
                  <CheckList items={items} onChange={patch(setItems)} okText="Tốt" badText="Lỗi" />
                  <Text style={[ui.label, { marginTop: 10 }]}>Ảnh xe (4 góc, đồng hồ…) – tối đa 6</Text>
                  <PhotoStrip photos={photos} onChange={setPhotos} max={6} title="Ảnh xe" />
                </Card>

                <Text style={ui.label}>Ghi chú</Text>
                <TextInput style={ui.input} value={note} onChangeText={setNote} placeholder="Không bắt buộc" />
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <Button title="Thôi" variant="outline" onPress={onClose} style={{ flex: 1 }} />
              <Button title="Xác nhận kiểm tra" onPress={save} loading={busy} disabled={!state} style={{ flex: 2 }} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

/** Ô kiểm tra trước chuyến trong màn hình chuyến */
export function PreCheckCard({ trip, onOpen }: { trip: Trip; onOpen: () => void }) {
  if (!trip.preCheckRequired) return null;
  const c = trip.preCheck;
  const before = trip.status === 'DA_GAN' || trip.status === 'TAI_XE_NHAN';
  if (!before && !c) return null;
  const passed = preCheckPassed(c);
  return (
    <Card style={before && !passed ? { borderColor: c?.driverOk === false ? colors.danger : colors.warning, borderWidth: 1.5 } : undefined}>
      <Section icon="shield-checkmark" title="Kiểm tra trước chuyến" />
      {!c ? (
        <Text style={s.hint}>Chưa kiểm tra. Trước khi bắt đầu chuyến: đo nồng độ cồn, tự kiểm tra sức khỏe, giấy tờ và kỹ thuật xe.</Text>
      ) : (
        <>
          <Text style={c.driverOk ? s.good : s.bad}>
            {c.driverOk ? '✅ Lái xe đủ điều kiện' : '🚫 Lái xe chưa đủ điều kiện'} · {fmtHour(c.createdAt)} {fmtDate(c.createdAt)}
          </Text>
          {c.alcoholOk != null && <Text style={s.hint}>Nồng độ cồn: {mgl(c.alcoholMgL)}</Text>}
          {c.driverItems.filter((i) => !i.ok).map((i) => (
            <Text key={i.key} style={s.bad}>
              ✖ {i.label}
              {i.note ? `: ${i.note}` : ''}
            </Text>
          ))}
          <Text style={s.hint}>
            Xe: {km(c.odometerKm)} · nhiên liệu {fuelLabel(c.fuelLevel)} · {c.defects ? `${c.defects} hạng mục lỗi` : 'kỹ thuật tốt'}
          </Text>
          {before && c.driverOk && !passed && <Text style={s.bad}>Lần kiểm tra từ hôm trước – cần kiểm tra lại.</Text>}
        </>
      )}
      {before && <Button title={c ? 'Kiểm tra lại' : 'Kiểm tra trước chuyến'} icon="shield-checkmark" variant={passed ? 'soft' : 'primary'} onPress={onOpen} style={{ marginTop: 10 }} />}
    </Card>
  );
}

const KIND: Record<VehicleCheck['kind'], string> = { TRUOC_CHUYEN: '🛡️ Trước chuyến', NHAN: '🔑 Nhận xe', TRA: '🅿️ Trả xe' };

/** Một dòng lịch sử kiểm tra */
export function CheckRow({ c }: { c: VehicleCheck }) {
  const badDriver = (c.driverItems ?? []).filter((i) => !i.ok);
  return (
    <View style={s.hist}>
      <Text style={s.histTitle}>
        {KIND[c.kind] ?? c.kind} · {c.trip?.booking.code ? `${c.trip.booking.code} · ` : ''}
        {c.vehicle.plateNumber} · {fmtHour(c.createdAt)} {fmtDate(c.createdAt)}
      </Text>
      <Text style={s.hint}>
        {km(c.odometerKm)} · Nhiên liệu {fuelLabel(c.fuelLevel)}
        {c.photos.length ? ` · ${c.photos.length} ảnh` : ''}
      </Text>
      {c.alcoholOk != null && <Text style={c.alcoholOk ? s.good : s.bad}>{c.alcoholOk ? `✅ Nồng độ cồn ${mgl(c.alcoholMgL)}` : `🚫 Nồng độ cồn ${mgl(c.alcoholMgL)} – không được lái xe`}</Text>}
      {badDriver.length > 0 && <Text style={s.bad}>✖ Lái xe: {badDriver.map((i) => (i.note ? `${i.label} (${i.note})` : i.label)).join('; ')}</Text>}
      {c.defects > 0 && (
        <Text style={s.bad}>
          ⚠ {c.defects} lỗi xe: {c.items.filter((i) => !i.ok).map((i) => (i.note ? `${i.label} (${i.note})` : i.label)).join('; ')}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  sub: { color: colors.text2, marginTop: 4, marginBottom: 14 },
  group: { fontSize: 15.5, fontWeight: '800', color: colors.text, marginTop: 2 },
  hint: { color: colors.text2, marginTop: 2, fontSize: 13.5 },
  good: { color: colors.success, marginTop: 3, fontSize: 14, fontWeight: '700' },
  bad: { color: colors.danger, marginTop: 3, fontSize: 13.5, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '800', color: colors.text, fontSize: 15 },
  fuel: { minWidth: 56, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border },
  item: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemLabel: { flex: 1, color: colors.text, fontSize: 14.5 },
  ok: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff' },
  okText: { fontWeight: '700', color: colors.text2 },
  hist: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  histTitle: { fontWeight: '700', color: colors.text },
});
