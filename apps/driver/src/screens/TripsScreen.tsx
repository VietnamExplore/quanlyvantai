import { useCallback, useEffect, useRef, useState } from 'react';
import { useLoadOnMount } from '../hooks';
import { AppState, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { Icon } from '../icons';
import { chunk, useLayout } from '../layout';
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
  if (trip.status === 'DANG_DEN_DON' || trip.status === 'DA_DON_KHACH') return { kind: 'running' as const, icon: 'navigate', text: 'Đang chạy chuyến này' };
  if (trip.status === 'HOAN_THANH' || trip.status === 'HUY') return null;
  const left = new Date(trip.pickupTime).getTime() - now;
  if (left < 0) return { kind: 'late' as const, icon: 'alert-circle', text: `Trễ giờ đón ${Math.round(-left / MIN)} phút` };
  if (left <= SOON_MS) {
    const m = Math.round(left / MIN);
    return { kind: 'soon' as const, icon: 'time', text: `Còn ${m >= 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${m} phút`} đến giờ đón` };
  }
  return null;
}

const ACCENT = { late: colors.danger, soon: '#d97706', running: '#16a34a' } as const;

function TimingPill({ t }: { t: NonNullable<ReturnType<typeof timing>> }) {
  return (
    <View style={[s.timing, { backgroundColor: `${ACCENT[t.kind]}16` }]}>
      <Icon name={t.icon} size={15} color={ACCENT[t.kind]} />
      <Text style={[s.timingText, { color: ACCENT[t.kind] }]} numberOfLines={1}>
        {t.text}
      </Text>
    </View>
  );
}

/** Cột giờ bên trái thẻ: giờ lớn + ngày */
function TimeBlock({ iso, tone }: { iso: string; tone: string }) {
  return (
    <View style={[s.timeBlock, { backgroundColor: `${tone}12` }]}>
      <Text style={[s.time, { color: tone }]}>{fmtHour(iso)}</Text>
      <Text style={s.timeDate}>{fmtDate(iso).slice(0, 5)}</Text>
    </View>
  );
}

/** Một dòng danh sách: chuyến thường, hoặc cả chuyến xe ghép (gộp các nhóm khách) */
type Item = { kind: 'trip'; trip: Trip } | { kind: 'run'; runId: number; trips: Trip[] };

/** Thẻ chuyến xe ghép: giờ xuất bến, tuyến, số nhóm / khách, tiến độ đón */
function RunCard({ trips, onPress, now, style }: { trips: Trip[]; onPress: () => void; now: number; style?: object }) {
  const first = trips[0];
  const run = first.shuttleRun!;
  const pax = trips.reduce((n, t) => n + t.passengers, 0);
  const picked = trips.filter((t) => t.status === 'DA_DON_KHACH' || t.status === 'HOAN_THANH').reduce((n, t) => n + t.passengers, 0);
  const isNew = trips.some((t) => t.status === 'DA_GAN');
  const status: Trip['status'] = trips.every((t) => t.status === 'HOAN_THANH')
    ? 'HOAN_THANH'
    : trips.some((t) => t.status === 'DANG_DEN_DON' || t.status === 'DA_DON_KHACH')
      ? 'DANG_DEN_DON'
      : isNew
        ? 'DA_GAN'
        : 'TAI_XE_NHAN';
  const t = timing({ ...first, status, pickupTime: run.departAt }, now);
  const bar = t ? ACCENT[t.kind] : isNew ? colors.primary : 'transparent';
  const stops = [...new Set(trips.map((x) => x.shuttlePickupStop?.name ?? x.pickupAddress))];
  return (
    <Card onPress={onPress} style={[s.card, style]}>
      <View style={[s.bar, { backgroundColor: bar }]} />
      {t && <TimingPill t={t} />}
      <View style={s.cardMain}>
        <TimeBlock iso={run.departAt} tone={t ? ACCENT[t.kind] : colors.primary} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={s.cardTop}>
            <View style={s.serviceRow}>
              <Icon name="bus" size={15} color={colors.primary} />
              <Text style={s.service} numberOfLines={1}>
                Xe ghép
              </Text>
            </View>
            <StatusBadge status={status} />
          </View>
          <Text style={s.routeName} numberOfLines={2}>
            {run.route.name}
          </Text>
          <View style={s.placeRow}>
            <Icon name="location" size={15} color={colors.primary} style={{ marginTop: 2 }} />
            <Text style={s.place} numberOfLines={2}>
              {stops.join(' → ')}
            </Text>
          </View>
        </View>
      </View>
      <View style={s.chips}>
        <Chip icon="people" text={`${trips.length} nhóm · ${pax} khách`} />
        {first.vehicle && <Chip icon="car" text={first.vehicle.plateNumber} />}
        {status === 'DANG_DEN_DON' && <Chip tone="green" icon="checkmark-circle" text={`Đã đón ${picked}/${pax}`} />}
      </View>
    </Card>
  );
}

function TripCard({ trip, onPress, now, style }: { trip: Trip; onPress: () => void; now: number; style?: object }) {
  const isNew = trip.status === 'DA_GAN';
  const t = timing(trip, now);
  const bar = t ? ACCENT[t.kind] : isNew ? colors.primary : 'transparent';
  return (
    <Card onPress={onPress} style={[s.card, style]}>
      <View style={[s.bar, { backgroundColor: bar }]} />
      {t && <TimingPill t={t} />}
      <View style={s.cardMain}>
        <TimeBlock iso={trip.pickupTime} tone={t ? ACCENT[t.kind] : colors.primary} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={s.cardTop}>
            <View style={s.serviceRow}>
              <Icon name={trip.serviceType === 'DON_TIEN_SAN_BAY' ? 'airplane' : 'car'} size={15} color={colors.primary} />
              <Text style={s.service} numberOfLines={1}>
                {trip.service?.name ?? SERVICE[trip.serviceType] ?? trip.serviceType}
              </Text>
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
        </View>
      </View>

      <View style={s.chips}>
        <Chip icon="people" text={`${trip.passengers} khách`} />
        {trip.vehicle && <Chip icon="car" text={trip.vehicle.plateNumber} />}
        {trip.flightNumber && <Chip tone="blue" icon="airplane" text={`Đón ${trip.flightNumber}`} />}
        {trip.departureFlight && <Chip tone="blue" icon="airplane" text={`Tiễn ${trip.departureFlight}`} />}
        {!!trip.collectAmount && (
          <Chip
            tone={trip.collectedAt ? 'green' : 'orange'}
            icon={trip.collectedAt ? 'checkmark-circle' : 'cash'}
            text={trip.collectedAt ? `Đã thu ${Number(trip.collectedAmount).toLocaleString('vi-VN')}đ` : `Thu khách ${Number(trip.collectAmount).toLocaleString('vi-VN')}đ`}
          />
        )}
      </View>
    </Card>
  );
}

export function TripsScreen({ onOpen, onOpenRun }: { onOpen: (id: number) => void; onOpenRun: (runId: number) => void }) {
  const L = useLayout();
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // Đồng hồ cho dòng nhắc giờ (cập nhật mỗi phút)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), MIN);
    return () => clearInterval(t);
  }, []);
  // Tab đang xem (đọc trong hàm tải: bỏ kết quả của tab cũ nếu người dùng đã chuyển tab)
  const tabRef = useRef(tab);

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

  // Đổi tab: ghi nhận tab mới rồi tải lại
  const loadTab = useCallback(() => {
    tabRef.current = tab;
    return load();
  }, [tab, load]);
  useLoadOnMount(loadTab);

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
  // Lượt khách xe ghép gộp thành một chuyến xe ghép
  const items: Item[] = [];
  for (const t of trips) {
    const runId = t.shuttleRun?.id;
    const found = runId ? items.find((x) => x.kind === 'run' && x.runId === runId) : undefined;
    if (found && found.kind === 'run') found.trips.push(t);
    else if (runId) items.push({ kind: 'run', runId, trips: [t] });
    else items.push({ kind: 'trip', trip: t });
  }
  const sections: { key: string; title: string; data: Item[] }[] = [];
  for (const it of items) {
    const t = { pickupTime: it.kind === 'trip' ? it.trip.pickupTime : it.trips[0].shuttleRun!.departAt };
    const key = dayKey(t.pickupTime);
    let sec = sections.find((x) => x.key === key);
    if (!sec) {
      const label = dayLabel(t.pickupTime);
      sec = { key, title: label.includes('/') ? label : `${label} · ${fmtDate(t.pickupTime).slice(0, 5)}`, data: [] };
      sections.push(sec);
    }
    sec.data.push(it);
  }

  // Chuyến kế tiếp (đang chạy hoặc giờ đón gần nhất chưa xong) + tổng hôm nay
  const todayKey = dayKey(new Date(now).toISOString());
  const live = trips.filter((t) => t.status !== 'HOAN_THANH' && t.status !== 'HUY');
  const timeOf = (t: Trip) => t.shuttleRun?.departAt ?? t.pickupTime;
  const next = live.find((t) => t.status === 'DANG_DEN_DON' || t.status === 'DA_DON_KHACH') ?? [...live].sort((a, b) => timeOf(a).localeCompare(timeOf(b)))[0];
  const today = live.filter((t) => dayKey(timeOf(t)) === todayKey);
  // Máy tính bảng: thẻ xếp lưới nhiều cột (mỗi hàng là một phần tử danh sách)
  const rows = sections.map((sec) => ({ ...sec, count: sec.data.length, data: chunk(sec.data, L.columns) }));
  const renderOne = (item: Item, style?: object) =>
    item.kind === 'trip' ? <TripCard key={item.trip.id} trip={item.trip} now={now} style={style} onPress={() => onOpen(item.trip.id)} /> : <RunCard key={`run-${item.runId}`} trips={item.trips} now={now} style={style} onPress={() => onOpenRun(item.runId)} />;

  return (
    <View style={{ flex: 1 }}>
      <View style={[s.tabsWrap, { paddingHorizontal: L.pad }]}>
        <View style={s.tabs}>
          {(['active', 'history'] as const).map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
              <Icon name={k === 'active' ? 'car-sport' : 'checkmark-done'} size={17} color={tab === k ? colors.primary : colors.muted} />
              <Text style={[s.tabText, tab === k && s.tabTextActive, L.compact && { fontSize: 13 }]} numberOfLines={1}>
                {k === 'active' ? (L.compact ? 'Sắp tới' : 'Đang chạy & sắp tới') : L.compact ? 'Đã xong' : 'Đã hoàn thành'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === 'active' && next && (
        <View style={[s.summary, { marginHorizontal: L.pad }, L.width < 400 && { flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={s.summaryMain}>
            <Text style={s.summaryLabel}>{next.status === 'DANG_DEN_DON' || next.status === 'DA_DON_KHACH' ? 'ĐANG CHẠY' : 'CHUYẾN KẾ TIẾP'}</Text>
            <Text style={s.summaryTime}>
              {fmtHour(timeOf(next))} <Text style={s.summaryDay}>{dayLabel(timeOf(next))}</Text>
            </Text>
            <Text style={s.summaryPlace} numberOfLines={1}>
              {next.shuttleRun ? next.shuttleRun.route.name : next.pickupAddress}
            </Text>
          </View>
          <View style={[s.summaryStats, L.width < 400 && { alignSelf: 'stretch' }]}>
            <View style={s.stat}>
              <Text style={s.statNum}>{today.length}</Text>
              <Text style={s.statLabel}>chuyến hôm nay</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statNum}>{today.reduce((n, t) => n + t.passengers, 0)}</Text>
              <Text style={s.statLabel}>khách</Text>
            </View>
          </View>
        </View>
      )}

      {tab === 'active' && toCollect.length > 0 && (
        <Pressable onPress={() => onOpen(toCollect[0].id)} style={[s.banner, { marginHorizontal: L.pad }]}>
          <View style={s.bannerIcon}>
            <Icon name="cash" size={20} color="#b45309" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.bannerText}>
              {toCollect.length} chuyến cần thu tiền khách · {toCollect.reduce((x, t) => x + Number(t.collectAmount), 0).toLocaleString('vi-VN')}đ
            </Text>
            <Text style={s.bannerHint}>Bấm để mở chuyến gần nhất</Text>
          </View>
          <Icon name="chevron-forward" size={18} color="#b45309" />
        </Pressable>
      )}

      {error && (
        <Pressable onPress={() => load()} style={[s.errorBox, { marginHorizontal: L.pad }]}>
          <Icon name="cloud-offline-outline" size={20} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={s.errorText}>{error}</Text>
            <Text style={s.errorRetry}>Bấm để thử lại</Text>
          </View>
        </Pressable>
      )}

      <SectionList
        sections={rows}
        keyExtractor={(row) => row.map((it) => (it.kind === 'trip' ? String(it.trip.id) : `run-${it.runId}`)).join('|')}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <View style={s.dayHead}>
            <Text style={[s.dayTitle, section.title.startsWith('Hôm nay') && { color: colors.primary }]}>{section.title}</Text>
            <View style={s.dayCountBox}>
              <Text style={s.dayCount}>{section.count} chuyến</Text>
            </View>
          </View>
        )}
        renderItem={({ item: row }) =>
          L.columns > 1 ? (
            <View style={s.gridRow}>
              {row.map((it) => renderOne(it, { flex: 1, marginBottom: 0 }))}
              {Array.from({ length: L.columns - row.length }, (_, i) => (
                <View key={`pad-${i}`} style={{ flex: 1 }} />
              ))}
            </View>
          ) : (
            renderOne(row[0])
          )
        }
        contentContainerStyle={{ paddingHorizontal: L.pad, paddingTop: 4, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} colors={[colors.primary]} />}
        ListEmptyComponent={
          !loading ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Icon name={tab === 'active' ? 'car-sport-outline' : 'document-text-outline'} size={38} color={colors.primary} />
              </View>
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
  tabsWrap: { paddingTop: 12 },
  tabs: { flexDirection: 'row', backgroundColor: '#e3eaf4', borderRadius: 16, padding: 4 },
  tab: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  tabActive: { backgroundColor: '#fff', ...shadow },
  tabText: { fontSize: 14, color: colors.text2, fontWeight: '600', flexShrink: 1 },
  tabTextActive: { color: colors.primary, fontWeight: '800' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.primaryDark, borderRadius: 20, padding: 14, marginTop: 12 },
  summaryMain: { flex: 1, minWidth: 0 },
  summaryLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  summaryTime: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 2 },
  summaryDay: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  summaryPlace: { color: 'rgba(255,255,255,0.9)', fontSize: 13.5, marginTop: 2 },
  summaryStats: { flexDirection: 'row', gap: 8 },
  stat: { flexGrow: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center', minWidth: 62 },
  statNum: { color: '#fff', fontSize: 20, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 10.5, fontWeight: '700', textAlign: 'center' },
  gridRow: { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'stretch' },
  card: { paddingLeft: 18, overflow: 'hidden' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  timing: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10, maxWidth: '100%' },
  timingText: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
  cardMain: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  timeBlock: { width: 72, borderRadius: 16, paddingVertical: 10, alignItems: 'center', alignSelf: 'flex-start' },
  time: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  timeDate: { fontSize: 12, fontWeight: '700', color: colors.muted, marginTop: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  service: { fontSize: 13, color: colors.text2, fontWeight: '700', flexShrink: 1 },
  routeName: { fontSize: 16, fontWeight: '800', color: colors.text },
  placeRow: { flexDirection: 'row', gap: 6 },
  route: { flexDirection: 'row', gap: 10 },
  routeLine: { alignItems: 'center', paddingTop: 6, width: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  line: { width: 2, flex: 1, minHeight: 16, backgroundColor: '#d5deea', marginVertical: 3 },
  place: { fontSize: 15, color: colors.text, fontWeight: '600', lineHeight: 20, flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fffbeb', borderWidth: 1.5, borderColor: '#fcd34d', borderRadius: 16, padding: 12, marginTop: 10 },
  bannerIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' },
  bannerText: { fontSize: 14.5, fontWeight: '800', color: '#b45309' },
  bannerHint: { fontSize: 12.5, color: colors.text2, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 20 },
  emptyIcon: { width: 84, height: 84, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 16, color: colors.text2, marginTop: 14, fontWeight: '700', textAlign: 'center' },
  emptyHint: { fontSize: 13, color: colors.muted, marginTop: 4 },
  updated: { textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 8 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff1f0', padding: 12, marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: '#ffd6d6' },
  errorText: { color: colors.danger, fontSize: 14 },
  errorRetry: { color: colors.primary, fontSize: 13, marginTop: 4, fontWeight: '700' },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg, paddingTop: 12, paddingBottom: 10 },
  dayTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  dayCountBox: { backgroundColor: '#e3eaf4', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  dayCount: { fontSize: 12.5, color: colors.text2, fontWeight: '700' },
});
