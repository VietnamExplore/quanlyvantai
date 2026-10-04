import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TranslateRateLimitError, TranslateService, UI_PROMPT, type TargetLang } from './translate.service';

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
/** Số câu mỗi lần gọi dịch vụ dịch (lô lớn = ít lần gọi, đỡ chạm giới hạn của gói miễn phí) */
const CHUNK = 150;

/** Dịch chữ trên giao diện: tra bản đã lưu trước, chỉ gửi đi dịch những câu chưa có rồi lưu lại dùng chung */
@Injectable()
export class UiTranslateService {
  private readonly logger = new Logger(UiTranslateService.name);
  /** Câu đang được dịch (tránh nhiều người cùng mở một trang gửi dịch trùng) */
  private readonly inflight = new Map<string, Promise<void>>();
  /** Gọi dịch vụ dịch lần lượt từng lô (không gọi song song) */
  private lane: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly translator: TranslateService,
  ) {}

  /** Toàn bộ bản dịch đã có của một ngôn ngữ: { câu gốc: bản dịch } */
  async dictionary(lang: TargetLang) {
    const rows = await this.prisma.uiTranslation.findMany({ where: { lang }, select: { source: true, text: true } });
    return Object.fromEntries(rows.map((r) => [r.source, r.text]));
  }

  async translate(lang: TargetLang, texts: string[]) {
    const unique = [...new Set(texts.map((t) => t.trim()).filter(Boolean))];
    const byHash = new Map(unique.map((t) => [sha1(t), t]));
    const found = async () =>
      this.prisma.uiTranslation.findMany({ where: { lang, hash: { in: [...byHash.keys()] } }, select: { source: true, text: true } });

    const first = await found();
    const have = new Set(first.map((r) => r.source));
    const missing = unique.filter((t) => !have.has(t));
    if (!missing.length) return Object.fromEntries(first.map((r) => [r.source, r.text]));

    // Câu người khác đang dịch: chờ xong; còn lại: tự dịch
    const waits: Promise<void>[] = [];
    const todo: string[] = [];
    for (const t of missing) {
      const job = this.inflight.get(`${lang}:${t}`);
      if (job) waits.push(job);
      else todo.push(t);
    }
    for (let i = 0; i < todo.length; i += CHUNK) {
      const chunk = todo.slice(i, i + CHUNK);
      const job = this.enqueue(() => this.translateChunk(lang, chunk));
      chunk.forEach((t) => this.inflight.set(`${lang}:${t}`, job));
      waits.push(job.finally(() => chunk.forEach((t) => this.inflight.delete(`${lang}:${t}`))));
    }
    const results = await Promise.allSettled(waits);
    const firstError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason as Error | undefined;
    if (firstError instanceof BadRequestException) throw firstError;
    if (firstError) this.logger.warn(`Một phần câu ${lang} chưa dịch được: ${firstError.message}`);

    const rows = await found();
    // Không dịch được câu nào thì báo lỗi để trình duyệt thử lại sau
    if (firstError && rows.length === first.length) throw firstError;
    return Object.fromEntries(rows.map((r) => [r.source, r.text]));
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lane.then(fn, fn);
    this.lane = run.catch(() => undefined);
    return run;
  }

  /** Dịch một lô; lỗi (quá tải, trả thiếu câu…) thì chia đôi dịch tiếp. Lỗi cấu hình (chưa có / sai khóa) thì báo ngay */
  private async translateChunk(lang: TargetLang, chunk: string[]): Promise<void> {
    let out: string[];
    try {
      out = await this.translator.translate(chunk, lang, UI_PROMPT);
    } catch (e) {
      // Sai cấu hình hoặc bị giới hạn số lần gọi: chia nhỏ chỉ làm gọi nhiều hơn → báo lỗi để thử lại sau
      if (e instanceof BadRequestException || e instanceof TranslateRateLimitError || chunk.length <= 4) throw e;
      this.logger.warn(`Dịch ${chunk.length} câu ${lang} lỗi, chia nhỏ: ${(e as Error).message}`);
      const half = Math.ceil(chunk.length / 2);
      const parts = await Promise.allSettled([this.translateChunk(lang, chunk.slice(0, half)), this.translateChunk(lang, chunk.slice(half))]);
      const failed = parts.find((p) => p.status === 'rejected');
      if (failed && parts.every((p) => p.status === 'rejected')) throw (failed as PromiseRejectedResult).reason;
      return;
    }
    const data = chunk
      .map((source, i) => ({ lang, hash: sha1(source), source, text: (out[i] ?? '').trim() }))
      // Bản dịch làm mất ký hiệu số ⟦n⟧ thì bỏ, lần sau dịch lại
      .filter((r) => r.text && (r.source.match(/⟦\d+⟧/g) ?? []).every((p) => r.text.includes(p)));
    if (data.length < chunk.length) this.logger.warn(`Bỏ ${chunk.length - data.length} bản dịch ${lang} không hợp lệ`);
    await this.prisma.uiTranslation.createMany({ data, skipDuplicates: true });
  }
}
