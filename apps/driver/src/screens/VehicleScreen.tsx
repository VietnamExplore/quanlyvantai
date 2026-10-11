import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { colors } from '../theme';
import type { Incident, VehicleCheck, VehicleCheckState } from '../types';
import { Button, Card, Section, styles as ui } from '../ui';
import { IncidentRow, IncidentSheet } from './IncidentSheet';
import { CheckRow } from './PreCheck';

/** Tab Kiểm tra: hướng dẫn kiểm tra trước chuyến, lịch sử kiểm tra, báo sự cố ngoài chuyến */
export function VehicleScreen() {
  const [state, setState] = useState<VehicleCheckState | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [incidentOpen, setIncidentOpen] = useState(false);

  const fetchAll = useCallback(() => Promise.all([api<VehicleCheckState>('/driver/vehicle-checks'), api<Incident[]>('/driver/incidents')]), []);
  const apply = ([st, inc]: [VehicleCheckState, Incident[]]) => {
    setState(st);
    setIncidents(inc);
    setError(null);
  };
  const load = useCallback(
    () =>
      fetchAll()
        .then(apply)
        .catch((e: Error) => setError(e.message)),
    [fetchAll],
  );

  useEffect(() => {
    let alive = true;
    fetchAll()
      .then((r) => alive && apply(r))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [fetchAll]);

  if (!state) {
    return <View style={{ padding: 24, alignItems: 'center' }}>{error ? <Text style={ui.error}>{error}</Text> : <ActivityIndicator color={colors.primary} />}</View>;
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Card>
        <Section icon="🛡️" title="Kiểm tra trước chuyến" />
        <Text style={s.text}>
          Mỗi chuyến xe công ty, trước khi bấm Bắt đầu: mở chuyến → <Text style={{ fontWeight: '800' }}>Kiểm tra trước chuyến</Text>.
        </Text>
        <Text style={s.text}>• Lái xe: đo nồng độ cồn (ảnh máy đo nếu có), sức khỏe, giấy tờ.</Text>
        <Text style={s.text}>• Xe: km đồng hồ, nhiên liệu, kỹ thuật, ảnh xe.</Text>
        <Text style={s.text}>Có nồng độ cồn hoặc chưa đủ sức khỏe: không được bắt đầu chuyến, điều hành được báo ngay.</Text>
        {!state.required && <Text style={[s.text, { color: colors.muted }]}>Công ty hiện không bắt buộc kiểm tra, nhưng nên làm để đảm bảo an toàn.</Text>}
      </Card>

      <Card>
        <Section icon="⚠️" title="Sự cố" />
        <Text style={s.text}>Báo sự cố không thuộc chuyến nào (xe hỏng ở bãi, va quẹt khi đỗ…). Sự cố trong chuyến báo ở màn hình chuyến.</Text>
        <Button title="Báo sự cố" icon="⚠️" variant="danger" onPress={() => setIncidentOpen(true)} style={{ marginTop: 10 }} />
        {incidents.slice(0, 5).map((i) => (
          <IncidentRow key={i.id} item={i} />
        ))}
      </Card>

      <Card>
        <Section icon="🕘" title="Lịch sử kiểm tra" />
        {state.recent.length ? state.recent.slice(0, 20).map((c: VehicleCheck) => <CheckRow key={c.id} c={c} />) : <Text style={s.text}>Chưa có lần kiểm tra nào.</Text>}
      </Card>

      <IncidentSheet visible={incidentOpen} onClose={() => setIncidentOpen(false)} onSent={load} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  text: { color: colors.text2, marginTop: 4, fontSize: 14, lineHeight: 20 },
});
