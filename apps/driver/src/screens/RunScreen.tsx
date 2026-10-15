import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { contactGuest } from '../contact';
import { BRAND, colors, dayLabel, fmtDate, fmtHour } from '../theme';
import type { ShuttleRunDetail, Trip, TripStatus } from '../types';
import { Button, Card, Chip, Section, StatusBadge } from '../ui';
import { DocsCard } from './DocsCard';
import { KmModal } from './OdometerCard';
import { PreCheckCard, PreCheckForm, preCheckPassed } from './PreCheck';

const openMap = (address: string) => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&hl=vi&gl=vn`);

/** Trạng thái chung của cả chuyến ghép → trạng thái "đại diện" để dùng lại thẻ kiểm tra trước chuyến, ô nhập km */
const LEAD_STATUS: Record<ShuttleRunDetail['state'], TripStatus> = { CHUA_CHAY: 'TAI_XE_NHAN', DANG_CHAY: 'DA_DON_KHACH', HOAN_THANH: 'HOAN_THANH' };

/**
 * Chuyến xe ghép (một xe chở nhiều nhóm khách lẻ): xem thứ tự đón theo điểm dừng, kiểm tra trước chuyến một lần,
 * bắt đầu chạy cả chuyến, đánh dấu từng nhóm đã lên xe, hoàn thành cả chuyến.
 */
export function RunScreen({ runId, onOpenTrip }: { runId: number; onOpenTrip: (tripId: number) => void }) {
  const [run, setRun] = useState<ShuttleRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [kmMode, setKmMode] = useState<'start' | 'end' | null>(null);

  const load = useCallback(async () => {
    try {
      setRun(await api<ShuttleRunDetail>(`/driver/runs/${runId}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [runId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <View style={s.center}>
        <Text style={{ color: colors.danger, textAlign: 'center', marginBottom: 16 }}>{error}</Text>
        <Button title="Thử lại" variant="outline" onPress={load} />
      </View>
    );
  }
  if (!run) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // "Chuyến đại diện" của cả chuyến ghép: dùng lại thẻ kiểm tra trước chuyến, giấy tờ, ô nhập km
  const lead: Trip = {
    ...run.groups[0],
    status: LEAD_STATUS[run.state],
    preCheckRequired: run.preCheckRequired,
    preCheck: run.preCheck,
    trackKm: run.trackKm,
    suggestStartKm: run.suggestStartKm,
    startKm: run.startKm,
    endKm: run.endKm,
    orderPath: run.orderPath,
    booking: { ...run.groups[0].booking, code: run.route.code, contract: null },
  };
  const toAccept = run.groups.filter((g) => g.status === 'DA_GAN');
  const picked = run.groups.filter((g) => g.status === 'DA_DON_KHACH' || g.status === 'HOAN_THANH');
  const pickedPax = picked.reduce((n, g) => n + g.passengers, 0);

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
      setKmMode(null);
      await load();
    } catch (e) {
      Alert.alert('Không cập nhật được', (e as Error).message);
      load();
    } finally {
      setBusy(null);
    }
  }

  // Nhận chuyến: nhận mọi nhóm khách chưa nhận
  const accept = () =>
    Alert.alert('Nhận chuyến xe ghép', `Nhận ${toAccept.length} nhóm khách của chuyến ${fmtHour(run.departAt)}?`, [
      { text: 'Không', style: 'cancel' },
      { text: 'Nhận chuyến', onPress: () => act('accept', async () => { for (const g of toAccept) await api(`/driver/trips/${g.id}/status`, { method: 'POST', body: { status: 'TAI_XE_NHAN' } }); }) },
    ]);

  const start = (startKm?: number) => act('start', () => api(`/driver/runs/${runId}/start`, { method: 'POST', body: startKm === undefined ? {} : { startKm } }));
  function askStart() {
    if (run!.preCheckRequired && !preCheckPassed(run!.preCheck)) {
      return Alert.alert('Kiểm tra trước chuyến', run!.preCheck?.driverOk === false ? 'Lần kiểm tra gần nhất chưa đạt. Báo điều hành; khi đủ điều kiện thì kiểm tra lại.' : 'Cần đo nồng độ cồn, kiểm tra sức khỏe, giấy tờ và xe trước khi bắt đầu chuyến.', [
        { text: 'Để sau', style: 'cancel' },
        { text: 'Kiểm tra ngay', onPress: () => setCheckOpen(true) },
      ]);
    }
    if (run!.trackKm && run!.startKm == null && run!.preCheck?.odometerKm == null) return setKmMode('start');
    Alert.alert('Bắt đầu chạy', 'Bắt đầu chạy chuyến xe ghép, đi đón các nhóm khách?', [
      { text: 'Không', style: 'cancel' },
      { text: 'Bắt đầu', onPress: () => start() },
    ]);
  }

  const finish = (endKm?: number) => act('finish', () => api(`/driver/runs/${runId}/finish`, { method: 'POST', body: endKm === undefined ? {} : { endKm } }));
  function askFinish() {
    const missing = run!.groups.filter((g) => g.status === 'DANG_DEN_DON');
    const go = () => (run!.trackKm ? setKmMode('end') : finish());
    if (missing.length) {
      return Alert.alert('Còn nhóm chưa đón', `${missing.length} nhóm chưa bấm "Đã lên xe": ${missing.map((g) => g.booking.code).join(', ')}. Vẫn hoàn thành chuyến? (văn phòng sẽ được báo)`, [
        { text: 'Quay lại', style: 'cancel' },
        { text: 'Vẫn hoàn thành', style: 'destructive', onPress: go },
      ]);
    }
    if (run!.trackKm) return setKmMode('end');
    Alert.alert('Hoàn thành chuyến', 'Đã trả hết khách, hoàn thành chuyến xe ghép?', [
      { text: 'Không', style: 'cancel' },
      { text: 'Hoàn thành', onPress: () => finish() },
    ]);
  }

  const pickGroup = (g: Trip) =>
    Alert.alert('Nhóm khách đã lên xe', `${g.booking.leaderName ?? g.booking.contactName ?? g.booking.code} · ${g.passengers} khách`, [
      { text: 'Không', style: 'cancel' },
      { text: 'Đã lên xe', onPress: () => act(`pick-${g.id}`, () => api(`/driver/trips/${g.id}/status`, { method: 'POST', body: { status: 'DA_DON_KHACH' } })) },
    ]);

  // Nhóm theo điểm đón
  const byStop: { name: string; time: string | null; address: string | null; groups: Trip[] }[] = [];
  for (const g of run.groups) {
    const name = g.shuttlePickupStop?.name ?? g.pickupAddress;
    let b = byStop.find((x) => x.name === name);
    if (!b) {
      const stop = run.route.stops.find((st) => st.name === g.shuttlePickupStop?.name);
      byStop.push((b = { name, time: g.pickupTime, address: stop?.address ?? g.pickupAddress, groups: [] }));
    }
    b.groups.push(g);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: run.state === 'HOAN_THANH' ? 40 : 130 }}>
        <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroTop}>
            <Text style={s.heroCode}>🚌 XE GHÉP · {run.route.code}</Text>
            <View style={s.stateBox}>
              <Text style={s.stateText}>{run.state === 'HOAN_THANH' ? 'Hoàn thành' : run.state === 'DANG_CHAY' ? 'Đang chạy' : toAccept.length ? 'Chờ nhận' : 'Đã nhận'}</Text>
            </View>
          </View>
          <Text style={s.heroTime}>{fmtHour(run.departAt)}</Text>
          <Text style={s.heroDay}>
            {dayLabel(run.departAt)} · {fmtDate(run.departAt)}
          </Text>
          <Text style={s.heroSub}>{run.route.name}</Text>
          <Text style={s.heroSub}>
            {run.vehicle?.plateNumber ?? ''} · {run.groups.length} nhóm · {run.passengers}/{run.capacity} khách
            {run.state === 'DANG_CHAY' ? ` · đã đón ${pickedPax}/${run.passengers}` : ''}
          </Text>
        </LinearGradient>

        <PreCheckCard trip={lead} onOpen={() => setCheckOpen(true)} />

        {run.dispatchNote && (
          <Card style={s.note}>
            <Text style={s.noteTitle}>⚠️ Lưu ý từ điều hành</Text>
            <Text style={s.noteText}>{run.dispatchNote}</Text>
          </Card>
        )}

        <Card>
          <Section icon="📍" title="Thứ tự đón" />
          {byStop.map((st, i) => (
            <View key={st.name} style={[s.stop, i > 0 && s.stopBorder]}>
              <View style={s.stopHead}>
                <View style={s.stopNo}>
                  <Text style={s.stopNoText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.stopName}>{st.name}</Text>
                  <Text style={s.stopInfo}>
                    {st.time ? `Đón ${fmtHour(st.time)}` : ''} · {st.groups.reduce((n, g) => n + g.passengers, 0)} khách
                  </Text>
                </View>
                {st.address && <Button title="Chỉ đường" icon="🧭" size="sm" variant="soft" onPress={() => openMap(st.address!)} />}
              </View>
              {st.groups.map((g) => {
                const name = g.booking.leaderName ?? g.booking.contactName ?? g.booking.customer?.name ?? g.booking.code;
                const phone = g.booking.leaderPhone ?? g.booking.contactPhone ?? null;
                return (
                  <View key={g.id} style={s.group}>
                    <Pressable onPress={() => onOpenTrip(g.id)} style={{ flex: 1 }}>
                      <Text style={s.groupName}>
                        {name} · {g.passengers} khách
                      </Text>
                      <Text style={s.groupInfo}>
                        {g.booking.code}
                        {g.shuttleDropoffStop ? ` · xuống ${g.shuttleDropoffStop.name}` : g.dropoffAddress ? ` · xuống ${g.dropoffAddress}` : ''}
                      </Text>
                      {g.pickupAddress && g.pickupAddress !== st.name && <Text style={s.groupInfo}>🏨 {g.pickupAddress}</Text>}
                      <View style={s.groupChips}>
                        <StatusBadge status={g.status} />
                        {!!g.collectAmount && !g.collectedAt && <Chip text={`💵 Thu ${Number(g.collectAmount).toLocaleString('vi-VN')}đ`} />}
                        {g.notes ? <Chip text={`📝 ${g.notes}`} /> : null}
                      </View>
                    </Pressable>
                    <View style={{ gap: 6, alignItems: 'flex-end' }}>
                      {phone && <Button title="Gọi" icon="📞" size="sm" variant="soft" onPress={() => contactGuest(phone, g.booking.leaderApp, g.booking.leaderAppId)} />}
                      {g.status === 'DANG_DEN_DON' && <Button title="Đã lên xe" size="sm" loading={busy === `pick-${g.id}`} onPress={() => pickGroup(g)} />}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
          <Text style={s.hint}>Bấm vào tên nhóm để xem danh sách khách, bảng đón, thu tiền, chi phí.</Text>
        </Card>

        <DocsCard trip={lead} />
      </ScrollView>

      {run.state !== 'HOAN_THANH' && (
        <View style={s.bottomBar}>
          {toAccept.length > 0 ? (
            <Button title={`NHẬN CHUYẾN (${toAccept.length} nhóm)`} size="lg" loading={busy === 'accept'} onPress={accept} />
          ) : run.state === 'CHUA_CHAY' ? (
            <Button title="BẮT ĐẦU CHẠY" size="lg" loading={busy === 'start'} onPress={askStart} />
          ) : (
            <Button title="HOÀN THÀNH CHUYẾN" size="lg" loading={busy === 'finish'} onPress={askFinish} />
          )}
        </View>
      )}

      {checkOpen && <PreCheckForm trip={lead} onClose={() => setCheckOpen(false)} onSaved={() => load()} />}
      <KmModal
        trip={lead}
        mode={kmMode === 'start' ? 'start' : 'end'}
        visible={!!kmMode}
        busy={!!busy}
        onClose={() => setKmMode(null)}
        onSubmit={(b) => (kmMode === 'start' ? start(b.startKm) : finish(b.endKm))}
      />
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hero: { borderRadius: 22, padding: 18, marginBottom: 12 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroCode: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  stateBox: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  stateText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  heroTime: { color: '#fff', fontSize: 44, fontWeight: '800', letterSpacing: -1, marginTop: 6 },
  heroDay: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: -2 },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: 14, marginTop: 6 },
  note: { backgroundColor: '#fff7e6', borderWidth: 1, borderColor: '#ffe2b0' },
  noteTitle: { fontWeight: '800', color: colors.warning, marginBottom: 2 },
  noteText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  stop: { paddingVertical: 10 },
  stopBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stopHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  stopNo: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stopNoText: { color: '#fff', fontWeight: '800' },
  stopName: { fontSize: 16, fontWeight: '800', color: colors.text },
  stopInfo: { fontSize: 13, color: colors.muted, marginTop: 1 },
  group: { flexDirection: 'row', gap: 10, backgroundColor: '#f6f8fc', borderRadius: 14, padding: 10, marginTop: 6, marginLeft: 40 },
  groupName: { fontSize: 15, fontWeight: '700', color: colors.text },
  groupInfo: { fontSize: 13, color: colors.text2, marginTop: 2 },
  groupChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  hint: { fontSize: 12.5, color: colors.muted, marginTop: 8 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 18, backgroundColor: 'rgba(255,255,255,0.97)', borderTopLeftRadius: 22, borderTopRightRadius: 22, elevation: 16, shadowColor: '#0b2a5c', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: -4 } },
});
