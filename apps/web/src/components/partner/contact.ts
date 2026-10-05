/** Ứng dụng nhắn tin khách dùng (giống app lái xe) */
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
const zaloNumber = (phone: string) => {
  const n = intl(phone);
  return n.startsWith('84') ? `0${n.slice(2)}` : n;
};

/**
 * Đường dẫn mở cuộc trò chuyện trên ứng dụng khách dùng.
 * null = ứng dụng không mở chat thẳng được (KakaoTalk, WeChat, LINE chưa có ID): chép ID / số để tìm bạn.
 */
export function chatUrl(app: ContactApp, phone: string | null, appId: string | null): string | null {
  const id = appId?.trim() || null;
  switch (app) {
    case 'ZALO':
      return phone ? `https://zalo.me/${zaloNumber(phone)}` : null;
    case 'WHATSAPP':
      return phone ? `https://wa.me/${intl(phone)}` : null;
    case 'VIBER':
      return phone ? `viber://chat?number=%2B${intl(phone)}` : null;
    case 'TELEGRAM':
      return id ? `https://t.me/${id.replace(/^@/, '')}` : phone ? `https://t.me/+${intl(phone)}` : null;
    case 'LINE':
      return id ? `https://line.me/ti/p/~${encodeURIComponent(id)}` : null;
    default:
      return null;
  }
}
