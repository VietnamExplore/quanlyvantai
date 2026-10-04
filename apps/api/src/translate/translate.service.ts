import Anthropic from '@anthropic-ai/sdk';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TargetLang = 'en' | 'ko' | 'zh' | 'ja';
export type TranslateProvider = 'claude' | 'google' | 'deepl';

/** Khóa cài đặt: dịch vụ dịch đang dùng và khóa API (khóa không bao giờ trả về cho trình duyệt) */
export const PROVIDER_KEY = 'translateProvider';
export const API_KEY_KEY = 'translateApiKey';

const LANG_NAME: Record<TargetLang, string> = { en: 'English', ko: 'Korean', zh: 'Simplified Chinese', ja: 'Japanese' };
const GOOGLE_CODE: Record<TargetLang, string> = { en: 'en', ko: 'ko', zh: 'zh-CN', ja: 'ja' };
const DEEPL_CODE: Record<TargetLang, string> = { en: 'EN-US', ko: 'KO', zh: 'ZH-HANS', ja: 'JA' };

const SYSTEM_PROMPT = `You translate short Vietnamese texts for a Vietnamese inbound travel and passenger-transport company. The translations appear on documents sent to foreign customers and travel agents: quotations, passenger lists, pickup signs, terms and conditions, company details.

Rules:
- Translate naturally and politely, in the style of a professional travel company.
- Keep unchanged: personal names, phone numbers, emails, booking codes, flight numbers, bank account numbers, tax codes, prices and numbers.
- Hotels, resorts and attractions: use their official international name if it is well known (e.g. "Bà Nà Hills", "InterContinental Danang Sun Peninsula Resort"); otherwise keep the original name.
- Vietnamese place names (streets, wards, cities): keep the Vietnamese name; you may drop diacritics for non-Vietnamese readers only if that is the common international spelling (e.g. "Da Nang", "Hoi An").
- Company names: keep as written unless an official foreign-language name is given in the text.
- Preserve line breaks and list structure exactly.
- If a text is empty or already in the target language, return it unchanged.

Return only a JSON object of the form {"translations": ["...", "..."]} with exactly one translation per input text, in the same order. No other text.`;

@Injectable()
export class TranslateService {
  constructor(private readonly prisma: PrismaService) {}

  private async config() {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: [PROVIDER_KEY, API_KEY_KEY] } } });
    const get = (k: string) => rows.find((r) => r.key === k)?.value?.trim() || '';
    return { provider: (get(PROVIDER_KEY) || 'claude') as TranslateProvider, apiKey: get(API_KEY_KEY) };
  }

  /** Dịch nhiều đoạn tiếng Việt sang một ngôn ngữ; giữ nguyên thứ tự, đoạn trống trả về rỗng */
  async translate(texts: string[], target: TargetLang): Promise<string[]> {
    const { provider, apiKey } = await this.config();
    if (!apiKey) {
      throw new BadRequestException('Chưa cài khóa API dịch tự động. Admin vào Hệ thống → Thông tin công ty → Ngôn ngữ & dịch tự động để nhập.');
    }
    // Chỉ gửi các đoạn có nội dung
    const idx = texts.map((t, i) => (t?.trim() ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return texts.map(() => '');
    const input = idx.map((i) => texts[i]);

    let out: string[];
    try {
      out =
        provider === 'google'
          ? await this.google(input, target, apiKey)
          : provider === 'deepl'
            ? await this.deepl(input, target, apiKey)
            : await this.claude(input, target, apiKey);
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof ServiceUnavailableException) throw e;
      throw new ServiceUnavailableException(`Không dịch được: ${(e as Error).message}`);
    }
    if (out.length !== input.length) throw new ServiceUnavailableException('Dịch vụ dịch trả về thiếu kết quả, hãy thử lại');

    const result = texts.map(() => '');
    idx.forEach((i, k) => (result[i] = out[k]));
    return result;
  }

  private async claude(texts: string[], target: TargetLang, apiKey: string) {
    const client = new Anthropic({ apiKey });
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        // Dịch là việc đơn giản: suy nghĩ ít để nhanh và tiết kiệm
        output_config: { effort: 'low' },
        // Nếu model từ chối (hiếm gặp) thì tự chuyển sang model dự phòng phù hợp
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Target language: ${LANG_NAME[target]}\n\nTexts (JSON array):\n${JSON.stringify(texts)}` }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new BadRequestException('Khóa API Claude không hợp lệ');
      if (e instanceof Anthropic.PermissionDeniedError) throw new BadRequestException('Khóa API Claude không có quyền dùng model này');
      if (e instanceof Anthropic.RateLimitError) throw new ServiceUnavailableException('Dịch vụ Claude đang quá tải, thử lại sau ít phút');
      if (e instanceof Anthropic.APIError) throw new ServiceUnavailableException(`Lỗi Claude API (${e.status}): ${e.message}`);
      throw e;
    }
    if (response.stop_reason === 'refusal') throw new ServiceUnavailableException('Claude từ chối dịch nội dung này');
    const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    try {
      const parsed = JSON.parse(json) as { translations?: unknown };
      if (Array.isArray(parsed.translations) && parsed.translations.every((t) => typeof t === 'string')) return parsed.translations as string[];
    } catch {
      /* xử lý bên dưới */
    }
    throw new ServiceUnavailableException('Claude trả về kết quả không đúng định dạng, hãy thử lại');
  }

  private async google(texts: string[], target: TargetLang, apiKey: string) {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: texts, source: 'vi', target: GOOGLE_CODE[target], format: 'text' }),
    });
    const body = (await res.json().catch(() => null)) as { data?: { translations?: { translatedText: string }[] }; error?: { message?: string } } | null;
    if (!res.ok) {
      if (res.status === 400 || res.status === 403) throw new BadRequestException(`Google Translate từ chối: ${body?.error?.message ?? res.status}`);
      throw new ServiceUnavailableException(`Lỗi Google Translate (${res.status})`);
    }
    return (body?.data?.translations ?? []).map((t) => t.translatedText);
  }

  private async deepl(texts: string[], target: TargetLang, apiKey: string) {
    // Khóa gói miễn phí của DeepL kết thúc bằng ":fx" và dùng máy chủ riêng
    const host = apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
    const res = await fetch(`${host}/v2/translate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `DeepL-Auth-Key ${apiKey}` },
      body: JSON.stringify({ text: texts, target_lang: DEEPL_CODE[target], preserve_formatting: true }),
    });
    const body = (await res.json().catch(() => null)) as { translations?: { text: string }[]; message?: string } | null;
    if (!res.ok) {
      if (res.status === 403) throw new BadRequestException('Khóa API DeepL không hợp lệ');
      if (res.status === 456) throw new ServiceUnavailableException('Đã hết hạn mức ký tự DeepL của tháng này');
      throw new ServiceUnavailableException(`Lỗi DeepL (${res.status}): ${body?.message ?? ''}`);
    }
    return (body?.translations ?? []).map((t) => t.text);
  }
}
