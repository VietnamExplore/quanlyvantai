import { Transform } from 'class-transformer';

/** Ngôn ngữ giấy tờ gửi khách: Việt, Anh, Hàn, Trung (giản thể), Nhật */
export const DOC_LANGUAGES = ['vi', 'en', 'ko', 'zh', 'ja'] as const;
const FOREIGN = ['en', 'ko', 'zh', 'ja'];

/** Chuẩn hóa { en, ko, zh, ja }: chỉ giữ các ngôn ngữ hợp lệ, bỏ ô trống */
export const CleanNames = () =>
  Transform(({ value }) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k, v]) => FOREIGN.includes(k) && typeof v === 'string' && v.trim())
        .map(([k, v]) => [k, (v as string).trim()]),
    );
  });
