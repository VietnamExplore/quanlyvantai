import { useCallback, useState } from 'react';
import { useLoadOnMount } from '../hooks';
import { Alert, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { KEYBOARD_BEHAVIOR, MODAL_ORIENTATIONS, sheetFrame } from '../platform';
import { colors, fmtDate } from '../theme';
import { Button, Card, Section, styles as ui } from '../ui';

const vnd = (v: number | string) => `${Math.round(Number(v)).toLocaleString('vi-VN')}đ`;

type AdvanceStatus = 'CHO_DUYET' | 'DA_CHI' | 'TU_CHOI' | 'DA_HUY';

interface AdvanceRequest {
  id: number;
  amount: string;
  reason: string;
  status: AdvanceStatus;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  voucher: { amount: string; date: string; method: string } | null;
}

const STATUS: Record<AdvanceStatus, { label: string; color: string; bg: string }> = {
  CHO_DUYET: { label: 'Chờ duyệt', color: '#b45309', bg: '#fff3e2' },
  DA_CHI: { label: 'Đã nhận tiền', color: '#15803d', bg: '#e7f7ee' },
  TU_CHOI: { label: 'Không duyệt', color: '#b91c1c', bg: '#fdecec' },
  DA_HUY: { label: 'Đã hủy', color: colors.muted, bg: '#f1f4f9' },
};

const REASONS = ['Ứng lương giữa tháng', 'Việc gia đình', 'Chi phí cá nhân'];

/**
 * Lái xe đề nghị tạm ứng: gửi số tiền + lý do, văn phòng duyệt trên web.
 * Tiền đã ứng trừ vào thực nhận cuối tháng.
 */
export function AdvanceCard({ netPay, onChanged }: { netPay: number | null; onChanged: () => void }) {
  const [list, setList] = useState<AdvanceRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await api<AdvanceRequest[]>('/driver/advances'));
    } catch {
      /* mất mạng: giữ danh sách cũ */
    }
  }, []);

  useLoadOnMount(load);

  const pending = list.find((r) => r.status === 'CHO_DUYET');

  async function send() {
    const value = Number(amount);
    if (!value) return Alert.alert('Nhập số tiền cần ứng');
    if (!reason.trim()) return Alert.alert('Nhập lý do tạm ứng');
    const doSend = async () => {
      setBusy(true);
      try {
        await api('/driver/advances', { method: 'POST', body: { amount: value, reason: reason.trim() } });
        setOpen(false);
        setAmount('');
        setReason('');
        await load();
        Alert.alert('Đã gửi đề nghị', 'Văn phòng sẽ xem và báo lại cho bạn qua app.');
      } catch (e) {
        Alert.alert('Không gửi được', (e as Error).message);
      } finally {
        setBusy(false);
      }
    };
    if (netPay !== null && value > netPay) {
      Alert.alert('Vượt thu nhập tạm tính', `Số tiền xin ứng (${vnd(value)}) lớn hơn thu nhập tạm tính hiện tại (${vnd(Math.max(0, netPay))}). Vẫn gửi đề nghị?`, [
        { text: 'Sửa lại', style: 'cancel' },
        { text: 'Vẫn gửi', onPress: doSend },
      ]);
    } else doSend();
  }

  function cancel(r: AdvanceRequest) {
    Alert.alert('Hủy đề nghị tạm ứng?', `${vnd(r.amount)} – ${r.reason}`, [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Hủy đề nghị',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/driver/advances/${r.id}/cancel`, { method: 'POST' });
            await load();
            onChanged();
          } catch (e) {
            Alert.alert('Không hủy được', (e as Error).message);
          }
        },
      },
    ]);
  }

  return (
    <Card>
      <Section icon="🤝" title="Tạm ứng" />
      {pending ? (
        <View style={s.pendingBox}>
          <Text style={s.pendingText}>⏳ Đang chờ văn phòng duyệt {vnd(pending.amount)}</Text>
          <Pressable onPress={() => cancel(pending)} hitSlop={8}>
            <Text style={s.cancel}>Hủy</Text>
          </Pressable>
        </View>
      ) : (
        <Button title="Đề nghị tạm ứng" icon="✍️" variant="soft" onPress={() => setOpen(true)} />
      )}

      {list.length > 0 && (
        <View style={{ marginTop: 8 }}>
          {list.slice(0, 8).map((r) => {
            const st = STATUS[r.status];
            return (
              <View key={r.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>
                    {vnd(r.voucher ? r.voucher.amount : r.amount)}
                    {r.voucher && Number(r.voucher.amount) !== Number(r.amount) ? <Text style={s.rowMeta}> (xin {vnd(r.amount)})</Text> : null}
                  </Text>
                  <Text style={s.rowMeta} numberOfLines={2}>
                    {fmtDate(r.createdAt).slice(0, 5)} · {r.reason}
                    {r.decisionNote ? `\nVăn phòng: ${r.decisionNote}` : ''}
                  </Text>
                </View>
                <View style={[s.badge, { backgroundColor: st.bg }]}>
                  <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
      <Text style={s.foot}>Tiền tạm ứng được trừ vào thực nhận của tháng nhận tiền.</Text>

      <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR} style={{ flex: 1 }}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)} />
        <View style={[s.sheet, sheetFrame]}>
          <Text style={s.sheetTitle}>Đề nghị tạm ứng</Text>
          {netPay !== null && (
            <Text style={s.hint}>
              Thu nhập tạm tính tháng này còn: <Text style={{ fontWeight: '800', color: colors.primary }}>{vnd(Math.max(0, netPay))}</Text>
            </Text>
          )}
          <Text style={ui.label}>Số tiền cần ứng (đồng)</Text>
          <TextInput
            style={[ui.input, { fontSize: 22, fontWeight: '800' }]}
            keyboardType="number-pad"
            placeholder="2.000.000"
            placeholderTextColor={colors.muted}
            value={amount ? Number(amount).toLocaleString('vi-VN') : ''}
            onChangeText={(t) => setAmount(t.replace(/\D/g, ''))}
          />
          <Text style={ui.label}>Lý do</Text>
          <View style={s.chips}>
            {REASONS.map((r) => (
              <Pressable key={r} onPress={() => setReason(r)} style={[s.chip, reason === r && s.chipActive]}>
                <Text style={[s.chipText, reason === r && s.chipTextActive]}>{r}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={ui.input} placeholder="Hoặc ghi lý do khác…" placeholderTextColor={colors.muted} value={reason} onChangeText={setReason} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Hủy" variant="ghost" onPress={() => setOpen(false)} style={{ flex: 1 }} />
            <Button title="Gửi đề nghị" onPress={send} loading={busy} style={{ flex: 2 }} />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </Card>
  );
}


const s = StyleSheet.create({
  pendingBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff3e2', borderRadius: 12, padding: 12, gap: 10 },
  pendingText: { flex: 1, fontSize: 14.5, fontWeight: '700', color: '#b45309' },
  cancel: { fontSize: 14, fontWeight: '700', color: colors.danger },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12.5, color: colors.muted, marginTop: 2, fontWeight: '400' },
  badge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  foot: { fontSize: 12, color: colors.muted, marginTop: 10 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', padding: 20, paddingBottom: 32, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 8 },
  hint: { fontSize: 14, color: colors.text2, marginBottom: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#f4f7fc' },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 13.5, color: colors.text2 },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
});
