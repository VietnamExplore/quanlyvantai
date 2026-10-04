import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { colors, fmtTime, NEXT_STEP, SERVICE } from '../theme';
import type { Passenger, Trip } from '../types';
import { Button, Card, Row, StatusBadge, styles as ui } from '../ui';
import { SignScreen } from './SignScreen';
import { TripCosts } from './TripCosts';

const LEADER_ROLE: Record<string, string> = { HDV: 'Hướng dẫn viên', TRUONG_DOAN: 'Trưởng đoàn' };
const GENDER: Record<string, string> = { NAM: 'Nam', NU: 'Nữ' };
/** Số khách hiện sẵn; nhiều hơn thì bấm "Xem tất cả" */
const PAX_PREVIEW = 5;

const call = (phone: string) => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);

function PassengerRow({ p }: { p: Passenger }) {
  const info = [p.gender && GENDER[p.gender], p.nationality].filter(Boolean).join(' · ');
  return (
    <View style={s.paxRow}>
      <Text style={s.paxSeq}>{p.seq}.</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.paxName}>{p.fullName}</Text>
        {(info || p.note) && <Text style={s.paxInfo}>{[info, p.note].filter(Boolean).join(' · ')}</Text>}
      </View>
      {p.phone && (
        <Pressable onPress={() => call(p.phone!)} hitSlop={8} style={s.paxCall}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>📞 {p.phone}</Text>
        </Pressable>
      )}
    </View>
  );
}

const openMap = (address: string) =>
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`);

export function TripDetailScreen({ tripId, onBack }: { tripId: number; onBack: () => void }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [signOpen, setSignOpen] = useState(false);
  const [allPax, setAllPax] = useState(false);

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

  const b = trip.booking;
  const pax = b.passengers ?? [];
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
            {trip.service?.name ?? SERVICE[trip.serviceType] ?? trip.serviceType} · dự kiến xong {fmtTime(trip.endTime)}
          </Text>
          <Button title="🪧 Mở bảng đón khách" onPress={() => setSignOpen(true)} style={{ marginTop: 12 }} />
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
          <Text style={s.section}>Thông tin chuyến</Text>
          <Row label="Số khách">{`${trip.passengers} khách`}</Row>
          {trip.flightNumber && <Row label="Chuyến bay đón">{trip.flightNumber}</Row>}
          {trip.departureFlight && <Row label="Chuyến bay tiễn">{trip.departureFlight}</Row>}
        </Card>

        {(b.leaderName || pax.length > 0) && (
          <Card>
            <Text style={s.section}>Đoàn khách{pax.length ? ` (${pax.length} người)` : ''}</Text>
            {b.leaderName && (
              <View style={s.leader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.leaderRole}>{LEADER_ROLE[b.leaderRole ?? ''] ?? 'Người liên hệ trong chuyến'}</Text>
                  <Text style={s.leaderName}>{b.leaderName}</Text>
                </View>
                {b.leaderPhone && <Button title={`📞 ${b.leaderPhone}`} onPress={() => call(b.leaderPhone!)} />}
              </View>
            )}
            {(allPax ? pax : pax.slice(0, PAX_PREVIEW)).map((p) => (
              <PassengerRow key={p.seq} p={p} />
            ))}
            {pax.length > PAX_PREVIEW && (
              <Button
                title={allPax ? 'Thu gọn' : `Xem tất cả ${pax.length} khách`}
                variant="ghost"
                onPress={() => setAllPax(!allPax)}
                style={{ marginTop: 4 }}
              />
            )}
          </Card>
        )}

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
        {trip.status !== 'DA_GAN' && <TripCosts tripId={trip.id} canAdd={trip.status !== 'HUY'} />}
      </ScrollView>

      {next && (
        <View style={s.bottomBar}>
          <Button title={next.label} onPress={advance} loading={busy} big />
          {trip.status === 'DA_GAN' && <Button title="Từ chối chuyến" variant="danger" onPress={() => setRejectOpen(true)} style={{ marginTop: 8 }} />}
        </View>
      )}

      {signOpen && <SignScreen trip={trip} onClose={() => setSignOpen(false)} />}

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
  dispatchNote: { backgroundColor: '#fffbe6', borderRadius: 8, padding: 10, marginTop: 10 },
  leader: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#eef5ff', borderRadius: 10, padding: 10, marginTop: 6, marginBottom: 6 },
  leaderRole: { fontSize: 12, color: colors.primary, fontWeight: '700', textTransform: 'uppercase' },
  leaderName: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 2 },
  paxRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  paxSeq: { width: 26, color: colors.muted, fontSize: 14 },
  paxName: { fontSize: 15, fontWeight: '600', color: colors.text },
  paxInfo: { fontSize: 13, color: colors.muted, marginTop: 2 },
  paxCall: { marginLeft: 8 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 20, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 14, padding: 20 },
});
