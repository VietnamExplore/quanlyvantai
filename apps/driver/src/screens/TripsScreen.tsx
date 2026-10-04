import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { notifyChanges } from '../notify';
import { colors, dayLabel, fmtHour, SERVICE } from '../theme';
import type { Trip } from '../types';
import { Card, StatusBadge } from '../ui';

const POLL_MS = 30_000;

function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const isNew = trip.status === 'DA_GAN';
  return (
    <Card onPress={onPress} style={isNew ? s.newCard : undefined}>
      <View style={s.cardTop}>
        <Text style={s.time}>
          {fmtHour(trip.pickupTime)} <Text style={s.day}>· {dayLabel(trip.pickupTime)}</Text>
        </Text>
        <StatusBadge status={trip.status} />
      </View>
      <Text style={s.service}>{trip.service?.name ?? SERVICE[trip.serviceType] ?? trip.serviceType}{trip.flightNumber ? ` · ✈ Đón ${trip.flightNumber}` : ''}{trip.departureFlight ? ` · ✈ Tiễn ${trip.departureFlight}` : ''}</Text>
      <Text style={s.place} numberOfLines={2}>📍 {trip.pickupAddress}</Text>
      {trip.dropoffAddress && <Text style={s.place} numberOfLines={2}>🏁 {trip.dropoffAddress}</Text>}
      <Text style={s.meta}>
        👤 {trip.booking.contactName} · {trip.passengers} khách{trip.vehicle ? ` · 🚐 ${trip.vehicle.plateNumber}` : ''}
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

      <FlatList
        data={trips}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => <TripCard trip={item} onPress={() => onOpen(item.id)} />}
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
