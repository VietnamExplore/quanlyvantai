import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ALL_APPS, APP_LABEL, contactGuest, guessApp, messageApp, messageGuest, openApp, type ContactApp } from '../contact';
import { colors } from '../theme';
import { Button, Card } from '../ui';

export interface GuestContact {
  role: string;
  name: string;
  phone: string | null;
  app?: ContactApp | null;
  appId?: string | null;
  /** Tin nhắn mẫu khi bấm "Nhắn tin" */
  message?: string;
}

type Mode = 'call' | 'message';

/** Bảng chọn ứng dụng khác để liên hệ (gọi điện thường để cuối cùng) */
export function ContactChooser({ contact, mode = 'call', onClose }: { contact: GuestContact | null; mode?: Mode; onClose: () => void }) {
  if (!contact) return null;
  const { phone, appId } = contact;
  const pick = async (app: ContactApp) => {
    onClose();
    if (mode === 'message' && contact.message) await messageApp(app, phone, appId ?? null, contact.message);
    else await openApp(app, phone, appId ?? null);
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.sheetBg} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => undefined}>
          <Text style={s.sheetTitle}>
            {mode === 'message' ? 'Nhắn tin' : 'Gọi'} cho {contact.name} qua…
          </Text>
          <Text style={s.sheetSub}>{[phone, appId && `ID: ${appId}`].filter(Boolean).join(' · ')}</Text>
          <ScrollView style={{ maxHeight: 420 }}>
            {ALL_APPS.map((a) => (
              <Pressable key={a} onPress={() => pick(a)} style={({ pressed }) => [s.sheetItem, pressed && { backgroundColor: '#f0f5ff' }]}>
                <Text style={s.sheetItemText}>
                  {mode === 'message' ? '💬' : '📞'} {APP_LABEL[a]}
                </Text>
              </Pressable>
            ))}
            {phone && (
              <Pressable
                onPress={() => {
                  onClose();
                  if (mode === 'message') Linking.openURL(`sms:${phone.replace(/[^\d+]/g, '')}?body=${encodeURIComponent(contact.message ?? '')}`);
                  else Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
                }}
                style={({ pressed }) => [s.sheetItem, pressed && { backgroundColor: '#fff1f0' }]}
              >
                <Text style={[s.sheetItemText, { color: colors.muted }]}>
                  {mode === 'message' ? '✉️ Tin nhắn SMS thường (tính cước)' : '📞 Gọi điện thường (tính cước)'}
                </Text>
              </Pressable>
            )}
          </ScrollView>
          <Button title="Đóng" variant="ghost" onPress={onClose} style={{ marginTop: 6 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Thẻ "Liên hệ đón khách": HDV / trưởng đoàn (hoặc khách đại diện) — bấm là mở ứng dụng khách dùng */
export function ContactCard({ contact }: { contact: GuestContact }) {
  const [choosing, setChoosing] = useState<Mode | null>(null);
  const app = contact.app ?? (contact.phone ? guessApp(contact.phone) : null);
  const reachable = !!(contact.phone || contact.appId);

  const call = async () => {
    if (!(await contactGuest(contact.phone, contact.app, contact.appId))) setChoosing('call');
  };
  const message = async () => {
    const ok = contact.message ? await messageGuest(contact.phone, contact.app, contact.appId, contact.message) : await contactGuest(contact.phone, contact.app, contact.appId);
    if (!ok) setChoosing('message');
  };
  const label = app ? APP_LABEL[app] : 'ứng dụng';

  return (
    <Card style={s.card}>
      <Text style={s.role}>📍 Liên hệ đón khách · {contact.role}</Text>
      <Text style={s.name}>{contact.name}</Text>
      {reachable ? (
        <>
          <Text style={s.phone}>
            {contact.phone ?? ''}
            {contact.appId ? `${contact.phone ? ' · ' : ''}ID ${contact.appId}` : ''}
          </Text>
          <View style={s.row}>
            <Button title={`📞 Gọi qua ${label}`} onPress={call} style={{ flex: 1 }} />
            <Button title={`💬 Nhắn tin`} variant="outline" onPress={message} style={{ flex: 1 }} />
          </View>
          <Button title="Dùng ứng dụng khác…" variant="ghost" onPress={() => setChoosing('call')} style={{ marginTop: 4 }} />
        </>
      ) : (
        <Text style={s.noPhone}>Chưa có số điện thoại — hỏi văn phòng</Text>
      )}
      {choosing && <ContactChooser contact={contact} mode={choosing} onClose={() => setChoosing(null)} />}
    </Card>
  );
}

const s = StyleSheet.create({
  card: { borderLeftWidth: 5, borderLeftColor: colors.primary },
  role: { fontSize: 13, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' },
  name: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 4 },
  phone: { fontSize: 15, color: colors.text2, marginTop: 2 },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  noPhone: { fontSize: 14, color: colors.warning, marginTop: 6 },
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 24 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  sheetSub: { fontSize: 14, color: colors.muted, marginTop: 2, marginBottom: 8 },
  sheetItem: { paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, borderRadius: 8 },
  sheetItemText: { fontSize: 17, color: colors.text },
});
