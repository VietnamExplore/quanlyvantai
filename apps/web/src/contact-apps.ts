/** Ứng dụng nhắn tin / gọi miễn phí khách thường dùng (lái xe liên hệ qua app này thay vì gọi điện thường) */
export type ContactApp = 'ZALO' | 'WHATSAPP' | 'KAKAOTALK' | 'WECHAT' | 'LINE' | 'VIBER' | 'TELEGRAM';

export const CONTACT_APP: Record<ContactApp, { label: string; usesId: boolean }> = {
  ZALO: { label: 'Zalo', usesId: false },
  WHATSAPP: { label: 'WhatsApp', usesId: false },
  KAKAOTALK: { label: 'KakaoTalk', usesId: true },
  WECHAT: { label: 'WeChat', usesId: true },
  LINE: { label: 'LINE', usesId: true },
  VIBER: { label: 'Viber', usesId: false },
  TELEGRAM: { label: 'Telegram', usesId: false },
};

/** Đoán ứng dụng theo đầu số: VN → Zalo, Hàn → KakaoTalk, Trung → WeChat, Nhật → LINE, còn lại → WhatsApp */
export function guessContactApp(phone?: string | null): ContactApp {
  const p = (phone ?? '').replace(/[^\d+]/g, '');
  if (/^(\+?84|0)/.test(p)) return 'ZALO';
  if (/^\+?82/.test(p)) return 'KAKAOTALK';
  if (/^\+?86/.test(p)) return 'WECHAT';
  if (/^\+?81/.test(p)) return 'LINE';
  return 'WHATSAPP';
}
