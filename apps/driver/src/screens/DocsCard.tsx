import { Linking, StyleSheet, Text } from 'react-native';
import { getServer } from '../api';
import { colors } from '../theme';
import type { Trip } from '../types';
import { Button, Card, Section } from '../ui';

const open = (path: string) => Linking.openURL(`${getServer()}${path}`);

/**
 * Giấy tờ chuyến để xuất trình khi kiểm tra (NĐ 158/2024): lệnh vận chuyển điện tử,
 * hợp đồng vận chuyển + danh sách hành khách (nếu văn phòng đã lập).
 */
export function DocsCard({ trip }: { trip: Trip }) {
  if (trip.status === 'HUY') return null;
  const contract = trip.booking.contract;
  return (
    <Card>
      <Section icon="documents-outline" title="Giấy tờ chuyến" />
      {trip.orderPath && <Button title="Lệnh vận chuyển" icon="receipt-outline" variant="soft" onPress={() => open(trip.orderPath!)} />}
      {contract ? (
        <Button title={`Hợp đồng vận chuyển ${contract.number}`} icon="document-text-outline" variant="soft" onPress={() => open(`/e/hd/${contract.token}`)} style={{ marginTop: 8 }} />
      ) : trip.shuttleRunId ? (
        <Text style={s.note}>Chuyến xe ghép: dùng lệnh vận chuyển chung của cả chuyến ghép.</Text>
      ) : (
        <Text style={s.warn}>⚠️ Booking chưa có hợp đồng vận chuyển — báo văn phòng lập trước khi chạy.</Text>
      )}
      <Text style={s.note}>Mở bằng trình duyệt; có thể in hoặc đưa CSGT xem trực tiếp trên điện thoại.</Text>
    </Card>
  );
}

const s = StyleSheet.create({
  warn: { color: colors.warning, fontWeight: '700', marginTop: 10 },
  note: { color: colors.muted, fontSize: 12.5, marginTop: 8 },
});
