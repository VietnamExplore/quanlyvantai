import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { KEYBOARD_BEHAVIOR, keyboardScroll, MODAL_ORIENTATIONS } from '../platform';
import { BRAND, colors, dayLabel, fmtDate, fmtHour, fmtTime, NEXT_STEP, SERVICE } from '../theme';
import type { Passenger, Trip } from '../types';
import { Button, Card, Chip, QuickAction, Row, Section, StatusBadge, styles as ui } from '../ui';
import { contactGuest, APP_LABEL, guessApp, pickupMessage } from '../contact';
import { CollectCard } from './CollectCard';
import { KmModal, OdometerCard } from './OdometerCard';
import { ContactCard, ContactChooser, type GuestContact } from './ContactCard';
import { SignScreen } from './SignScreen';
import { TripCosts } from './TripCosts';

const LEADER_ROLE: Record<string, string> = { HDV: 'Hướng dẫn viên', TRUONG_DOAN: 'Trưởng đoàn' };
const GENDER: Record<string, string> = { NAM: 'Nam', NU: 'Nữ' };
/** Số khách hiện sẵn; nhiều hơn thì bấm "Xem tất cả" */
const PAX_PREVIEW = 5;

function PassengerRow({ p, onContact }: { p: Passenger; onContact: (c: GuestContact) => void }) {
  const info = [p.gender && GENDER[p.gender], p.nationality].filter(Boolean).join(' · ');
  return (
    <View style={s.paxRow}>
      <View style={s.paxSeqBox}>
        <Text style={s.paxSeq}>{p.seq}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.paxName}>{p.fullName}</Text>
        {(info || p.note) && <Text style={s.paxInfo}>{[info, p.note].filter(Boolean).join(' · ')}</Text>}
      </View>
      {p.phone && (
        <Pressable onPress={() => onContact({ role: 'Khách', name: p.fullName, phone: p.phone })} hitSlop={8} style={({ pressed }) => [s.paxCall, pressed && { opacity: 0.7 }]}>
          <Text style={s.paxCallText}>💬 {APP_LABEL[guessApp(p.phone)]}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Tra giờ bay thực tế (trễ / sớm) của số hiệu chuyến bay */
const openFlight = (flight: string) => Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(`${flight} flight status`)}`);

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
  // Hỏi km đồng hồ: lúc bắt đầu đi đón / lúc hoàn thành / sửa km kết thúc
  const [kmMode, setKmMode] = useState<'start' | 'end' | 'fix' | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [contactY, setContactY] = useState(0);
  // Không mở được ứng dụng của khách: cho chọn cách khác
  const [choosing, setChoosing] = useState<GuestContact | null>(null);
  const contactPax = async (c: GuestContact) => {
    if (!(await contactGuest(c.phone, c.app, c.appId))) setChoosing(c);
  };

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

  async function changeStatus(body: Record<string, unknown>) {
    if (!trip || !next) return;
    setBusy(true);
    try {
      setTrip(await api<Trip>(`/driver/trips/${trip.id}/status`, { method: 'POST', body: { status: next.status, ...body } }));
      setKmMode(null);
    } catch (e) {
      Alert.alert('Không cập nhật được', (e as Error).message);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function saveKm(body: { startKm?: number; endKm?: number }) {
    if (kmMode !== 'fix') return changeStatus(body);
    setBusy(true);
    try {
      setTrip(await api<Trip>(`/driver/trips/${trip!.id}/odometer`, { method: 'POST', body }));
      setKmMode(null);
    } catch (e) {
      Alert.alert('Không lưu được', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function advance() {
    if (!trip || !next) return;
    // Xe công ty: bắt đầu đi đón → ghi km bắt đầu; hoàn thành → nhập km kết thúc
    if (trip.trackKm && next.status === 'DANG_DEN_DON' && trip.startKm == null) return setKmMode('start');
    if (trip.trackKm && next.status === 'HOAN_THANH') return setKmMode('end');
    Alert.alert(next.label, next.confirm, [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Đồng ý',
        onPress: () => changeStatus({}),
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
  // Người liên hệ đón khách: HDV / trưởng đoàn; chưa có thì lấy khách đầu tiên có số điện thoại
  const firstPax = pax.find((p) => p.phone);
  const baseContact: GuestContact | null = b.leaderName || b.leaderPhone || b.leaderAppId
    ? { role: LEADER_ROLE[b.leaderRole ?? ''] ?? 'Người liên hệ', name: b.leaderName ?? 'Người liên hệ', phone: b.leaderPhone ?? null, app: b.leaderApp, appId: b.leaderAppId }
    : firstPax
      ? { role: 'Khách đại diện', name: firstPax.fullName, phone: firstPax.phone }
      : null;
  // Tin nhắn mẫu: giờ đón, điểm đón, biển số xe (tiếng Anh cho khách nước ngoài)
  const msgFor = (c: GuestContact) =>
    pickupMessage({ phone: c.phone, name: c.name, time: `${fmtHour(trip.pickupTime)} ${fmtDate(trip.pickupTime).slice(0, 5)}`, place: trip.pickupAddress, plate: trip.vehicle?.plateNumber ?? null });
  const guestContact = baseContact && { ...baseContact, message: msgFor(baseContact) };
  const service = trip.service?.name ?? SERVICE[trip.serviceType] ?? trip.serviceType;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView {...keyboardScroll} ref={scrollRef} contentContainerStyle={{ padding: 12, paddingBottom: next ? 170 : 40 }}>
        {/* Khối đầu: giờ đón, trạng thái */}
        <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroTop}>
            <Text style={s.heroCode}>{b.code}</Text>
            <StatusBadge status={trip.status} onDark />
          </View>
          <Text style={s.heroTime}>{fmtHour(trip.pickupTime)}</Text>
          <Text style={s.heroDay}>
            {dayLabel(trip.pickupTime)} · {fmtDate(trip.pickupTime)}
          </Text>
          <Text style={s.heroSub}>
            {service} · dự kiến xong {fmtTime(trip.endTime)}
          </Text>
        </LinearGradient>

        {/* Thao tác nhanh */}
        <Card style={s.quickRow}>
          <QuickAction icon="🪧" label="Bảng đón" onPress={() => setSignOpen(true)} />
          <QuickAction icon="🧭" label="Chỉ đường" tone="green" onPress={() => openMap(trip.pickupAddress)} />
          {guestContact && <QuickAction icon="💬" label="Liên hệ" tone="purple" onPress={() => scrollRef.current?.scrollTo({ y: contactY - 12, animated: true })} />}
          {trip.dropoffAddress && <QuickAction icon="🏁" label="Điểm trả" tone="orange" onPress={() => openMap(trip.dropoffAddress!)} />}
        </Card>

        {/* Tuyến đường: đón → lịch trình → trả */}
        <Card>
          <Section icon="🗺️" title="Hành trình" />
          <View style={s.stop}>
            <View style={s.stopRail}>
              <View style={[s.stopDot, { backgroundColor: colors.primary }]} />
              {(trip.itinerary || trip.dropoffAddress) && <View style={s.stopLine} />}
            </View>
            <View style={s.stopBody}>
              <Text style={s.stopLabel}>ĐIỂM ĐÓN</Text>
              <Text style={s.address}>{trip.pickupAddress}</Text>
              <Button title="Chỉ đường" icon="🧭" size="sm" variant="soft" onPress={() => openMap(trip.pickupAddress)} style={s.stopBtn} />
            </View>
          </View>
          {trip.itinerary && (
            <View style={s.stop}>
              <View style={s.stopRail}>
                <View style={[s.stopDot, s.stopDotSmall]} />
                {trip.dropoffAddress && <View style={s.stopLine} />}
              </View>
              <View style={s.stopBody}>
                <Text style={s.stopLabel}>LỊCH TRÌNH</Text>
                <View style={s.itinerary}>
                  <Text style={s.itineraryText}>{trip.itinerary}</Text>
                </View>
              </View>
            </View>
          )}
          {trip.dropoffAddress && (
            <View style={s.stop}>
              <View style={s.stopRail}>
                <View style={[s.stopDot, { backgroundColor: colors.accent }]} />
              </View>
              <View style={[s.stopBody, { paddingBottom: 0 }]}>
                <Text style={s.stopLabel}>ĐIỂM TRẢ</Text>
                <Text style={s.address}>{trip.dropoffAddress}</Text>
                <Button title="Chỉ đường" icon="🧭" size="sm" variant="soft" onPress={() => openMap(trip.dropoffAddress!)} style={s.stopBtn} />
              </View>
            </View>
          )}
        </Card>

        <CollectCard trip={trip} onChanged={setTrip} />

        {guestContact && (
          <View onLayout={(e) => setContactY(e.nativeEvent.layout.y)}>
            <ContactCard contact={guestContact} />
          </View>
        )}

        {/* Thông tin chuyến */}
        <Card>
          <Section icon="ℹ️" title="Thông tin chuyến" />
          <View style={s.chips}>
            <Chip text={`👥 ${trip.passengers} khách`} />
            <Chip text={`🚐 ${trip.vehicle ? trip.vehicle.plateNumber : trip.vehicleType.name}`} />
            {trip.vehicle && <Chip text={trip.vehicleType.name} />}
            {trip.days > 1 && <Chip text={`📅 ${trip.days} ngày`} />}
            {trip.flightNumber && <Chip tone="blue" text={`✈ Đón ${trip.flightNumber}`} />}
            {trip.departureFlight && <Chip tone="blue" text={`✈ Tiễn ${trip.departureFlight}`} />}
          </View>
          <View style={{ marginTop: 10 }}>
            <Row label="Giờ đón khách">
              <Text style={s.pickupStrong}>
                {fmtHour(trip.pickupTime)} · {dayLabel(trip.pickupTime)} {fmtDate(trip.pickupTime)}
              </Text>
            </Row>
            {trip.flightNumber && (
              <Row label="Chuyến bay đón">
                <Text style={s.pickupStrong}>
                  ✈ {trip.flightNumber}
                  {'  '}
                  <Text style={s.flightLink} onPress={() => openFlight(trip.flightNumber!)}>
                    Tra giờ hạ cánh
                  </Text>
                </Text>
              </Row>
            )}
            {trip.departureFlight && (
              <Row label="Chuyến bay tiễn">
                <Text style={s.pickupStrong}>
                  ✈ {trip.departureFlight}
                  {'  '}
                  <Text style={s.flightLink} onPress={() => openFlight(trip.departureFlight!)}>
                    Tra giờ cất cánh
                  </Text>
                </Text>
              </Row>
            )}
          </View>
          {trip.notes && (
            <View style={{ marginTop: 10 }}>
              <Row label="Ghi chú">{trip.notes}</Row>
            </View>
          )}
          {trip.dispatchNote && (
            <View style={s.dispatchNote}>
              <Text style={s.dispatchTitle}>⚠️ Lưu ý từ điều hành</Text>
              <Text style={s.dispatchText}>{trip.dispatchNote}</Text>
            </View>
          )}
        </Card>

        {pax.length > 0 && (
          <Card>
            <Section icon="👥" title={`Đoàn khách · ${pax.length} người`} />
            {(allPax ? pax : pax.slice(0, PAX_PREVIEW)).map((p) => (
              <PassengerRow key={p.seq} p={p} onContact={contactPax} />
            ))}
            {pax.length > PAX_PREVIEW && (
              <Button title={allPax ? 'Thu gọn' : `Xem tất cả ${pax.length} khách`} variant="ghost" size="sm" onPress={() => setAllPax(!allPax)} style={{ marginTop: 6 }} />
            )}
          </Card>
        )}

        <OdometerCard trip={trip} onEditEnd={trip.status === 'HOAN_THANH' ? () => setKmMode('fix') : undefined} />

        {trip.status !== 'DA_GAN' && <TripCosts tripId={trip.id} canAdd={trip.status !== 'HUY'} />}
      </ScrollView>

      {next && (
        <View style={s.bottomBar}>
          {trip.status === 'DA_GAN' ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Từ chối" variant="danger" size="lg" onPress={() => setRejectOpen(true)} style={{ flex: 1 }} />
              <Button title={next.label} size="lg" onPress={advance} loading={busy} style={{ flex: 2 }} />
            </View>
          ) : (
            <Button title={next.label} size="lg" onPress={advance} loading={busy} />
          )}
        </View>
      )}

      {signOpen && <SignScreen trip={trip} onClose={() => setSignOpen(false)} />}
      {choosing && <ContactChooser contact={choosing} onClose={() => setChoosing(null)} />}
      <KmModal trip={trip} mode={kmMode === 'start' ? 'start' : 'end'} visible={!!kmMode} busy={busy} onClose={() => setKmMode(null)} onSubmit={saveKm} />

      <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={rejectOpen} transparent animationType="fade" onRequestClose={() => setRejectOpen(false)}>
        <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR} style={s.modalBg}>
          <View style={[s.modal, { width: '100%', maxWidth: 520, alignSelf: 'center' }]}>
            <Text style={{ fontSize: 19, fontWeight: '800', marginBottom: 4, color: colors.text }}>Từ chối chuyến</Text>
            <Text style={{ fontSize: 14, color: colors.text2, marginBottom: 12 }}>Văn phòng sẽ điều xe khác cho chuyến này.</Text>
            <TextInput placeholderTextColor={colors.muted} style={[ui.input, { minHeight: 80, textAlignVertical: 'top' }]} multiline value={reason} onChangeText={setReason} placeholder="Lý do (ví dụ: xe hỏng, bận việc gia đình…)" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Thôi" variant="soft" onPress={() => setRejectOpen(false)} style={{ flex: 1 }} />
              <Button title="Gửi từ chối" variant="danger" onPress={reject} loading={busy} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hero: { borderRadius: 22, padding: 18, marginBottom: 12 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroCode: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  heroTime: { color: '#fff', fontSize: 44, fontWeight: '800', letterSpacing: -1, marginTop: 6 },
  heroDay: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: -2 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13.5, marginTop: 6 },
  quickRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 8 },
  stop: { flexDirection: 'row', gap: 12 },
  stopRail: { width: 14, alignItems: 'center', paddingTop: 4 },
  stopDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: '#fff', elevation: 2 },
  stopDotSmall: { width: 10, height: 10, borderRadius: 5, borderWidth: 0, backgroundColor: '#c3cfdf', marginTop: 2 },
  stopLine: { width: 2, flex: 1, backgroundColor: '#dbe3ee', marginVertical: 2 },
  stopBody: { flex: 1, paddingBottom: 16 },
  stopLabel: { fontSize: 11.5, fontWeight: '800', color: colors.muted, letterSpacing: 0.8, marginBottom: 2 },
  stopBtn: { alignSelf: 'flex-start', marginTop: 8 },
  address: { fontSize: 16.5, color: colors.text, lineHeight: 23, fontWeight: '500' },
  itinerary: { backgroundColor: '#f4f7fc', borderRadius: 12, padding: 10, marginTop: 2 },
  itineraryText: { fontSize: 15, color: colors.text, lineHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dispatchNote: { backgroundColor: '#fff7e6', borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#ffe2b0' },
  dispatchTitle: { fontWeight: '800', color: colors.warning, marginBottom: 2 },
  dispatchText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  paxRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  paxSeqBox: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  paxSeq: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  paxName: { fontSize: 15, fontWeight: '700', color: colors.text },
  paxInfo: { fontSize: 13, color: colors.muted, marginTop: 2 },
  paxCall: { backgroundColor: colors.primarySoft, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  paxCallText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 18, backgroundColor: 'rgba(255,255,255,0.97)', borderTopLeftRadius: 22, borderTopRightRadius: 22, elevation: 16, shadowColor: '#0b2a5c', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: -4 } },
  modalBg: { flex: 1, backgroundColor: 'rgba(8,24,56,0.45)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 22, padding: 20 },
  pickupStrong: { fontSize: 15.5, fontWeight: '800', color: colors.primary },
  flightLink: { fontSize: 13, fontWeight: '700', color: colors.primary, textDecorationLine: 'underline' },
});
