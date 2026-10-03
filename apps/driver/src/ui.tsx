import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, STATUS } from './theme';
import type { TripStatus } from './types';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  big,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
}) {
  const bg = { primary: colors.primary, outline: '#fff', danger: '#fff', ghost: 'transparent' }[variant];
  const fg = { primary: '#fff', outline: colors.primary, danger: colors.danger, ghost: colors.primary }[variant];
  const border = { primary: colors.primary, outline: colors.primary, danger: colors.danger, ghost: 'transparent' }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        big && styles.btnBig,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, big && styles.btnTextBig, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StatusBadge({ status }: { status: TripStatus }) {
  const s = STATUS[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <Text style={styles.rowValue}>{children}</Text> : children}</View>
    </View>
  );
}

export const styles = StyleSheet.create({
  btn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  btnBig: { paddingVertical: 16, minHeight: 58 },
  btnText: { fontSize: 16, fontWeight: '600' },
  btnTextBig: { fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { width: 96, color: colors.muted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 15 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, marginBottom: 12 },
  label: { fontSize: 14, color: colors.text2, marginBottom: 6 },
  error: { color: colors.danger, fontSize: 14, marginBottom: 12 },
});
