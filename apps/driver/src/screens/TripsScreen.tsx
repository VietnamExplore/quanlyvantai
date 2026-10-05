import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { colors, dayLabel, fmtDate, fmtHour, SERVICE, shadow } from '../theme';
import type { Trip } from '../types';
import { Card, Chip, StatusBadge } from '../ui';

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
  if (trip.status === 'DANG_DEN_DON' || trip.status === 'DA_DON_KHACH') return { kind: 'running' as const, text: '🚐 Đang chạy chuyến này' };
  if (trip.status === 'HOAN_THANH' || trip.status === 'HUY') return null;
  const left = new Date(trip.pickupTime).getTime() - now;
  if (left < 0) return { kind: 'late' as const, text: `⚠️ Trễ giờ đón ${Math.round(-left / MIN)} phút` };
  if (left <= SOON_MS) {
    const m = Math.round(left / MIN);
    return { kind: 'soon' as const, text: `⏰ Còn ${m >= 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${m} phút`} đến giờ đón` };
  }
  return null;
}

const ACCENT = { late: colors.danger, soon: '#f59e0b', running: '#16a34a' } as const;

function TripCard({ trip, onPress, now }: { trip: Trip; onPress: () => void; now: number }) {
  const isNew = trip.status === 'DA_GAN';
  const t = timing(trip, now);
  const bar = t ? ACCENT[t.kind] : isNew ? colors.primary : 'transparent';
  return (
    <Card onPress={onPress} style={s.card}>
      <View style={[s.bar, { backgroundColor: bar }]} />
      {t && (
        <View style={[s.timing, { backgroundColor: `${ACCENT[t.kind]}14` }]}>
          <Text style={[s.timingText, { color: ACCENT[t.kind] }]}>{t.text}</Text>
        </View>
      )}
      <View style={s.cardTop}>
        <View>
          <Text style={s.time}>{fmtHour(trip.pickupTime)}</Text>
          <Text style={s.service}>{trip.service?.name ?? SERVICE[trip.serviceType] ?? trip.serviceType}</Text>
        </View>
        <StatusBadge status={trip.status} />
      </View>

      {/* Tuyến: điểm đón → điểm trả */}
      <View style={s.route}>
        <View style={s.routeLine}>
          <View style={[s.dot, { backgroundColor: colors.primary }]} />
          {trip.dropoffAddress && <View style={s.line} />}
          {trip.dropoffAddress && <View style={[s.dot, { backgroundColor: colors.accent }]} />}
        </View>
        <View style={{ flex: 1, gap: 10 }}>
          <Text style={s.place} numberOfLines={2}>
            {trip.pickupAddress}
          </Text>
          {trip.dropoffAddress && (
            <Text style={s.place} numberOfLines={2}>
              {trip.dropoffAddress}
            </Text>
          )}
        </View>
      </View>

      <View style={s.chips}>
        <Chip text={`👥 ${trip.passengers} khách`} />
        {trip.vehicle && <Chip text={`🚐 ${trip.vehicle.plateNumber}`} />}
        {trip.flightNumber && <Chip tone="blue" text={`✈ Đón ${trip.flightNumber}`} />}
        {trip.departureFlight && <Chip tone="blue" text={`✈ Tiễn ${trip.departureFlight}`} />}
        {!!trip.collectAmount && (
          <View style={[s.collect, trip.collectedAt && s.collectDone]}>
            <Text style={[s.collectText, trip.collectedAt && { color: colors.success }]}>
              {trip.collectedAt ? `✅ Đã thu ${Number(trip.collectedAmount).toLocaleString("vi-VN")}đ` : `💵 Thu khách ${Number(trip.collectAmount).toLocaleString("vi-VN")}đ`}
            </Text>
          </View>
        )}
      </View>
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

  const toCollect = trips.filter((t) => !!t.collectAmount && !t.collectedAt && t.status !== "HUY");

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
      <View style={s.tabsWrap}>
        <View style={s.tabs}>
          {(['active', 'history'] as const).map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabActive]}>
              <Text style={[s.tabText, tab === k && s.tabTextActive]}>{k === 'active' ? '🚐  Đang chạy & sắp tới' : '✅  Đã hoàn thành'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === "active" && toCollect.length > 0 && (
        <Pressable onPress={() => onOpen(toCollect[0].id)} style={s.banner}>
          <Text style={s.bannerText}>💵  {toCollect.length} chuyến cần thu tiền khách · {toCollect.reduce((x, t) => x + Number(t.collectAmount), 0).toLocaleString("vi-VN")}đ</Text>
          <Text style={s.bannerHint}>Bấm để mở chuyến gần nhất ›</Text>
        </Pressable>
      )}

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
            <View style={s.dayCountBox}>
              <Text style={s.dayCount}>{section.data.length} chuyến</Text>
            </View>
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
  tabsWrap: { paddingHorizontal: 12, paddingTop: 12 },
  tabs: { flexDirection: 'row', backgroundColor: '#dde7f5', borderRadius: 14, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 11 },
  tabActive: { backgroundColor: '#fff', ...shadow },
  tabText: { fontSize: 14, color: colors.text2, fontWeight: '600' },
  tabTextActive: { color: colors.primary, fontWeight: '800' },
  card: { paddingLeft: 20, overflow: 'hidden' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  timing: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  timingText: { fontSize: 13, fontWeight: '800' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  time: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  service: { fontSize: 13, color: colors.muted, fontWeight: '600', marginTop: -2 },
  route: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  routeLine: { alignItems: 'center', paddingTop: 6, width: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  line: { width: 2, flex: 1, minHeight: 18, backgroundColor: '#d5deea', marginVertical: 3 },
  place: { fontSize: 15.5, color: colors.text, fontWeight: '500', lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  collect: { backgroundColor: '#fff3e2', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  collectDone: { backgroundColor: '#e7f7ee' },
  collectText: { fontSize: 13, fontWeight: '800', color: '#b45309' },
  banner: { backgroundColor: '#fffbeb', borderWidth: 1.5, borderColor: '#fbbf24', borderRadius: 14, padding: 12, marginHorizontal: 12, marginTop: 10 },
  bannerText: { fontSize: 15, fontWeight: '800', color: '#b45309' },
  bannerHint: { fontSize: 12.5, color: colors.text2, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 16, color: colors.text2, marginTop: 12, fontWeight: '600' },
  emptyHint: { fontSize: 13, color: colors.muted, marginTop: 4 },
  updated: { textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 8 },
  errorBox: { backgroundColor: '#fff1f0', padding: 12, margin: 12, marginBottom: 0, borderRadius: 14, borderWidth: 1, borderColor: '#ffd6d6' },
  errorText: { color: colors.danger, fontSize: 14 },
  errorRetry: { color: colors.primary, fontSize: 13, marginTop: 4, fontWeight: '700' },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg, paddingTop: 8, paddingBottom: 10 },
  dayTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  dayCountBox: { backgroundColor: '#dde7f5', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  dayCount: { fontSize: 12.5, color: colors.text2, fontWeight: '700' },
});
