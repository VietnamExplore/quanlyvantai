import * as Clipboard from 'expo-clipboard';
import { Alert, Linking } from 'react-native';

/** Ứng dụng nhắn tin / gọi miễn phí khách thường dùng — lái xe liên hệ qua app này, không gọi điện thường */
export type ContactApp = 'ZALO' | 'WHATSAPP' | 'KAKAOTALK' | 'WECHAT' | 'LINE' | 'VIBER' | 'TELEGRAM';

export const APP_LABEL: Record<ContactApp, string> = {
  ZALO: 'Zalo',
  WHATSAPP: 'WhatsApp',
  KAKAOTALK: 'KakaoTalk',
  WECHAT: 'WeChat',
  LINE: 'LINE',
  VIBER: 'Viber',
  TELEGRAM: 'Telegram',
};

/** Đoán ứng dụng theo đầu số: VN → Zalo, Hàn → KakaoTalk, Trung → WeChat, Nhật → LINE, còn lại → WhatsApp */
export function guessApp(phone?: string | null): ContactApp {
  const p = (phone ?? '').replace(/[^\d+]/g, '');
  if (/^(\+?84|0)/.test(p)) return 'ZALO';
  if (/^\+?82/.test(p)) return 'KAKAOTALK';
  if (/^\+?86/.test(p)) return 'WECHAT';
  if (/^\+?81/.test(p)) return 'LINE';
  return 'WHATSAPP';
}

/** Số quốc tế chỉ gồm chữ số (số VN bắt đầu bằng 0 → 84…) */
const intl = (phone: string) => {
  const d = phone.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d.slice(1);
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return `84${d.slice(1)}`;
  return d;
};
/** Zalo dùng số VN dạng 0…; số nước ngoài giữ mã quốc gia */
const zaloNumber = (phone: string) => {
  const n = intl(phone);
  return n.startsWith('84') ? `0${n.slice(2)}` : n;
};

async function tryOpen(url: string) {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Ứng dụng kết bạn bằng ID (KakaoTalk, WeChat, LINE không mở chat thẳng bằng số): chép ID/số rồi mở app */
async function openWithCopy(app: ContactApp, scheme: string, value: string) {
  await Clipboard.setStringAsync(value);
  const ok = await tryOpen(scheme);
  // Không mở được (máy chưa cài app): màn hình sẽ cho chọn cách khác
  if (ok) {
    Alert.alert(
      `Đã mở ${APP_LABEL[app]}`,
      `Đã chép "${value}". Vào ô tìm bạn / thêm bạn của ${APP_LABEL[app]} rồi dán (nhấn giữ → Dán) để nhắn hoặc gọi cho khách.`,
    );
  }
  return ok;
}

/** Mở cuộc trò chuyện với khách trên ứng dụng chỉ định */
export async function openApp(app: ContactApp, phone: string | null, appId: string | null): Promise<boolean> {
  const id = appId?.trim() || null;
  switch (app) {
    case 'ZALO':
      return phone ? tryOpen(`https://zalo.me/${zaloNumber(phone)}`) : false;
    case 'WHATSAPP':
      return phone ? tryOpen(`https://wa.me/${intl(phone)}`) : false;
    case 'VIBER':
      return phone ? tryOpen(`viber://chat?number=%2B${intl(phone)}`) : false;
    case 'TELEGRAM':
      return id ? tryOpen(`https://t.me/${id.replace(/^@/, '')}`) : phone ? tryOpen(`https://t.me/+${intl(phone)}`) : false;
    case 'LINE':
      return id ? tryOpen(`https://line.me/ti/p/~${encodeURIComponent(id)}`) : phone ? openWithCopy(app, 'line://', phone) : false;
    case 'KAKAOTALK':
      return openWithCopy(app, 'kakaotalk://', id ?? phone ?? '');
    case 'WECHAT':
      return openWithCopy(app, 'weixin://', id ?? phone ?? '');
  }
}

/**
 * Nhắn tin cho khách kèm tin nhắn mẫu: WhatsApp điền sẵn vào khung chat;
 * ứng dụng khác thì chép tin mẫu để tài xế dán vào khung chat.
 */
export async function messageApp(app: ContactApp, phone: string | null, appId: string | null, text: string): Promise<boolean> {
  if (app === 'WHATSAPP' && phone) return tryOpen(`https://wa.me/${intl(phone)}?text=${encodeURIComponent(text)}`);
  await Clipboard.setStringAsync(text);
  const id = appId?.trim() || null;
  const url =
    app === 'ZALO' && phone ? `https://zalo.me/${zaloNumber(phone)}`
    : app === 'VIBER' && phone ? `viber://chat?number=%2B${intl(phone)}`
    : app === 'TELEGRAM' && (id || phone) ? (id ? `https://t.me/${id.replace(/^@/, '')}` : `https://t.me/+${intl(phone!)}`)
    : app === 'LINE' ? (id ? `https://line.me/ti/p/~${encodeURIComponent(id)}` : 'line://')
    : app === 'KAKAOTALK' ? 'kakaotalk://'
    : app === 'WECHAT' ? 'weixin://'
    : null;
  if (!url || !(await tryOpen(url))) return false;
  const needFind = app === 'KAKAOTALK' || app === 'WECHAT' || (app === 'LINE' && !id);
  Alert.alert(
    'Đã chép tin nhắn mẫu',
    `${needFind ? `Tìm khách trên ${APP_LABEL[app]} bằng ${id ? `ID "${id}"` : `số ${phone}`}, sau đó ` : ''}nhấn giữ vào khung chat → Dán để gửi:\n\n${text}`,
  );
  return true;
}

export async function messageGuest(phone: string | null, app: ContactApp | null | undefined, appId: string | null | undefined, text: string) {
  return messageApp(app ?? guessApp(phone), phone, appId ?? null, text);
}

/** Khách Việt (số +84 / 0…) nhận tin tiếng Việt, khách nước ngoài nhận tiếng Anh */
export function pickupMessage(o: { phone: string | null; name: string; time: string; place: string; plate: string | null }) {
  const vn = guessApp(o.phone) === 'ZALO';
  if (vn) {
    return `Chào anh/chị ${o.name}, tôi là tài xế đón đoàn lúc ${o.time} tại ${o.place}.${o.plate ? ` Xe biển số ${o.plate}.` : ''} Tôi sẽ liên hệ khi đến nơi. Cảm ơn anh/chị!`;
  }
  return `Hello ${o.name}, I am your driver for the pickup at ${o.time} at ${o.place}.${o.plate ? ` Vehicle plate: ${o.plate}.` : ''} I will contact you when I arrive. Thank you!`;
}

/**
 * Bấm vào số của khách: mở ứng dụng khách dùng (đã chọn ở văn phòng, hoặc đoán theo đầu số).
 * Trả về false nếu không mở được (màn hình cho chọn ứng dụng khác).
 */
export async function contactGuest(phone: string | null, app?: ContactApp | null, appId?: string | null): Promise<boolean> {
  return openApp(app ?? guessApp(phone), phone, appId ?? null);
}

export const ALL_APPS: ContactApp[] = ['ZALO', 'WHATSAPP', 'KAKAOTALK', 'WECHAT', 'LINE', 'VIBER', 'TELEGRAM'];
