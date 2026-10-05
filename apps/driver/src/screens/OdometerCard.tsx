import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import type { Trip } from '../types';
import { Button, Card, Section, styles as ui } from '../ui';

const num = (v: number) => v.toLocaleString('vi-VN');

/** Km bắt đầu đã biết: đã ghi trên chuyến, hoặc km kết thúc chuyến trước của xe */
export const knownStartKm = (t: Trip) => t.startKm ?? t.suggestStartKm ?? null;

/**
 * Hộp nhập km đồng hồ:
 * - start: lúc bắt đầu đi đón. Km bắt đầu tự lấy từ chuyến trước; chỉ hỏi khi xe chưa có số km nào.
 * - end: lúc hoàn thành (hoặc sửa lại), nhập km kết thúc.
 */
export function KmModal({
  trip,
  mode,
  visible,
  busy,
  onClose,
  onSubmit,
}: {
  trip: Trip;
  mode: 'start' | 'end';
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: { startKm?: number; endKm?: number }) => void;
}) {
  const known = knownStartKm(trip);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    setStart('');
    setEnd(mode === 'end' && trip.endKm != null ? String(trip.endKm) : '');
    setErr(null);
  }, [visible, mode, trip.endKm]);

  const startVal = known ?? (start ? Number(start) : null);
  const endVal = end ? Number(end) : null;
  const distance = startVal != null && endVal != null ? endVal - startVal : null;

  function submit() {
    if (known == null && !start) return setErr('Nhập số km đồng hồ lúc bắt đầu');
    if (mode === 'start') return onSubmit(known == null ? { startKm: Number(start) } : {});
    if (!end) return setErr('Nhập số km đồng hồ lúc kết thúc');
    if (distance != null && distance < 0) return setErr(`Km kết thúc phải lớn hơn km bắt đầu (${num(startVal!)})`);
    onSubmit({ endKm: Number(end), ...(known == null && { startKm: Number(start) }) });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <Text style={s.title}>{mode === 'start' ? '🛣  Bắt đầu chuyến' : '🏁  Km đồng hồ lúc kết thúc'}</Text>
        {known != null ? (
          <View style={s.startBox}>
            <Text style={s.startLabel}>Km bắt đầu</Text>
            <Text style={s.startValue}>{num(known)}</Text>
            <Text style={s.startHint}>{trip.startKm != null ? 'Đã ghi lúc bắt đầu chuyến' : 'Lấy từ km kết thúc chuyến trước của xe'}</Text>
          </View>
        ) : (
          <>
            <Text style={ui.label}>Km đồng hồ lúc bắt đầu</Text>
            <TextInput style={[ui.input, s.big]} keyboardType="number-pad" placeholder="125430" placeholderTextColor={colors.muted} value={start} onChangeText={(t) => setStart(t.replace(/\D/g, ''))} />
          </>
        )}
        {mode === 'end' && (
          <>
            <Text style={ui.label}>Km đồng hồ lúc kết thúc</Text>
            <TextInput autoFocus style={[ui.input, s.big]} keyboardType="number-pad" placeholder={startVal != null ? String(startVal + 100) : ''} placeholderTextColor={colors.muted} value={end} onChangeText={(t) => setEnd(t.replace(/\D/g, ''))} />
            {distance != null && distance >= 0 && <Text style={s.distance}>Quãng đường chuyến: {num(distance)} km</Text>}
          </>
        )}
        {err && <Text style={ui.error}>{err}</Text>}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Button title="Hủy" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
          <Button title={mode === 'start' ? 'Bắt đầu' : trip.status === 'HOAN_THANH' ? 'Lưu km' : 'Hoàn thành chuyến'} onPress={submit} loading={busy} style={{ flex: 2 }} />
        </View>
      </View>
    </Modal>
  );
}

/** Km chuyến (văn phòng thấy cùng số liệu trên web và tính xăng theo định mức) */
export function OdometerCard({ trip, onEditEnd }: { trip: Trip; onEditEnd?: () => void }) {
  if (!trip.trackKm || (trip.startKm == null && trip.endKm == null)) return null;
  const km = trip.startKm != null && trip.endKm != null ? trip.endKm - trip.startKm : null;
  return (
    <Card>
      <Section icon="🛣" title="Km đồng hồ xe" right={onEditEnd ? <Text style={s.edit} onPress={onEditEnd}>Sửa km</Text> : undefined} />
      <View style={s.grid}>
        <Cell label="Km bắt đầu" value={trip.startKm != null ? num(trip.startKm) : '—'} />
        <Cell label="Km kết thúc" value={trip.endKm != null ? num(trip.endKm) : 'Chưa ghi'} />
        <Cell label="Quãng đường" value={km != null ? `${num(km)} km` : '—'} strong />
      </View>
    </Card>
  );
}

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.cellLabel}>{label}</Text>
      <Text style={[s.cellValue, strong && { color: colors.primary, fontWeight: '800' }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', padding: 20, paddingBottom: 32, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 14 },
  big: { fontSize: 22, fontWeight: '800' },
  startBox: { backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, marginBottom: 12 },
  startLabel: { fontSize: 12.5, color: colors.text2, fontWeight: '600' },
  startValue: { fontSize: 24, fontWeight: '800', color: colors.primary },
  startHint: { fontSize: 12, color: colors.muted },
  distance: { fontSize: 15, fontWeight: '700', color: colors.success, marginTop: -4, marginBottom: 10 },
  grid: { flexDirection: 'row', gap: 8 },
  cellLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  cellValue: { fontSize: 15.5, color: colors.text, fontWeight: '700', marginTop: 2 },
  edit: { fontSize: 13.5, color: colors.primary, fontWeight: '700' },
});
