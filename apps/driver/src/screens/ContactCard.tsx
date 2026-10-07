import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ALL_APPS, APP_LABEL, contactGuest, guessApp, messageApp, messageGuest, openApp, type ContactApp } from '../contact';
import { MODAL_ORIENTATIONS, sheetFrame } from '../platform';
import { colors } from '../theme';
import { Button, Card, Section } from '../ui';

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
    <Modal supportedOrientations={MODAL_ORIENTATIONS} visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.sheetBg} onPress={onClose}>
        <Pressable style={[s.sheet, sheetFrame]} onPress={() => undefined}>
          <Text style={s.sheetTitle}>
            {mode === 'message' ? 'Nhắn tin' : 'Gọi'} cho {contact.name} qua…
          </Text>
          <Text style={s.sheetSub}>{[phone, appId && `ID: ${appId}`].filter(Boolean).join(' · ')}</Text>
          <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={s.grid}>
            {ALL_APPS.map((a) => (
              <Pressable key={a} onPress={() => pick(a)} style={({ pressed }) => [s.gridItem, pressed && { backgroundColor: colors.primarySoft }]}>
                <Text style={s.gridItemText}>
                  {mode === 'message' ? '💬' : '📞'}  {APP_LABEL[a]}
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
                style={({ pressed }) => [s.gridItem, s.gridWide, pressed && { backgroundColor: '#fff1f0' }]}
              >
                <Text style={[s.gridItemText, { color: colors.muted, fontWeight: '600' }]}>
                  {mode === 'message' ? '✉️ Tin nhắn SMS thường (tính cước)' : '📞 Gọi điện thường (tính cước)'}
                </Text>
              </Pressable>
            )}
          </ScrollView>
          <Button title="Đóng" variant="soft" onPress={onClose} style={{ marginTop: 10 }} />
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
    <Card>
      <Section icon="📍" title="Liên hệ đón khách" />
      <View style={s.person}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{contact.name.trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.roleChip}>
            <Text style={s.roleText}>{contact.role}</Text>
          </View>
          <Text style={s.name} numberOfLines={2}>
            {contact.name}
          </Text>
          {reachable && (
            <Text style={s.phone}>
              {contact.phone ?? ''}
              {contact.appId ? `${contact.phone ? ' · ' : ''}ID ${contact.appId}` : ''}
              {app ? `  ·  ${label}` : ''}
            </Text>
          )}
        </View>
      </View>
      {reachable ? (
        <>
          <View style={s.row}>
            <Button title={`Gọi ${label}`} icon="📞" size="sm" onPress={call} style={{ flex: 1 }} />
            <Button title="Nhắn tin" icon="💬" size="sm" variant="soft" onPress={message} style={{ flex: 1 }} />
          </View>
          <Pressable onPress={() => setChoosing('call')} hitSlop={8} style={{ alignSelf: 'center', marginTop: 10 }}>
            <Text style={s.other}>Dùng ứng dụng khác…</Text>
          </Pressable>
        </>
      ) : (
        <Text style={s.noPhone}>Chưa có số điện thoại — hỏi văn phòng</Text>
      )}
      {choosing && <ContactChooser contact={contact} mode={choosing} onClose={() => setChoosing(null)} />}
    </Card>
  );
}

const s = StyleSheet.create({
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  roleChip: { alignSelf: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  roleText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 3 },
  phone: { fontSize: 14, color: colors.text2, marginTop: 1 },
  row: { flexDirection: 'row', gap: 8, marginTop: 14 },
  other: { color: colors.primary, fontSize: 13.5, fontWeight: '700' },
  noPhone: { fontSize: 14, color: colors.warning, marginTop: 10 },
  sheetBg: { flex: 1, backgroundColor: 'rgba(8,24,56,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 26 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  sheetSub: { fontSize: 14, color: colors.muted, marginTop: 2, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: { width: '48.5%', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#f4f7fc', borderWidth: 1, borderColor: colors.border },
  gridWide: { width: '100%' },
  gridItemText: { fontSize: 15.5, color: colors.text, fontWeight: '700' },
});
