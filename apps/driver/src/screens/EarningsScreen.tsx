import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import { useLoadOnMount } from '../hooks';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { BRAND, colors, fmtDate, fmtTime } from '../theme';
import { Card, MonthSwitcher, Section, thisMonth } from '../ui';
import { AdvanceCard } from './AdvanceCard';

const vnd = (v: number) => `${Math.round(v).toLocaleString('vi-VN')}đ`;

interface Earnings {
  month: string;
  /** Lái xe đối tác / chưa có hồ sơ lương */
  partner: boolean;
  hasRate?: boolean;
  baseSalary?: number;
  baseAmount?: number;
  trips?: number;
  commission?: number;
  total?: number;
  /** Bảo hiểm lái xe đóng (BHXH, BHYT, BHTN) trừ vào lương */
  insuranceSalary?: number;
  insuranceEmployeePercent?: number;
  insuranceEmployee?: number;
  reimbursement?: number;
  /** Tạm ứng đã nhận trong tháng (trừ lương) */
  advanceTaken?: number;
  netPay?: number;
  pendingTrips?: { id: number; pickupTime: string; booking: { code: string } }[];
  advances?: { category: string; amount: number; date: string; note: string | null; bookingCode: string | null }[];
  holding: { tripId: number; amount: number; collectedAt: string; bookingCode: string }[];
  holdingTotal: number;
}

function Line({ label, hint, value, strong, color }: { label: string; hint?: string; value: string; strong?: boolean; color?: string }) {
  return (
    <View style={s.line}>
      <View style={{ flex: 1 }}>
        <Text style={[s.lineLabel, strong && { fontWeight: '800', color: colors.text }]}>{label}</Text>
        {hint ? <Text style={s.lineHint}>{hint}</Text> : null}
      </View>
      <Text style={[s.lineValue, strong && { fontSize: 17 }, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

/** Thu nhập: lương + % doanh số các chuyến đã hoàn thành trong tháng */
export function EarningsScreen({ onOpenTrip }: { onOpenTrip: (id: number) => void }) {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Earnings>(`/driver/earnings?month=${month}`));
    } catch (e) {
      Alert.alert('Không tải được', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useLoadOnMount(load);

  const d = data;
  const isNow = month === thisMonth();

  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[colors.primary]} />}>
      <MonthSwitcher month={month} onChange={setMonth} />

      {d && d.partner && (
        <Card>
          <Text style={s.notice}>Tài khoản của bạn chưa có hồ sơ lương tại công ty (lái xe đối tác). Liên hệ văn phòng nếu cần.</Text>
        </Card>
      )}

      {d && !d.partner && (
        <>
          <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
            <Text style={s.heroLabel}>{isNow ? 'THỰC NHẬN DỰ KIẾN (TẠM TÍNH)' : 'THỰC NHẬN THÁNG'}</Text>
            <Text style={s.heroValue}>{vnd(d.netPay ?? 0)}</Text>
            <View style={s.heroRow}>
              <View style={s.heroBox}>
                <Text style={s.heroBoxLabel}>Chuyến hoàn thành</Text>
                <Text style={s.heroBoxValue}>{d.trips ?? 0}</Text>
              </View>
              <View style={s.heroBox}>
                <Text style={s.heroBoxLabel}>Tổng hoa hồng</Text>
                <Text style={s.heroBoxValue}>{vnd(d.commission ?? 0)}</Text>
              </View>
            </View>
          </LinearGradient>

          {!d.hasRate && (
            <Card style={s.warnCard}>
              <Text style={s.warnText}>⚠️ Văn phòng chưa cài mức lương / hoa hồng cho bạn tháng này — số liệu dưới đây chưa đầy đủ.</Text>
            </Card>
          )}

          <Card>
            <Section icon="calculator-outline" title="Cách tính" />
            <Line label="Lương cứng" hint={d.baseSalary ? `${vnd(d.baseSalary)}/tháng, tính theo ngày làm` : undefined} value={vnd(d.baseAmount ?? 0)} />
            <Line label="Tổng hoa hồng" hint={`${d.trips ?? 0} chuyến đã hoàn thành`} value={vnd(d.commission ?? 0)} />
            <Line label="Tổng lương" value={vnd(d.total ?? 0)} strong />
            {(d.insuranceEmployee ?? 0) > 0 && (
              <Line
                label="Trừ bảo hiểm (BHXH, BHYT, BHTN)"
                hint={`${String(d.insuranceEmployeePercent ?? 10.5).replace('.', ',')}% × lương đóng bảo hiểm ${vnd(d.insuranceSalary ?? 0)}`}
                value={`− ${vnd(d.insuranceEmployee!)}`}
                color={colors.danger}
              />
            )}
            <Line label="Hoàn tiền bạn chi hộ" hint="Chi phí chuyến + xăng bạn tự trả" value={`+ ${vnd(d.reimbursement ?? 0)}`} color={colors.success} />
            {(d.advanceTaken ?? 0) > 0 && <Line label="Trừ tạm ứng đã nhận" value={`− ${vnd(d.advanceTaken!)}`} color={colors.danger} />}
            <Line label="Thực nhận" value={vnd(d.netPay ?? 0)} strong color={colors.primary} />
            <Text style={s.foot}>Số liệu tạm tính theo chuyến đã hoàn thành. Văn phòng chốt lương cuối tháng.</Text>
          </Card>

          {(d.pendingTrips?.length ?? 0) > 0 && (
            <Card style={s.warnCard}>
              <Text style={s.warnText}>⏳ {d.pendingTrips!.length} chuyến đã qua giờ đón nhưng chưa bấm “Hoàn thành” — chưa được tính hoa hồng:</Text>
              {d.pendingTrips!.map((t) => (
                <Text key={t.id} style={s.pendingItem} onPress={() => onOpenTrip(t.id)}>
                  • {fmtTime(t.pickupTime)} · {t.booking.code} ›
                </Text>
              ))}
            </Card>
          )}
        </>
      )}

      {d && !d.partner && <AdvanceCard netPay={isNow ? (d.netPay ?? 0) : null} onChanged={load} />}

      {d && d.holdingTotal > 0 && (
        <Card style={s.holdCard}>
          <Section icon="cash-outline" title="Tiền thu hộ đang giữ" />
          <Text style={s.holdTotal}>{vnd(d.holdingTotal)}</Text>
          <Text style={s.holdHint}>Tiền mặt thu của khách, cần nộp lại văn phòng.</Text>
          {d.holding.map((h) => (
            <Text key={h.tripId} style={s.pendingItem} onPress={() => onOpenTrip(h.tripId)}>
              • {fmtTime(h.collectedAt)} · {h.bookingCode} · {vnd(h.amount)}
            </Text>
          ))}
        </Card>
      )}

      {d && !d.partner && (d.advances?.length ?? 0) > 0 && (
        <Card>
          <Section icon="receipt-outline" title="Khoản bạn chi hộ (được hoàn)" />
          {d.advances!.map((a, i) => (
            <View key={i} style={s.trip}>
              <View style={{ flex: 1 }}>
                <Text style={s.tripTitle}>
                  {fmtDate(a.date).slice(0, 5)} · {a.category}
                </Text>
                <Text style={s.tripMeta} numberOfLines={1}>
                  {[a.bookingCode, a.note].filter(Boolean).join(' · ') || '—'}
                </Text>
              </View>
              <Text style={s.tripRevenue}>{vnd(a.amount)}</Text>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 20, padding: 18, marginBottom: 12 },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  heroValue: { color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
  heroRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  heroBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, padding: 10 },
  heroBoxLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  heroBoxValue: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 2 },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lineLabel: { fontSize: 15, color: colors.text2, fontWeight: '600' },
  lineHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
  lineValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  foot: { fontSize: 12, color: colors.muted, marginTop: 10 },
  notice: { fontSize: 14.5, color: colors.text2, lineHeight: 21 },
  warnCard: { backgroundColor: '#fffbeb', borderWidth: 1.5, borderColor: '#fde68a' },
  warnText: { fontSize: 14, color: '#92400e', fontWeight: '600', lineHeight: 20 },
  pendingItem: { fontSize: 14, color: colors.primary, marginTop: 6, fontWeight: '600' },
  holdCard: { backgroundColor: '#fff7ed', borderWidth: 1.5, borderColor: '#fdba74' },
  holdTotal: { fontSize: 26, fontWeight: '800', color: '#c2410c' },
  holdHint: { fontSize: 13, color: colors.text2, marginTop: 2 },
  trip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tripTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  tripMeta: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  tripRevenue: { fontSize: 15, fontWeight: '700', color: colors.text },
});
