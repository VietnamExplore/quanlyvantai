import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, isIconName } from './icons';
import { BRAND, colors, shadow, STATUS } from './theme';
import type { TripStatus } from './types';

type Variant = 'primary' | 'soft' | 'outline' | 'danger' | 'ghost';

/**
 * Nút bấm: primary (nền xanh chuyển màu), soft (nền xanh nhạt), outline, danger, ghost.
 * size: sm (gọn, dùng trong thẻ) · md (mặc định) · lg (nút hành động chính, = big).
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  big,
  size,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
}) {
  const sz = size ?? (big ? 'lg' : 'md');
  const fg = { primary: '#fff', soft: colors.primary, outline: colors.primary, danger: colors.danger, ghost: colors.primary }[variant];
  const content = loading ? (
    <ActivityIndicator color={fg} />
  ) : (
    <View style={styles.btnInner}>
      {icon && isIconName(icon) ? <Icon name={icon} size={sz === 'lg' ? 22 : sz === 'sm' ? 16 : 19} color={fg} /> : null}
      <Text style={[styles.btnText, styles[`btnText_${sz}`], { color: fg }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {icon && !isIconName(icon) ? `${icon}  ` : ''}
        {title}
      </Text>
    </View>
  );
  const box = [styles.btn, styles[`btn_${sz}`]];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        variant === 'primary' && sz === 'lg' && styles.btnGlow,
        { opacity: disabled ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}
    >
      {variant === 'primary' ? (
        <LinearGradient colors={BRAND.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={box}>
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            box,
            variant === 'soft' && { backgroundColor: colors.primarySoft },
            variant === 'outline' && { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: '#fff' },
            variant === 'danger' && { borderWidth: 1.5, borderColor: '#f5b5b8', backgroundColor: '#fff5f5' },
          ]}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}

/** Ô thao tác nhanh: biểu tượng lớn + nhãn ngắn (Bảng đón, Chỉ đường, Liên hệ…) */
export function QuickAction({ icon, label, onPress, tone = 'blue' }: { icon: string; label: string; onPress: () => void; tone?: 'blue' | 'green' | 'orange' | 'purple' }) {
  const bg = { blue: '#e8f1fe', green: '#e7f7ee', orange: '#fff3e2', purple: '#f1ecfd' }[tone];
  const fg = { blue: colors.primary, green: '#15803d', orange: '#c2410c', purple: '#6d28d9' }[tone];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quick, { opacity: pressed ? 0.8 : 1 }]}>
      <View style={[styles.quickIcon, { backgroundColor: bg }]}>
        <Icon name={icon} size={24} color={fg} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Tiêu đề mục trong thẻ: biểu tượng + chữ in hoa nhỏ + phần bên phải (tùy chọn) */
export function Section({ icon, title, right }: { icon?: string; title: string; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionLeft}>
        {icon ? isIconName(icon) ? <View style={styles.sectionIcon}><Icon name={icon} size={15} color={colors.primary} /></View> : <Text style={styles.sectionText}>{icon}</Text> : null}
        <Text style={[styles.sectionText, { flexShrink: 1 }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function StatusBadge({ status, onDark }: { status: TripStatus; onDark?: boolean }) {
  const s = STATUS[status];
  return (
    <View style={[styles.badge, { backgroundColor: onDark ? 'rgba(255,255,255,0.22)' : s.bg }]}>
      <View style={[styles.badgeDot, { backgroundColor: onDark ? '#fff' : s.color }]} />
      <Text style={[styles.badgeText, { color: onDark ? '#fff' : s.color }]}>{s.label}</Text>
    </View>
  );
}

/** Nhãn nhỏ thông tin (số khách, biển số, chuyến bay…) */
export function Chip({ text, tone = 'gray', icon }: { text: string; tone?: 'gray' | 'blue' | 'green' | 'orange'; icon?: string }) {
  const c = { gray: { bg: '#eef2f7', fg: colors.text2 }, blue: { bg: colors.primarySoft, fg: colors.primary }, green: { bg: '#e7f7ee', fg: '#15803d' }, orange: { bg: '#fff3e2', fg: '#b45309' } }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      {icon ? <Icon name={icon} size={14} color={c.fg} /> : null}
      <Text style={[styles.chipText, { color: c.fg }]} numberOfLines={1}>
        {text}
      </Text>
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
  btn: { borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%' },
  btn_sm: { minHeight: 40, borderRadius: 12, paddingHorizontal: 12 },
  btn_md: { minHeight: 48 },
  btn_lg: { minHeight: 58, borderRadius: 16 },
  btnGlow: { borderRadius: 16, shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  btnText: { fontWeight: '700', flexShrink: 1 },
  btnText_sm: { fontSize: 14 },
  btnText_md: { fontSize: 16 },
  btnText_lg: { fontSize: 17, fontWeight: '800', letterSpacing: 0.6 },
  quick: { flex: 1, minWidth: 64, alignItems: 'center', gap: 6 },
  quickIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 12.5, fontWeight: '700', color: colors.text2, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 16, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  sectionIcon: { width: 26, height: 26, borderRadius: 9, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sectionText: { fontSize: 12.5, fontWeight: '800', color: colors.text2, letterSpacing: 0.8, textTransform: 'uppercase' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 12.5, fontWeight: '700' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#eef2f7', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, maxWidth: '100%' },
  chipText: { fontSize: 13, color: colors.text2, fontWeight: '700', flexShrink: 1 },
  row: { flexDirection: 'row', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { width: 110, color: colors.muted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 15, fontWeight: '500' },
  input: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, marginBottom: 12 },
  label: { fontSize: 13.5, color: colors.text2, marginBottom: 6, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 14, marginBottom: 12 },
});

/** Tháng hiện tại dạng YYYY-MM (giờ máy) */
export const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Chuyển tháng: ‹ Tháng 10/2026 › (không cho đi quá tháng hiện tại) */
export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const [y, m] = month.split('-').map(Number);
  const shift = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const atNow = month >= thisMonth();
  return (
    <View style={monthStyles.month}>
      <Pressable onPress={() => shift(-1)} hitSlop={10} style={monthStyles.monthBtn}>
        <Text style={monthStyles.monthArrow}>‹</Text>
      </Pressable>
      <Text style={monthStyles.monthText}>
        Tháng {m}/{y}
      </Text>
      <Pressable onPress={() => !atNow && shift(1)} hitSlop={10} style={[monthStyles.monthBtn, atNow && { opacity: 0.3 }]}>
        <Text style={monthStyles.monthArrow}>›</Text>
      </Pressable>
    </View>
  );
}

const monthStyles = StyleSheet.create({
  month: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 14, padding: 6, marginBottom: 12, ...shadow },
  monthBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  monthArrow: { fontSize: 26, color: colors.primary, fontWeight: '700', marginTop: -3 },
  monthText: { fontSize: 17, fontWeight: '800', color: colors.text },
});
