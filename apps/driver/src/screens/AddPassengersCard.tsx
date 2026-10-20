import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api';
import { KEYBOARD_BEHAVIOR, keyboardScroll, MODAL_ORIENTATIONS, sheetFrame } from '../platform';
import { colors } from '../theme';
import type { Passenger, Trip } from '../types';
import { Button, Card, Section, styles as ui } from '../ui';

/** Lái xe được bổ sung khách khi đã nhận chuyến, đang đi đón hoặc đã đón */
const ALLOWED = ['TAI_XE_NHAN', 'DANG_DEN_DON', 'DA_DON_KHACH'];

type Draft = { fullName: string; birthYear: string; gender: 'NAM' | 'NU' | null; nationality: string; phone: string; note: string };
const EMPTY: Draft = { fullName: '', birthYear: '', gender: null, nationality: '', phone: '', note: '' };

const toDraft = (p: Passenger): Draft => ({
  fullName: p.fullName,
  birthYear: p.birthYear ? String(p.birthYear) : '',
  gender: (p.gender as Draft['gender']) ?? null,
  nationality: p.nationality ?? '',
  phone: p.phone ?? '',
  note: p.note ?? '',
});

const toBody = (d: Draft) => ({
  fullName: d.fullName.trim(),
  birthYear: d.birthYear.trim() ? Number(d.birthYear.replace(/\D/g, '')) : null,
  gender: d.gender,
  nationality: d.nationality.trim() || null,
  phone: d.phone.trim() || null,
  note: d.note.trim() || null,
});

/**
 * Bổ sung danh sách hành khách khi đón (booking nhập chưa đủ).
 * Khách thêm vào danh sách của booking: hợp đồng vận chuyển, lệnh điều xe, lệnh vận chuyển tự cập nhật theo.
 */
export function AddPassengersCard({ trip, onChanged }: { trip: Trip; onChanged: (list: Passenger[]) => void }) {
  const [editing, setEditing] = useState<{ id: number | null; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!ALLOWED.includes(trip.status)) return null;

  const pax = trip.booking.passengers ?? [];
  const mine = pax.filter((p) => p.addedByDriverId);
  const missing = Math.max(0, trip.passengers - pax.length);
  if (!missing && !mine.length) return null;

  const set = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));

  const save = async (more: boolean) => {
    if (!editing) return;
    const body = toBody(editing.draft);
    if (!body.fullName) return Alert.alert('Nhập họ tên hành khách');
    if (body.birthYear != null && (body.birthYear < 1900 || body.birthYear > new Date().getFullYear())) return Alert.alert('Năm sinh không hợp lệ');
    setBusy(true);
    try {
      const list = editing.id
        ? await api<Passenger[]>(`/driver/passengers/${editing.id}`, { method: 'POST', body })
        : await api<Passenger[]>(`/driver/trips/${trip.id}/passengers`, { method: 'POST', body: { passengers: [body] } });
      onChanged(list);
      // Còn thiếu thì mở sẵn form người tiếp theo
      setEditing(more && !editing.id && list.length < trip.passengers ? { id: null, draft: { ...EMPTY, nationality: editing.draft.nationality } } : null);
    } catch (e) {
      Alert.alert('Chưa lưu được', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = (p: Passenger) =>
    Alert.alert('Xóa hành khách?', p.fullName, [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            onChanged(await api<Passenger[]>(`/driver/passengers/${p.id}/delete`, { method: 'POST' }));
          } catch (e) {
            Alert.alert('Không xóa được', (e as Error).message);
          }
        },
      },
    ]);

  return (
    <Card>
      <Section icon="add-circle-outline" title="Bổ sung hành khách" />
      {missing > 0 ? (
        <Text style={s.warn}>
          Danh sách mới có {pax.length}/{trip.passengers} khách. Khi đón, hỏi tên khách và thêm cho đủ — hợp đồng, lệnh vận chuyển tự cập nhật.
        </Text>
      ) : (
        <Text style={s.ok}>✔ Danh sách đã đủ {trip.passengers} khách.</Text>
      )}
      {mine.map((p) => (
        <View key={p.id} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>
              {p.seq}. {p.fullName}
            </Text>
            <Text style={s.info}>{[p.birthYear, p.gender === 'NAM' ? 'Nam' : p.gender === 'NU' ? 'Nữ' : null, p.nationality, p.phone, p.note].filter(Boolean).join(' · ') || 'Bạn đã thêm'}</Text>
          </View>
          <Pressable hitSlop={8} onPress={() => setEditing({ id: p.id!, draft: toDraft(p) })}>
            <Text style={s.link}>Sửa</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => remove(p)}>
            <Text style={[s.link, { color: colors.danger }]}>Xóa</Text>
          </Pressable>
        </View>
      ))}
      {missing > 0 && <Button title={`Thêm khách (còn thiếu ${missing})`} icon="add-circle-outline" onPress={() => setEditing({ id: null, draft: EMPTY })} style={{ marginTop: 10 }} />}

      <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR} style={{ flex: 1 }}>
            {editing && (
              <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: 40 }, sheetFrame]} {...keyboardScroll}>
                <Text style={s.title}>{editing.id ? 'Sửa hành khách' : `Thêm hành khách (${pax.length + 1}/${trip.passengers})`}</Text>
                <Text style={ui.label}>Họ tên *</Text>
                <TextInput style={ui.input} value={editing.draft.fullName} onChangeText={(t) => set({ fullName: t })} placeholder="Như trên giấy tờ" autoFocus />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={ui.label}>Năm sinh</Text>
                    <TextInput style={ui.input} value={editing.draft.birthYear} onChangeText={(t) => set({ birthYear: t })} keyboardType="number-pad" maxLength={4} placeholder="1990" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={ui.label}>Giới tính</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(['NAM', 'NU'] as const).map((g) => (
                        <Pressable key={g} onPress={() => set({ gender: editing.draft.gender === g ? null : g })} style={[s.chip, editing.draft.gender === g && s.chipOn]}>
                          <Text style={[s.chipText, editing.draft.gender === g && { color: '#fff' }]}>{g === 'NAM' ? 'Nam' : 'Nữ'}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
                <Text style={ui.label}>Quốc tịch</Text>
                <TextInput style={ui.input} value={editing.draft.nationality} onChangeText={(t) => set({ nationality: t })} placeholder="Việt Nam" />
                <Text style={ui.label}>Số điện thoại</Text>
                <TextInput style={ui.input} value={editing.draft.phone} onChangeText={(t) => set({ phone: t })} keyboardType="phone-pad" placeholder="Không bắt buộc" />
                <Text style={ui.label}>Ghi chú</Text>
                <TextInput style={ui.input} value={editing.draft.note} onChangeText={(t) => set({ note: t })} placeholder="Trẻ em, người cao tuổi…" />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                  <Button title="Thôi" variant="outline" onPress={() => setEditing(null)} style={{ flex: 1 }} />
                  <Button title="Lưu" onPress={() => save(false)} loading={busy} style={{ flex: 1 }} />
                </View>
                {!editing.id && pax.length + 1 < trip.passengers && (
                  <Button title="Lưu và thêm người tiếp" variant="soft" onPress={() => save(true)} loading={busy} style={{ marginTop: 10 }} />
                )}
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </Card>
  );
}

const s = StyleSheet.create({
  warn: { color: colors.warning, fontWeight: '600' },
  ok: { color: colors.success, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { fontWeight: '700', color: colors.text },
  info: { color: colors.text2, fontSize: 13, marginTop: 2 },
  link: { color: colors.primary, fontWeight: '700' },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 14 },
  chip: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '700', color: colors.text },
});
