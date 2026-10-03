import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { colors, fmtTime, NEXT_STEP, SERVICE } from '../theme';
import type { Trip } from '../types';
import { Button, Card, Row, StatusBadge, styles as ui } from '../ui';

const openMap = (address: string) =>
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`);

export function TripDetailScreen({ tripId, onBack }: { tripId: number; onBack: () => void }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      setTrip(await api<Trip>(`/driver/trips/${tripId}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  const next = trip ? NEXT_STEP[trip.status] : undefined;

  function advance() {
    if (!trip || !next) return;
    Alert.alert(next.label, next.confirm, [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Đồng ý',
        onPress: async () => {
          setBusy(true);
          try {
            setTrip(await api<Trip>(`/driver/trips/${trip.id}/status`, { method: 'POST', body: { status: next.status } }));
          } catch (e) {
            Alert.alert('Không cập nhật được', (e as Error).message);
            load();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  async function reject() {
    if (!reason.trim()) return Alert.alert('Vui lòng nhập lý do từ chối');
    setBusy(true);
    try {
      await api(`/driver/trips/${tripId}/reject`, { method: 'POST', body: { reason } });
      setRejectOpen(false);
      Alert.alert('Đã từ chối chuyến', 'Văn phòng sẽ điều xe khác.', [{ text: 'OK', onPress: onBack }]);
    } catch (e) {
      Alert.alert('Không từ chối được', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <View style={s.center}>
        <Text style={{ color: colors.danger, textAlign: 'center', marginBottom: 16 }}>{error}</Text>
        <Button title="Quay lại" variant="outline" onPress={onBack} />
      </View>
    );
  }
  if (!trip) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const phone = trip.booking.contactPhone;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 140 }}>
        <Card>
          <View style={s.headRow}>
            <Text style={s.code}>{trip.booking.code}</Text>
            <StatusBadge status={trip.status} />
          </View>
          <Text style={s.time}>{fmtTime(trip.pickupTime)}</Text>
          <Text style={s.sub}>
            {SERVICE[trip.serviceType]} · dự kiến xong {fmtTime(trip.endTime)}
          </Text>
        </Card>

        <Card>
          <Text style={s.section}>Điểm đón</Text>
          <Text style={s.address}>{trip.pickupAddress}</Text>
          <Button title="🧭 Chỉ đường đến điểm đón" variant="outline" onPress={() => openMap(trip.pickupAddress)} style={{ marginTop: 8 }} />
          {trip.dropoffAddress && (
            <>
              <Text style={[s.section, { marginTop: 16 }]}>Điểm trả</Text>
              <Text style={s.address}>{trip.dropoffAddress}</Text>
              <Button title="🧭 Chỉ đường đến điểm trả" variant="outline" onPress={() => openMap(trip.dropoffAddress!)} style={{ marginTop: 8 }} />
            </>
          )}
        </Card>

        <Card>
          <Text style={s.section}>Khách hàng</Text>
          <Row label="Liên hệ">{trip.booking.contactName}</Row>
          {trip.booking.customer && <Row label="Đơn vị">{trip.booking.customer.name}</Row>}
          <Row label="Số khách">{`${trip.passengers} khách`}</Row>
          {trip.flightNumber && <Row label="Chuyến bay">{trip.flightNumber}</Row>}
          <View style={s.contactRow}>
            <Button title={`📞 Gọi ${phone}`} onPress={() => Linking.openURL(`tel:${phone}`)} style={{ flex: 1 }} />
            <Button title="💬 Nhắn tin" variant="outline" onPress={() => Linking.openURL(`sms:${phone}`)} style={{ flex: 0.6 }} />
          </View>
        </Card>

        <Card>
          <Text style={s.section}>Xe & ghi chú</Text>
          <Row label="Xe">{trip.vehicle ? `${trip.vehicle.plateNumber} (${trip.vehicleType.name})` : trip.vehicleType.name}</Row>
          {trip.days > 1 && <Row label="Số ngày">{`${trip.days} ngày`}</Row>}
          {trip.itinerary && <Row label="Lịch trình">{trip.itinerary}</Row>}
          {trip.notes && <Row label="Ghi chú">{trip.notes}</Row>}
          {trip.dispatchNote && (
            <View style={s.dispatchNote}>
              <Text style={{ fontWeight: '700', color: colors.warning, marginBottom: 2 }}>Lưu ý từ điều hành</Text>
              <Text style={{ fontSize: 15, color: colors.text }}>{trip.dispatchNote}</Text>
            </View>
          )}
        </Card>
      </ScrollView>

      {next && (
        <View style={s.bottomBar}>
          <Button title={next.label} onPress={advance} loading={busy} big />
          {trip.status === 'DA_GAN' && <Button title="Từ chối chuyến" variant="danger" onPress={() => setRejectOpen(true)} style={{ marginTop: 8 }} />}
        </View>
      )}

      <Modal visible={rejectOpen} transparent animationType="fade" onRequestClose={() => setRejectOpen(false)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Từ chối chuyến</Text>
            <TextInput placeholderTextColor={colors.muted} style={[ui.input, { minHeight: 80, textAlignVertical: 'top' }]} multiline value={reason} onChangeText={setReason} placeholder="Lý do (ví dụ: xe hỏng, bận việc gia đình…)" />
            <Button title="Gửi từ chối" variant="danger" onPress={reject} loading={busy} />
            <Button title="Thôi" variant="ghost" onPress={() => setRejectOpen(false)} style={{ marginTop: 4 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  time: { fontSize: 26, fontWeight: '700', color: colors.text, marginTop: 6 },
  sub: { fontSize: 14, color: colors.text2, marginTop: 2 },
  section: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', marginBottom: 4 },
  address: { fontSize: 17, color: colors.text, lineHeight: 23 },
  contactRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  dispatchNote: { backgroundColor: '#fffbe6', borderRadius: 8, padding: 10, marginTop: 10 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 20, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 14, padding: 20 },
});
