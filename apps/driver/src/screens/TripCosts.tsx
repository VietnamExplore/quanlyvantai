import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { colors, fmtDate } from '../theme';
import type { CostCategory, TripCost } from '../types';
import { Button, Card, styles as ui } from '../ui';

const vnd = (v: number | string) => `${Number(v).toLocaleString('vi-VN')}đ`;

/** Chi phí chuyến do lái xe nhập: xăng dầu, cầu đường, ăn ở… */
export function TripCosts({ tripId, canAdd }: { tripId: number; canAdd: boolean }) {
  const [costs, setCosts] = useState<TripCost[]>([]);
  const [categories, setCategories] = useState<CostCategory[]>([]);
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setCosts(await api<TripCost[]>(`/driver/trips/${tripId}/costs`));
    } catch {
      /* chưa có quyền xem (chuyến chưa nhận) */
    }
  }, [tripId]);

  useEffect(() => {
    load();
    api<CostCategory[]>('/cost-categories')
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
      setCosts(await api<TripCost[]>(`/driver/trips/${tripId}/costs`, { method: 'POST', body: { categoryCode: category, amount: value, note: note.trim() || null } }));
      setAdding(false);
      setCategory(null);
      setAmount('');
      setNote('');
    } catch (e) {
      Alert.alert('Không lưu được', (e as Error).message);
    } finally {
      setBusy(false);
    }
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
        <Text style={s.section}>Chi phí chuyến</Text>
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
          {c.byDriver && (
            <Pressable onPress={() => remove(c)} hitSlop={10} style={{ marginLeft: 10 }}>
              <Text style={{ color: colors.danger, fontSize: 18 }}>✕</Text>
            </Pressable>
          )}
        </View>
      ))}

      {canAdd && !adding && <Button title="+ Thêm chi phí" variant="outline" onPress={() => setAdding(true)} style={{ marginTop: 10 }} />}
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
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Hủy" variant="ghost" onPress={() => setAdding(false)} style={{ flex: 1 }} />
            <Button title="Lưu chi phí" onPress={add} loading={busy} style={{ flex: 2 }} />
          </View>
        </View>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  section: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  total: { fontSize: 16, fontWeight: '700', color: colors.text },
  empty: { color: colors.muted, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { fontSize: 15, color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '600', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  chipActive: { borderColor: colors.primary, backgroundColor: '#e6f0fb' },
  chipText: { fontSize: 14, color: colors.text2 },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
});
