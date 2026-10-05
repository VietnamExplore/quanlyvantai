import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { colors, fmtTime } from '../theme';
import type { Trip } from '../types';
import { Button, Card, styles as ui } from '../ui';

const vnd = (v: number | string) => `${Number(v).toLocaleString('vi-VN')}đ`;

/** Văn phòng nhờ lái xe thu tiền khách: nhắc số tiền + nút xác nhận đã thu */
export function CollectCard({ trip, onChanged }: { trip: Trip; onChanged: (t: Trip) => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'TIEN_MAT' | 'CHUYEN_KHOAN'>('TIEN_MAT');
  const [busy, setBusy] = useState(false);
  if (!trip.collectAmount) return null;

  const done = !!trip.collectedAt;
  const canConfirm = !done && trip.status !== 'DA_GAN' && trip.status !== 'HUY';

  function start() {
    setAmount(String(Number(trip.collectAmount)));
    setMethod('TIEN_MAT');
    setOpen(true);
  }

  async function confirm() {
    const value = Number(amount.replace(/\D/g, ''));
    if (!value) return Alert.alert('Nhập số tiền đã thu');
    const doConfirm = async () => {
      setBusy(true);
      try {
        onChanged(await api<Trip>(`/driver/trips/${trip.id}/collect`, { method: 'POST', body: { amount: value, method } }));
        setOpen(false);
      } catch (e) {
        Alert.alert('Không xác nhận được', (e as Error).message);
      } finally {
        setBusy(false);
      }
    };
    if (value !== Number(trip.collectAmount)) {
      Alert.alert('Số tiền khác yêu cầu', `Văn phòng nhờ thu ${vnd(trip.collectAmount!)}, bạn ghi đã thu ${vnd(value)}. Vẫn xác nhận?`, [
        { text: 'Sửa lại', style: 'cancel' },
        { text: 'Xác nhận', onPress: doConfirm },
      ]);
    } else doConfirm();
  }

  return (
    <Card style={[s.card, done ? s.cardDone : s.cardTodo]}>
      <View style={s.head}>
        <Text style={[s.title, { color: done ? colors.success : '#b45309' }]}>{done ? '✅  ĐÃ THU TIỀN KHÁCH' : '💵  CẦN THU TIỀN KHÁCH'}</Text>
      </View>
      <Text style={[s.amount, { color: done ? colors.success : '#b45309' }]}>{vnd(done ? trip.collectedAmount! : trip.collectAmount)}</Text>
      {trip.collectNote ? <Text style={s.note}>📝 {trip.collectNote}</Text> : null}
      {done ? (
        <Text style={s.meta}>
          {trip.collectMethod === 'CHUYEN_KHOAN' ? 'Khách chuyển khoản' : 'Tiền mặt'} · lúc {fmtTime(trip.collectedAt!)}
          {trip.collectMethod !== 'CHUYEN_KHOAN' ? '\nNhớ nộp lại tiền cho văn phòng.' : ''}
        </Text>
      ) : canConfirm ? (
        <Button title="XÁC NHẬN ĐÃ THU TIỀN" icon="💵" onPress={start} style={{ marginTop: 12 }} />
      ) : (
        <Text style={s.meta}>Nhận chuyến xong mới xác nhận thu tiền được.</Text>
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)} />
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>Xác nhận đã thu tiền khách</Text>
          <Text style={ui.label}>Số tiền đã thu (đồng)</Text>
          <TextInput
            style={[ui.input, { fontSize: 22, fontWeight: '800' }]}
            keyboardType="number-pad"
            value={amount ? Number(amount).toLocaleString('vi-VN') : ''}
            onChangeText={(t) => setAmount(t.replace(/\D/g, ''))}
          />
          <Text style={ui.label}>Khách trả bằng</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {(['TIEN_MAT', 'CHUYEN_KHOAN'] as const).map((m) => (
              <Pressable key={m} onPress={() => setMethod(m)} style={[s.opt, method === m && s.optActive]}>
                <Text style={[s.optText, method === m && s.optTextActive]}>{m === 'TIEN_MAT' ? '💵 Tiền mặt' : '🏦 Chuyển khoản'}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Hủy" variant="ghost" onPress={() => setOpen(false)} style={{ flex: 1 }} />
            <Button title="Xác nhận đã thu" onPress={confirm} loading={busy} style={{ flex: 2 }} />
          </View>
        </View>
      </Modal>
    </Card>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1.5 },
  cardTodo: { borderColor: '#fbbf24', backgroundColor: '#fffbeb' },
  cardDone: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  amount: { fontSize: 30, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
  note: { fontSize: 14.5, color: colors.text, marginTop: 6 },
  meta: { fontSize: 13.5, color: colors.text2, marginTop: 8, lineHeight: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', padding: 20, paddingBottom: 32, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 16 },
  opt: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f4f7fc' },
  optActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optText: { fontSize: 15, color: colors.text2, fontWeight: '600' },
  optTextActive: { color: colors.primary, fontWeight: '800' },
});
