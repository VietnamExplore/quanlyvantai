import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, PanResponder, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { api } from '../api';
import { KEYBOARD_BEHAVIOR, MODAL_ORIENTATIONS, sheetFrame } from '../platform';
import { colors, fmtDate, fmtHour } from '../theme';
import type { Trip } from '../types';
import { Button, Card, Section, styles as ui } from '../ui';

/** Khung chuẩn lưu chữ ký (văn phòng hiển thị theo khung này) */
const W = 600;
const H = 300;

type Point = [number, number];

/** Các nét → SVG path (chấm đơn thành nét ngắn để vẫn hiện) */
const toPath = (list: Point[][]) =>
  list
    .filter((s) => s.length)
    .map((s) => s.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ') + (s.length === 1 ? ` L${s[0][0] + 1} ${s[0][1]}` : ''))
    .join(' ');

/** Bảng ký bằng ngón tay: trả về SVG path đã quy đổi về khung 600×300 */
function SignaturePad({ onChange }: { onChange: (path: string) => void }) {
  const [strokes, setStrokes] = useState<Point[][]>([]);
  // Kích thước khung + các nét đã vẽ: chỉ đọc / ghi trong các hàm xử lý chạm (không dùng khi vẽ giao diện)
  const box = useRef({ w: 1, h: 1 });
  const drawn = useRef<Point[][]>([]);

  const scale = (x: number, y: number): Point => [
    Math.max(0, Math.min(W, Math.round((x / box.current.w) * W))),
    Math.max(0, Math.min(H, Math.round((y / box.current.h) * H))),
  ];
  const publish = () => setStrokes(drawn.current.map((s) => [...s]));

  // Tạo một lần; các hàm bên trong chỉ chạy khi ngón tay chạm vào bảng ký
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        drawn.current.push([scale(e.nativeEvent.locationX, e.nativeEvent.locationY)]);
        publish();
      },
      onPanResponderMove: (e) => {
        const stroke = drawn.current[drawn.current.length - 1];
        if (!stroke) return;
        const p = scale(e.nativeEvent.locationX, e.nativeEvent.locationY);
        const last = stroke[stroke.length - 1];
        // Bỏ điểm quá sát nhau cho chữ ký gọn
        if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 3) return;
        stroke.push(p);
        publish();
      },
      onPanResponderRelease: () => onChange(toPath(drawn.current)),
    }),
  );

  const onLayout = (e: LayoutChangeEvent) => {
    box.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
  };

  return (
    <View>
      <View style={s.pad} onLayout={onLayout} {...responder.panHandlers}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" pointerEvents="none">
          <Path d={toPath(strokes)} stroke="#0f1b2d" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
        {!strokes.length && (
          <Text style={s.padHint} pointerEvents="none">
            Ký tên vào đây
          </Text>
        )}
        <View style={s.padLine} pointerEvents="none" />
      </View>
      <Button
        title="Ký lại"
        icon="refresh"
        size="sm"
        variant="ghost"
        onPress={() => {
          drawn.current = [];
          setStrokes([]);
          onChange('');
        }}
        style={{ alignSelf: 'flex-end', marginTop: 4 }}
      />
    </View>
  );
}

/** Chữ ký đã lưu (vẽ lại từ SVG path) */
export function SignatureView({ svg, height = 90 }: { svg: string; height?: number }) {
  return (
    <View style={{ height, aspectRatio: W / H, alignSelf: 'flex-start' }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Path d={svg} stroke="#0f1b2d" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}

/**
 * Ký nhận điện tử: đến nơi trả khách, lái xe đưa điện thoại cho trưởng đoàn / HDV ký xác nhận đã hoàn thành chuyến.
 * Hiện khi đã đón khách hoặc đã hoàn thành.
 */
export function SignoffCard({ trip, onSigned }: { trip: Trip; onSigned: (t: Pick<Trip, 'signoffName' | 'signoffAt'>) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  if (trip.status !== 'DA_DON_KHACH' && trip.status !== 'HOAN_THANH') return null;

  const b = trip.booking;
  const suggest = b.leaderName || b.passengers?.[0]?.fullName || (!b.customer ? b.contactName : '') || '';

  const start = () => {
    setName(trip.signoffName || suggest);
    setNote('');
    setPath('');
    setOpen(true);
  };

  const save = async () => {
    if (!path) return Alert.alert('Chưa có chữ ký', 'Mời khách ký vào khung trắng.');
    if (!name.trim()) return Alert.alert('Nhập họ tên người ký');
    setBusy(true);
    try {
      const r = await api<{ signoffName: string; signoffAt: string }>(`/driver/trips/${trip.id}/signoff`, { method: 'POST', body: { name, svg: path, note } });
      onSigned(r);
      setOpen(false);
    } catch (e) {
      Alert.alert('Không lưu được chữ ký', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Section icon="create-outline" title="Khách ký nhận" />
      {trip.signoffAt ? (
        <>
          <Text style={s.done}>
            ✔ {trip.signoffName} đã ký lúc {fmtHour(trip.signoffAt)} {fmtDate(trip.signoffAt)}
          </Text>
          <Button title="Ký lại" size="sm" variant="ghost" onPress={start} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
        </>
      ) : (
        <>
          <Text style={s.hint}>Khi trả khách, mời trưởng đoàn / HDV ký xác nhận đã hoàn thành chuyến ngay trên điện thoại.</Text>
          <Button title="Mời khách ký nhận" icon="create-outline" onPress={start} style={{ marginTop: 10 }} />
        </>
      )}

      <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR} style={[{ flex: 1, padding: 16 }, sheetFrame]}>
            <Text style={s.title}>Xác nhận hoàn thành chuyến</Text>
            <Text style={s.sub}>
              {b.code} · {fmtHour(trip.pickupTime)} {fmtDate(trip.pickupTime)} · {trip.passengers} khách
            </Text>
            <Text style={s.sub}>
              {trip.pickupAddress}
              {trip.dropoffAddress ? ` → ${trip.dropoffAddress}` : ''}
            </Text>
            <Text style={s.legal}>Tôi xác nhận đã được phục vụ chuyến xe trên đầy đủ, an toàn.</Text>
            <SignaturePad onChange={setPath} />
            <Text style={s.label}>Họ tên người ký</Text>
            <TextInput style={ui.input} value={name} onChangeText={setName} placeholder="Trưởng đoàn / HDV" />
            <Text style={s.label}>Góp ý (không bắt buộc)</Text>
            <TextInput style={ui.input} value={note} onChangeText={setNote} placeholder="Ý kiến của khách về chuyến đi" />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Button title="Thôi" variant="outline" onPress={() => setOpen(false)} style={{ flex: 1 }} />
              <Button title="Lưu chữ ký" onPress={save} loading={busy} style={{ flex: 2 }} />
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </Card>
  );
}

const s = StyleSheet.create({
  pad: {
    width: '100%',
    aspectRatio: W / H,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
    marginTop: 12,
  },
  padHint: { position: 'absolute', top: '40%', width: '100%', textAlign: 'center', color: colors.muted, fontSize: 16 },
  padLine: { position: 'absolute', left: '8%', right: '8%', bottom: '22%', height: 1, backgroundColor: colors.border },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  sub: { color: colors.text2, marginTop: 4 },
  legal: { marginTop: 12, color: colors.text, fontStyle: 'italic' },
  label: { marginTop: 12, marginBottom: 4, color: colors.text2, fontWeight: '600' },
  done: { color: colors.success, fontWeight: '700' },
  hint: { color: colors.text2, fontSize: 14 },
});
