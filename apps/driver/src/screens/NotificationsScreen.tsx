import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import type { AppNotification } from '../notify';
import { colors, fmtTime, shadow } from '../theme';

/** Biểu tượng theo loại thông báo */
const ICON: Record<string, string> = {
  TRIP_NEW: '🚐',
  TRIP_MOVED: '↪️',
  TRIP_CHANGED: '🕘',
  TRIP_CANCELLED: '❌',
  COLLECT_REQUEST: '💵',
  COLLECT_SETTLED: '✅',
  ADVANCE_DONE: '🤝',
};

/** Danh sách thông báo của lái xe; bấm thông báo về chuyến thì mở chuyến đó */
export function NotificationsScreen({ onOpenTrip, onChanged }: { onOpenTrip: (id: number) => void; onChanged: () => void }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems((await api<{ items: AppNotification[] }>('/notifications?limit=50')).items);
    } catch {
      /* mất mạng: giữ danh sách cũ */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function open(n: AppNotification) {
    if (!n.readAt) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
      onChanged();
    }
    if (n.tripId && n.type !== 'TRIP_MOVED' && n.type !== 'TRIP_CANCELLED') onOpenTrip(n.tripId);
  }

  async function readAll() {
    await api('/notifications/read-all', { method: 'POST' }).catch(() => undefined);
    setItems((list) => list.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    onChanged();
  }

  const unread = items.filter((n) => !n.readAt).length;
  return (
    <FlatList
      data={items}
      keyExtractor={(n) => String(n.id)}
      contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[colors.primary]} />}
      ListHeaderComponent={
        unread > 0 ? (
          <Pressable onPress={readAll} style={s.readAll} hitSlop={8}>
            <Text style={s.readAllText}>✓ Đánh dấu đã đọc hết ({unread})</Text>
          </Pressable>
        ) : null
      }
      ListEmptyComponent={
        !loading ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 40 }}>🔔</Text>
            <Text style={s.emptyText}>Chưa có thông báo</Text>
          </View>
        ) : null
      }
      renderItem={({ item: n }) => (
        <Pressable onPress={() => open(n)} style={({ pressed }) => [s.item, !n.readAt && s.unread, pressed && { opacity: 0.85 }]}>
          <Text style={s.icon}>{ICON[n.type] ?? '🔔'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, !n.readAt && { fontWeight: '800' }]}>{n.title}</Text>
            <Text style={s.body}>{n.body}</Text>
            <Text style={s.time}>{fmtTime(n.createdAt)}</Text>
          </View>
          {!n.readAt && <View style={s.dot} />}
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  item: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, ...shadow },
  unread: { backgroundColor: '#eef5ff', borderWidth: 1, borderColor: '#cfe1fd' },
  icon: { fontSize: 22, lineHeight: 26 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, color: colors.text2, marginTop: 2, lineHeight: 20 },
  time: { fontSize: 12, color: colors.muted, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 6 },
  readAll: { alignSelf: 'flex-end', marginBottom: 10 },
  readAllText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 16, color: colors.text2, marginTop: 12, fontWeight: '600' },
});
