import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

type IonName = ComponentProps<typeof Ionicons>['name'];
type MciName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Biểu tượng vector: tên Ionicons ("car-outline", "people"…) hoặc "mci:<tên>" của MaterialCommunityIcons
 * ("mci:gas-station", "mci:steering"…). Chuỗi khác (emoji) vẫn hiện như chữ để màn hình cũ không lỗi.
 */
export function Icon({ name, size = 20, color, style }: { name: string; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  if (name.startsWith('mci:')) return <MaterialCommunityIcons name={name.slice(4) as MciName} size={size} color={color} style={style} />;
  if (name in Ionicons.glyphMap) return <Ionicons name={name as IonName} size={size} color={color} style={style} />;
  return <Text style={[{ fontSize: size * 0.9, lineHeight: size * 1.15 }, style]}>{name}</Text>;
}

/** Tên biểu tượng vector hợp lệ (để biết nên vẽ vector hay hiện emoji) */
export const isIconName = (name: string) => (name.startsWith('mci:') && name.slice(4) in MaterialCommunityIcons.glyphMap) || name in Ionicons.glyphMap;
