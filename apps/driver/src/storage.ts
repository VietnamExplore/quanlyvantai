import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Lưu trữ khóa – giá trị: trên điện thoại dùng SecureStore (mã hóa);
 * trên trình duyệt (chỉ để xem thử giao diện) dùng localStorage.
 */
const web = Platform.OS === 'web';

export const storage = {
  async get(key: string) {
    if (!web) return SecureStore.getItemAsync(key);
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string) {
    if (!web) return SecureStore.setItemAsync(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* bỏ qua */
    }
  },
  async remove(key: string) {
    if (!web) return SecureStore.deleteItemAsync(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* bỏ qua */
    }
  },
};
