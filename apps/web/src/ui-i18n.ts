/**
 * Dịch tự động toàn bộ giao diện (giống "dịch trang" của trình duyệt).
 * Theo dõi mọi chữ hiện trên trang, đổi sang ngôn ngữ đã chọn bằng bản dịch lưu sẵn;
 * câu chưa có bản dịch thì gửi máy chủ dịch một lần rồi lưu dùng chung.
 * Số, ngày, số tiền được thay bằng ⟦0⟧, ⟦1⟧… trước khi dịch để một câu dùng lại cho mọi giá trị.
 * Không dịch: ô nhập liệu, vùng có class "notranslate" hoặc translate="no" (ví dụ bản in gửi khách).
 */
import { api, tokenStore } from './api';

export type UiLang = 'vi' | 'en' | 'ko' | 'zh' | 'ja';
export const UI_LANGS: { value: UiLang; label: string; short: string }[] = [
  { value: 'vi', label: 'Tiếng Việt', short: 'VI' },
  { value: 'en', label: 'English', short: 'EN' },
  { value: 'ko', label: '한국어', short: 'KO' },
  { value: 'zh', label: '中文', short: 'ZH' },
  { value: 'ja', label: '日本語', short: 'JA' },
];

const LANG_KEY = 'ui_lang';
const DICT_KEY = (l: UiLang) => `ui_dict_${l}`;
const ATTRS = ['placeholder', 'title', 'alt'] as const;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'CODE', 'svg', 'SVG']);
// .doc, .sign-page: bản in gửi khách đã có ngôn ngữ riêng
const SKIP_SELECTOR = '.notranslate, [translate="no"], [contenteditable="true"], .doc, .sign-page';
/** Có chữ thường và ít nhất 2 chữ cái liền nhau mới đáng dịch (bỏ qua mã, số, SĐT, biển số, chữ viết tắt in hoa) */
const worthTranslating = (s: string) => /[a-zà-ỹđ]/.test(s) && /\p{L}{2,}/u.test(s);
const MAX_TRIES = 5;
const NUMBER = /\d[\d.,:/]*/g;
const BATCH = 150;

const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* bộ nhớ trình duyệt đầy / bị chặn: chỉ mất bản lưu tạm, vẫn dịch được */
  }
};

export function savedUiLang(): UiLang {
  const v = safeGet(LANG_KEY);
  return UI_LANGS.some((l) => l.value === v) ? (v as UiLang) : 'vi';
}

/** Tách câu thành mẫu (số → ⟦n⟧) + danh sách số; giữ khoảng trắng đầu/cuối */
function toTemplate(text: string) {
  const lead = text.match(/^\s*/)![0];
  const trail = text.slice(lead.length).match(/\s*$/)![0];
  const core = text.slice(lead.length, text.length - trail.length);
  const values: string[] = [];
  const template = core.replace(NUMBER, (m) => `⟦${values.push(m) - 1}⟧`);
  return { lead, trail, template, values };
}
const fill = (t: string, values: string[]) => t.replace(/⟦(\d+)⟧/g, (_, i) => values[Number(i)] ?? '');

type Listener = (state: { lang: UiLang; pending: number; error: string | null }) => void;

class UiTranslator {
  lang: UiLang = 'vi';
  private dict = new Map<string, string>();
  private observer: MutationObserver | null = null;
  /** Chữ gốc tiếng Việt và chữ mình đã ghi lên trang của từng nút chữ / thuộc tính */
  private orig = new WeakMap<Node, string>();
  private shown = new WeakMap<Node, string>();
  private attrOrig = new WeakMap<Element, Record<string, string>>();
  private attrShown = new WeakMap<Element, Record<string, string>>();
  /** Câu đang chờ dịch và các nút đang chờ câu đó */
  private queue = new Set<string>();
  private waiting = new Set<Node>();
  /** Câu đã thử dịch mà lỗi: số lần thử (quá MAX_TRIES thì giữ tiếng Việt) */
  private tries = new Map<string, number>();
  private timer: number | undefined;
  private inflight = 0;
  private error: string | null = null;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.state());
    return () => void this.listeners.delete(fn);
  }
  private state() {
    return { lang: this.lang, pending: this.queue.size + this.inflight, error: this.error };
  }
  private emit() {
    const s = this.state();
    this.listeners.forEach((fn) => fn(s));
  }

  /** Đổi ngôn ngữ: "vi" trả lại chữ gốc và ngừng theo dõi */
  async setLang(lang: UiLang) {
    this.lang = lang;
    safeSet(LANG_KEY, lang);
    document.documentElement.lang = lang;
    this.dict = new Map();
    this.queue.clear();
    this.tries.clear();
    this.error = null;
    this.waiting.clear();
    // Trả lại chữ gốc trước (kể cả khi đổi giữa hai ngoại ngữ)
    this.observer?.disconnect();
    this.observer = null;
    this.walk(document.body, true);
    if (lang === 'vi') {
      this.emit();
      return;
    }
    // Bản lưu trong trình duyệt: hiện ngay; sau đó lấy bản mới nhất từ máy chủ
    try {
      this.dict = new Map(Object.entries(JSON.parse(safeGet(DICT_KEY(lang)) ?? '{}') as Record<string, string>));
    } catch {
      this.dict = new Map();
    }
    this.start();
    this.walk(document.body);
    this.emit();
    await this.refreshDictionary();
  }

  /** Lấy toàn bộ bản dịch đã lưu trên máy chủ (cần đăng nhập) */
  async refreshDictionary() {
    const lang = this.lang;
    if (lang === 'vi' || !tokenStore.get()) return;
    try {
      const all = await api<Record<string, string>>(`/translate/ui/${lang}`);
      if (lang !== this.lang) return;
      for (const [k, v] of Object.entries(all)) this.dict.set(k, v);
      this.persist();
      this.walk(document.body);
    } catch {
      /* chưa đăng nhập / mất mạng: dùng bản lưu tạm */
    }
    // Câu xếp hàng lúc chưa đăng nhập (trang đăng nhập): dịch bây giờ
    if (this.queue.size) this.schedule();
  }

  private persist() {
    safeSet(DICT_KEY(this.lang), JSON.stringify(Object.fromEntries(this.dict)));
  }

  private start() {
    if (this.observer) return;
    this.observer = new MutationObserver((records) => {
      if (this.lang === 'vi') return;
      for (const r of records) {
        if (r.type === 'characterData') this.text(r.target as Text);
        else if (r.type === 'attributes') this.attr(r.target as Element, r.attributeName!);
        else r.addedNodes.forEach((n) => this.walk(n));
      }
    });
    this.observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  }

  private skipped(el: Element | null) {
    if (!el) return true;
    if (SKIP_TAGS.has(el.tagName)) return true;
    return !!el.closest(SKIP_SELECTOR);
  }

  /** Duyệt một nhánh: dịch (hoặc trả lại chữ gốc khi restore) mọi nút chữ và thuộc tính */
  private walk(root: Node, restore = false) {
    if (root.nodeType === Node.TEXT_NODE) {
      if (restore) this.restoreText(root as Text);
      else this.text(root as Text);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const el = root as Element;
    if (!restore && this.skipped(el)) return;
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => {
        if (n.nodeType === Node.ELEMENT_NODE) {
          const e = n as Element;
          if (!restore && (SKIP_TAGS.has(e.tagName) || e.matches(SKIP_SELECTOR))) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const elements: Element[] = [el];
    const texts: Text[] = [];
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) texts.push(n as Text);
      else elements.push(n as Element);
    }
    for (const t of texts) {
      if (restore) this.restoreText(t);
      else this.text(t);
    }
    for (const e of elements) {
      for (const a of ATTRS) {
        if (!e.hasAttribute(a)) continue;
        if (restore) this.restoreAttr(e, a);
        else this.attr(e, a);
      }
    }
  }

  private restoreText(node: Text) {
    const o = this.orig.get(node);
    if (o !== undefined && this.shown.get(node) === node.data && node.data !== o) node.data = o;
    this.shown.delete(node);
  }

  private restoreAttr(el: Element, name: string) {
    const o = this.attrOrig.get(el)?.[name];
    const s = this.attrShown.get(el)?.[name];
    if (o !== undefined && s === el.getAttribute(name) && s !== o) el.setAttribute(name, o);
    const shown = this.attrShown.get(el);
    if (shown) delete shown[name];
  }

  /** Dịch một chuỗi; null nếu chưa có bản dịch (đã cho vào hàng chờ) */
  private lookup(text: string): string | null | undefined {
    if (!worthTranslating(text)) return undefined; // không cần dịch
    const { lead, trail, template, values } = toTemplate(text);
    if (!template || !worthTranslating(template.replace(/⟦\d+⟧/g, ''))) return undefined;
    const hit = this.dict.get(template);
    if (hit !== undefined) return lead + fill(hit, values) + trail;
    if ((this.tries.get(template) ?? 0) < MAX_TRIES) {
      this.queue.add(template);
      this.schedule();
    }
    return null;
  }

  private text(node: Text) {
    if (this.lang === 'vi') return;
    const cur = node.data;
    if (this.shown.get(node) === cur) return; // chữ do chính bộ dịch ghi
    if (this.skipped(node.parentElement)) return;
    this.orig.set(node, cur);
    const t = this.lookup(cur);
    if (t === null) this.waiting.add(node);
    else if (t !== undefined && t !== cur) {
      this.shown.set(node, t);
      node.data = t;
    }
  }

  private attr(el: Element, name: string) {
    if (this.lang === 'vi' || this.skipped(el)) return;
    const cur = el.getAttribute(name);
    if (cur === null) return;
    const shown = this.attrShown.get(el) ?? {};
    if (shown[name] === cur) return;
    const orig = this.attrOrig.get(el) ?? {};
    orig[name] = cur;
    this.attrOrig.set(el, orig);
    const t = this.lookup(cur);
    if (t === null) this.waiting.add(el);
    else if (t !== undefined && t !== cur) {
      shown[name] = t;
      this.attrShown.set(el, shown);
      el.setAttribute(name, t);
    }
  }

  /** Dịch lỗi (dịch vụ quá tải…): thử lại sau vài giây, tối đa MAX_TRIES lần */
  private retryLater(t: string) {
    const n = (this.tries.get(t) ?? 0) + 1;
    this.tries.set(t, n);
    if (n >= MAX_TRIES) return;
    const lang = this.lang;
    window.setTimeout(() => {
      if (lang !== this.lang || this.dict.has(t)) return;
      this.queue.add(t);
      this.schedule();
    }, 15000 * n);
  }

  private schedule() {
    this.emit();
    if (this.timer) return;
    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, 250);
  }

  private async flush() {
    const lang = this.lang;
    if (lang === 'vi' || !this.queue.size || !tokenStore.get()) return;
    const batch = [...this.queue].slice(0, BATCH);
    batch.forEach((t) => this.queue.delete(t));
    this.inflight++;
    this.emit();
    try {
      const got = await api<Record<string, string>>(`/translate/ui/${lang}`, { method: 'POST', body: { texts: batch } });
      if (lang !== this.lang) return;
      for (const t of batch) {
        if (got[t] !== undefined) this.dict.set(t, got[t]);
        else this.retryLater(t);
      }
      this.persist();
      this.error = null;
      // Dịch lại các nút đang chờ
      const nodes = [...this.waiting];
      this.waiting.clear();
      for (const n of nodes) {
        if (!n.isConnected) continue;
        if (n.nodeType === Node.TEXT_NODE) {
          this.shown.delete(n);
          const o = this.orig.get(n);
          if (o !== undefined && (n as Text).data === o) this.text(n as Text);
        } else {
          const el = n as Element;
          for (const a of ATTRS) {
            if (el.hasAttribute(a) && el.getAttribute(a) === this.attrOrig.get(el)?.[a]) {
              const shown = this.attrShown.get(el);
              if (shown) delete shown[a];
              this.attr(el, a);
            }
          }
        }
      }
    } catch (e) {
      batch.forEach((t) => this.retryLater(t));
      this.error = (e as Error).message;
    } finally {
      this.inflight--;
      this.emit();
      if (this.queue.size) this.schedule();
    }
  }
}

export const uiTranslator = new UiTranslator();
