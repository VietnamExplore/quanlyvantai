import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api';
import { KEYBOARD_BEHAVIOR, keyboardScroll, MODAL_ORIENTATIONS, sheetFrame } from '../platform';
import { colors, fmtDate, fmtHour } from '../theme';
import type { CheckItem, Incident, VehicleCheck, VehicleCheckState } from '../types';
import { Button, Card, Section, styles as ui } from '../ui';
import { IncidentRow, IncidentSheet, PhotoStrip, uploadPhotos } from './IncidentSheet';
import type { Photo } from './TripCosts';

const FUEL = [
  { value: 0, label: 'Cạn' },
  { value: 25, label: '¼' },
  { value: 50, label: '½' },
  { value: 75, label: '¾' },
  { value: 100, label: 'Đầy' },
];
const fuelLabel = (v: number | null) => FUEL.find((f) => f.value === v)?.label ?? '—';
const km = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('vi-VN')} km`);

/** Form nhận / trả xe: km, nhiên liệu, danh mục kiểm tra, ảnh, ghi chú */
function CheckForm({
  state,
  kind,
  vehicleId: initialVehicle,
  onClose,
  onSaved,
}: {
  state: VehicleCheckState;
  kind: 'NHAN' | 'TRA';
  vehicleId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vehicleId, setVehicleId] = useState<number | null>(initialVehicle);
  const [odo, setOdo] = useState('');
  const [fuel, setFuel] = useState<number | null>(null);
  const [items, setItems] = useState<CheckItem[]>(state.items.map((i) => ({ ...i, ok: true, note: '' })));
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);

  const setItem = (key: string, patch: Partial<CheckItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const save = async () => {
    if (!vehicleId) return Alert.alert('Chọn xe');
    const odometerKm = odo.trim() ? Number(odo.replace(/\D/g, '')) : null;
    if (odometerKm == null) return Alert.alert('Nhập số km trên đồng hồ xe');
    if (fuel == null) return Alert.alert('Chọn mức nhiên liệu');
    const bad = items.filter((i) => !i.ok);
    if (bad.some((i) => !i.note?.trim())) return Alert.alert('Ghi rõ lỗi', 'Hạng mục chọn "Lỗi" cần ghi ngắn tình trạng.');
    setBusy(true);
    try {
      const c = await api<VehicleCheck>('/driver/vehicle-checks', { method: 'POST', body: { vehicleId, kind, odometerKm, fuelLevel: fuel, items, note: note.trim() || null } });
      const failed = await uploadPhotos(`/driver/vehicle-checks/${c.id}/photos`, photos);
      onSaved();
      onClose();
      Alert.alert(
        kind === 'NHAN' ? 'Đã nhận xe' : 'Đã trả xe',
        [bad.length ? `${bad.length} hạng mục lỗi đã được báo về văn phòng.` : 'Xe đủ điều kiện.', failed ? `${failed} ảnh chưa gửi được.` : ''].filter(Boolean).join(' '),
      );
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
            <Text style={s.title}>{kind === 'NHAN' ? '🔑 Nhận xe' : '🅿️ Trả xe'}</Text>
            <Text style={s.sub}>Kiểm tra xe, ghi km và nhiên liệu. Hạng mục lỗi được báo ngay về văn phòng.</Text>

            <Text style={ui.label}>Xe</Text>
            <View style={s.chips}>
              {state.vehicles.map((v) => (
                <Pressable key={v.id} onPress={() => setVehicleId(v.id)} style={[s.chip, vehicleId === v.id && s.chipOn]}>
                  <Text style={[s.chipText, vehicleId === v.id && { color: '#fff' }]}>{v.plateNumber}</Text>
                  <Text style={[s.chipSub, vehicleId === v.id && { color: '#dbe8ff' }]}>{v.vehicleType.name}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={ui.label}>Số km đồng hồ{vehicle?.odometerKm != null ? ` (lần trước: ${km(vehicle.odometerKm)})` : ''}</Text>
            <TextInput style={ui.input} keyboardType="number-pad" value={odo} onChangeText={setOdo} placeholder="Ví dụ 125430" />

            <Text style={ui.label}>Mức nhiên liệu</Text>
            <View style={s.chips}>
              {FUEL.map((f) => (
                <Pressable key={f.value} onPress={() => setFuel(f.value)} style={[s.fuel, fuel === f.value && s.chipOn]}>
                  <Text style={[s.chipText, fuel === f.value && { color: '#fff' }]}>{f.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[ui.label, { marginTop: 6 }]}>Kiểm tra xe</Text>
            <Card>
              {items.map((i) => (
                <View key={i.key} style={s.item}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={s.itemLabel}>{i.label}</Text>
                    <Pressable onPress={() => setItem(i.key, { ok: true })} style={[s.ok, i.ok && { backgroundColor: colors.success, borderColor: colors.success }]}>
                      <Text style={[s.okText, i.ok && { color: '#fff' }]}>Tốt</Text>
                    </Pressable>
                    <Pressable onPress={() => setItem(i.key, { ok: false })} style={[s.ok, !i.ok && { backgroundColor: colors.danger, borderColor: colors.danger }]}>
                      <Text style={[s.okText, !i.ok && { color: '#fff' }]}>Lỗi</Text>
                    </Pressable>
                  </View>
                  {!i.ok && (
                    <TextInput style={[ui.input, { marginTop: 6, marginBottom: 0 }]} value={i.note ?? ''} onChangeText={(t) => setItem(i.key, { note: t })} placeholder="Tình trạng lỗi" />
                  )}
                </View>
              ))}
            </Card>

            <Text style={ui.label}>Ảnh xe (4 góc, đồng hồ…) – tối đa 6</Text>
            <PhotoStrip photos={photos} onChange={setPhotos} max={6} title="Ảnh xe" />

            <Text style={[ui.label, { marginTop: 12 }]}>Ghi chú</Text>
            <TextInput style={ui.input} value={note} onChangeText={setNote} placeholder="Không bắt buộc" />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <Button title="Thôi" variant="outline" onPress={onClose} style={{ flex: 1 }} />
              <Button title={kind === 'NHAN' ? 'Xác nhận nhận xe' : 'Xác nhận trả xe'} onPress={save} loading={busy} style={{ flex: 2 }} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function CheckRow({ c }: { c: VehicleCheck }) {
  return (
    <View style={s.hist}>
      <Text style={s.histTitle}>
        {c.kind === 'NHAN' ? '🔑 Nhận' : '🅿️ Trả'} {c.vehicle.plateNumber} · {fmtHour(c.createdAt)} {fmtDate(c.createdAt)}
      </Text>
      <Text style={s.histSub}>
        {km(c.odometerKm)} · Nhiên liệu {fuelLabel(c.fuelLevel)}
        {c.photos.length ? ` · ${c.photos.length} ảnh` : ''}
      </Text>
      {c.defects > 0 && (
        <Text style={s.defect}>
          ⚠ {c.defects} lỗi: {c.items.filter((i) => !i.ok).map((i) => (i.note ? `${i.label} (${i.note})` : i.label)).join('; ')}
        </Text>
      )}
    </View>
  );
}

/** Tab Nhận xe: xe đang giữ, nhận / trả xe, báo sự cố ngoài chuyến, lịch sử */
export function VehicleScreen() {
  const [state, setState] = useState<VehicleCheckState | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<{ kind: 'NHAN' | 'TRA'; vehicleId: number | null } | null>(null);
  const [incidentOpen, setIncidentOpen] = useState(false);

  const fetchAll = useCallback(
    () => Promise.all([api<VehicleCheckState>('/driver/vehicle-checks'), api<Incident[]>('/driver/incidents')]),
    [],
  );
  const apply = ([st, inc]: [VehicleCheckState, Incident[]]) => {
    setState(st);
    setIncidents(inc);
    setError(null);
  };
  const load = useCallback(
    () =>
      fetchAll()
        .then(apply)
        .catch((e: Error) => setError(e.message)),
    [fetchAll],
  );

  useEffect(() => {
    let alive = true;
    fetchAll()
      .then((r) => alive && apply(r))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [fetchAll]);

  if (!state) {
    return <View style={{ padding: 24, alignItems: 'center' }}>{error ? <Text style={ui.error}>{error}</Text> : <ActivityIndicator color={colors.primary} />}</View>;
  }
  const holdingIds = new Set(state.holding.map((h) => h.vehicleId));
  const suggest = state.defaultVehicleId && !holdingIds.has(state.defaultVehicleId) ? state.defaultVehicleId : null;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Card>
        <Section icon="🚐" title="Xe đang nhận" />
        {state.holding.length ? (
          state.holding.map((h) => (
            <View key={h.id} style={s.holding}>
              <View style={{ flex: 1 }}>
                <Text style={s.plate}>{h.vehicle.plateNumber}</Text>
                <Text style={s.histSub}>
                  Nhận {fmtHour(h.createdAt)} {fmtDate(h.createdAt)} · {km(h.odometerKm)} · Nhiên liệu {fuelLabel(h.fuelLevel)}
                </Text>
              </View>
              <Button title="Trả xe" size="sm" variant="soft" onPress={() => setForm({ kind: 'TRA', vehicleId: h.vehicleId })} />
            </View>
          ))
        ) : (
          <Text style={s.histSub}>Chưa nhận xe nào. Đầu ca, kiểm tra xe rồi bấm Nhận xe.</Text>
        )}
        <Button title="Nhận xe" icon="🔑" onPress={() => setForm({ kind: 'NHAN', vehicleId: suggest })} style={{ marginTop: 12 }} />
      </Card>

      <Card>
        <Section icon="⚠️" title="Sự cố" />
        <Text style={s.histSub}>Báo sự cố không thuộc chuyến nào (xe hỏng ở bãi, va quẹt khi đỗ…). Sự cố trong chuyến báo ở màn hình chuyến.</Text>
        <Button title="Báo sự cố" icon="⚠️" variant="danger" onPress={() => setIncidentOpen(true)} style={{ marginTop: 10 }} />
        {incidents.slice(0, 5).map((i) => (
          <IncidentRow key={i.id} item={i} />
        ))}
      </Card>

      {state.recent.length > 0 && (
        <Card>
          <Section icon="🕘" title="Lịch sử nhận / trả xe" />
          {state.recent.slice(0, 15).map((c) => (
            <CheckRow key={c.id} c={c} />
          ))}
        </Card>
      )}

      {form && <CheckForm state={state} kind={form.kind} vehicleId={form.vehicleId} onClose={() => setForm(null)} onSaved={load} />}
      <IncidentSheet visible={incidentOpen} onClose={() => setIncidentOpen(false)} onSent={load} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  sub: { color: colors.text2, marginTop: 4, marginBottom: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '800', color: colors.text, fontSize: 15 },
  chipSub: { fontSize: 11.5, color: colors.muted },
  fuel: { minWidth: 56, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border },
  item: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemLabel: { flex: 1, color: colors.text, fontSize: 14.5 },
  ok: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff' },
  okText: { fontWeight: '700', color: colors.text2 },
  holding: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  plate: { fontSize: 18, fontWeight: '800', color: colors.text },
  hist: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  histTitle: { fontWeight: '700', color: colors.text },
  histSub: { color: colors.text2, marginTop: 2, fontSize: 13.5 },
  defect: { color: colors.danger, marginTop: 3, fontSize: 13.5, fontWeight: '600' },
});
