import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { notifyChanges } from '../notify';
import { colors, dayLabel, fmtDate, fmtHour, SERVICE } from '../theme';
import type { Trip } from '../types';
import { Card, StatusBadge } from '../ui';

const POLL_MS = 30_000;
const MIN = 60_000;
/** Chuyến bắt đầu trong khoảng này được làm nổi "sắp đến giờ" */
const SOON_MS = 2 * 60 * MIN;

/** Ngày (giờ máy) dạng YYYY-MM-DD để nhóm chuyến */
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Nhắc giờ: đang chạy / trễ giờ đón / còn bao lâu nữa đến giờ đón */
function timing(trip: Trip, now: number) {
  if (trip.status === 'DANG_DEN_DON' || trip.status === 'DA_DON_KHACH') return { kind: 'running' as const, text: '🚐 Đang chạy' };
  if (trip.status === 'HOAN_THANH' || trip.status === 'HUY') return null;
  const left = new Date(trip.pickupTime).getTime() - now;
  if (left < 0) return { kind: 'late' as const, text: `⚠️ Trễ giờ đón ${Math.round(-left / MIN)} phút` };
  if (left <= SOON_MS) {
    const m = Math.round(left / MIN);
    return { kind: 'soon' as const, text: `⏰ Còn ${m >= 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${m} phút`} đến giờ đón` };
  }
  return null;
}

function TripCard({ trip, onPress, now }: { trip: Trip; onPress: () => void; now: number }) {
  const isNew = trip.status === 'DA_GAN';
  const t = timing(trip, now);
  const accent = t?.kind === 'late' ? s.lateCard : t?.kind === 'soon' ? s.soonCard : t?.kind === 'running' ? s.runningCard : isNew ? s.newCard : undefined;
  return (
    <Card onPress={onPress} style={accent}>
      {t && <Text style={[s.timing, t.kind === 'late' ? { color: colors.danger } : t.kind === 'running' ? { color: '#389e0d' } : { color: '#d46b08' }]}>{t.text}</Text>}
      <View style={s.cardTop}>
        <Text style={s.time}>{fmtHour(trip.pickupTime)}</Text>
        <StatusBadge status={trip.status} />
      </View>
      <Text style={s.service}>{trip.service?.name ?? SERVICE[trip.serviceType] ?? trip.serviceType}{trip.flightNumber ? ` · ✈ Đón ${trip.flightNumber}` : ''}{trip.departureFlight ? ` · ✈ Tiễn ${trip.departureFlight}` : ''}</Text>
      <Text style={s.place} numberOfLines={2}>📍 {trip.pickupAddress}</Text>
      {trip.dropoffAddress && <Text style={s.place} numberOfLines={2}>🏁 {trip.dropoffAddress}</Text>}
      <Text style={s.meta}>
        👥 {trip.passengers} khách{trip.vehicle ? ` · 🚐 ${trip.vehicle.plateNumber}` : ''}
      </Text>
    </Card>
  );
}

export function TripsScreen({ onOpen }: { onOpen: (id: number) => void }) {
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // Đồng hồ cho dòng nhắc giờ (cập nhật mỗi phút)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), MIN);
    return () => clearInterval(t);
  }, []);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const scope = tabRef.current;
      const data = await api<Trip[]>(`/driver/trips?scope=${scope}`);
      if (scope !== tabRef.current) return;
      setTrips(data);
      setError(null);
      setUpdatedAt(new Date());
      if (scope === 'active') await notifyChanges(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [tab, load]);

  // Tự kiểm tra chuyến mới mỗi 30 giây khi app đang mở; tải lại khi mở app từ nền
  useEffect(() => {
    const timer = setInterval(() => AppState.currentState === 'active' && load(true), POLL_MS);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load(true));
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [load]);

  // Nhóm chuyến theo ngày đón: Hôm nay / Ngày mai / các ngày sau
  const sections: { key: string; title: string; data: Trip[] }[] = [];
  for (const t of trips) {
    const key = dayKey(t.pickupTime);
    let sec = sections.find((x) => x.key === key);
    if (!sec) {
      const label = dayLabel(t.pickupTime);
      sec = { key, title: label.includes('/') ? label : `${label} · ${fmtDate(t.pickupTime).slice(0, 5)}`, data: [] };
      sections.push(sec);
    }
    sec.data.push(t);
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={s.tabs}>
        {(['active', 'history'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabActive]}>
            <Text style={[s.tabText, tab === k && s.tabTextActive]}>{k === 'active' ? 'Chuyến của tôi' : 'Đã hoàn thành'}</Text>
          </Pressable>
        ))}
      </View>

      {error && (
        <Pressable onPress={() => load()} style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
          <Text style={s.errorRetry}>Bấm để thử lại</Text>
        </Pressable>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(t) => String(t.id)}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <View style={s.dayHead}>
            <Text style={[s.dayTitle, section.title.startsWith('Hôm nay') && { color: colors.primary }]}>{section.title}</Text>
            <Text style={s.dayCount}>{section.data.length} chuyến</Text>
          </View>
        )}
        renderItem={({ item }) => <TripCard trip={item} now={now} onPress={() => onOpen(item.id)} />}
        contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} colors={[colors.primary]} />}
        ListEmptyComponent={
          !loading ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 40 }}>{tab === 'active' ? '🛣️' : '📋'}</Text>
              <Text style={s.emptyText}>{tab === 'active' ? 'Chưa có chuyến nào được giao' : 'Chưa có chuyến hoàn thành trong 30 ngày'}</Text>
              <Text style={s.emptyHint}>Kéo xuống để tải lại</Text>
            </View>
          ) : null
        }
        ListFooterComponent={updatedAt ? <Text style={s.updated}>Cập nhật lúc {fmtHour(updatedAt.toISOString())} · tự làm mới mỗi 30 giây</Text> : null}
      />
    </View>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: colors.card, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 15, color: colors.text2 },
  tabTextActive: { color: colors.primary, fontWeight: '700' },
  newCard: { borderLeftWidth: 4, borderLeftColor: colors.primary },
  soonCard: { borderLeftWidth: 5, borderLeftColor: '#fa8c16', backgroundColor: '#fffaf0' },
  lateCard: { borderLeftWidth: 5, borderLeftColor: colors.danger, backgroundColor: '#fff5f5' },
  runningCard: { borderLeftWidth: 5, borderLeftColor: '#52c41a' },
  timing: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', backgroundColor: colors.bg, paddingTop: 6, paddingBottom: 8 },
  dayTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  dayCount: { fontSize: 13, color: colors.muted },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  time: { fontSize: 22, fontWeight: '700', color: colors.text },
  day: { fontSize: 15, fontWeight: '500', color: colors.text2 },
  service: { fontSize: 13, color: colors.muted, marginBottom: 6 },
  place: { fontSize: 15, color: colors.text, marginBottom: 3 },
  meta: { fontSize: 14, color: colors.text2, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 16, color: colors.text2, marginTop: 12 },
  emptyHint: { fontSize: 13, color: colors.muted, marginTop: 4 },
  updated: { textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 8 },
  errorBox: { backgroundColor: '#fff1f0', padding: 12, margin: 12, marginBottom: 0, borderRadius: 10 },
  errorText: { color: colors.danger, fontSize: 14 },
  errorRetry: { color: colors.primary, fontSize: 13, marginTop: 4 },
});
