import { Logger } from '@nestjs/common';
import { mkdirSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Đọc chữ trên bảng đón TOTO (PDF chỉ có một ảnh, tạo bằng jsPDF): "BK : 200815217" ở góc trên, tên khách chữ Hàn + Latin ở giữa.
 * Cắt từng vùng của ảnh rồi nhận dạng chữ (tesseract.js) – vùng mã chỉ đọc chữ số nên rất ít sai.
 */
const logger = new Logger('TotoSignOcr');
/** Dữ liệu nhận dạng chữ (tải một lần, lưu cạnh file tải lên) */
const CACHE_DIR = resolve(process.env.UPLOAD_DIR ?? join(__dirname, '..', '..', 'uploads'), 'ocr');

type Img = { width: number; height: number; data: Uint8ClampedArray | Uint8Array; kind: number };

/** Ảnh lớn nhất trên trang 1 của PDF (pdf.js giải mã sẵn, không cần thư viện vẽ) */
async function pdfImage(data: Uint8Array): Promise<Img | null> {
  const pdfjs = await (new Function('s', 'return import(s)') as (s: string) => Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>)('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: data.slice(), useSystemFonts: true, isEvalSupported: false }).promise;
  const page = await doc.getPage(1);
  const ops = await page.getOperatorList();
  let best: Img | null = null;
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
    const name = ops.argsArray[i][0] as string;
    const img = await new Promise<Img | null>((done) => {
      try {
        page.objs.get(name, (v: Img) => done(v));
      } catch {
        done(null);
      }
    });
    if (img?.data && (!best || img.width * img.height > best.width * best.height)) best = img;
  }
  await doc.destroy();
  return best;
}

/** Cắt vùng (tỷ lệ 0–1), chuyển xám, thu nhỏ về rộng tối đa `maxW`, đóng gói ảnh BMP 24-bit cho bộ nhận dạng */
function cropBmp(img: Img, x0: number, y0: number, x1: number, y1: number, maxW = 1400) {
  const ch = img.kind === 3 ? 4 : img.kind === 2 ? 3 : 0;
  if (!ch) return null; // ảnh 1 bit / lạ: bỏ qua
  const sx = Math.floor(img.width * x0);
  const sy = Math.floor(img.height * y0);
  const sw = Math.max(1, Math.floor(img.width * (x1 - x0)));
  const sh = Math.max(1, Math.floor(img.height * (y1 - y0)));
  const k = Math.max(1, sw / maxW);
  const w = Math.max(1, Math.floor(sw / k));
  const h = Math.max(1, Math.floor(sh / k));
  const row = Math.ceil((w * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + row * h);
  buf.write('BM', 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) {
    const srcY = sy + Math.floor(y * k);
    const out = 54 + (h - 1 - y) * row; // BMP lưu từ dưới lên
    for (let x = 0; x < w; x++) {
      const p = (srcY * img.width + sx + Math.floor(x * k)) * ch;
      const g = Math.round(0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2]);
      buf[out + x * 3] = buf[out + x * 3 + 1] = buf[out + x * 3 + 2] = g;
    }
  }
  return buf;
}

type Worker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
let worker: Promise<Worker> | null = null;
/** Một bộ nhận dạng dùng chung, tạo khi cần lần đầu */
function getWorker() {
  if (!worker) {
    mkdirSync(CACHE_DIR, { recursive: true });
    worker = import('tesseract.js').then((t) => t.createWorker('eng', 1, { cachePath: CACHE_DIR })).catch((e) => {
      worker = null;
      throw e;
    });
  }
  return worker;
}
// Chạy lần lượt (một bộ nhận dạng)
let queue: Promise<unknown> = Promise.resolve();
async function recognize(image: Buffer, whitelist: string) {
  const run = queue.then(async () => {
    const w = await getWorker();
    await w.setParameters({ tessedit_char_whitelist: whitelist });
    return (await w.recognize(image)).data.text;
  });
  queue = run.catch(() => undefined);
  return run;
}

export interface SignOcr {
  /** Mã đặt chỗ đọc được sau "BK :" */
  bk: string | null;
  /** Tên khách chữ Latin (vd "KIM SONI") */
  name: string | null;
  /** Toàn bộ chữ đọc được (ảnh) */
  text?: string;
}

/** Bảng đón là file ảnh (JPG / PNG / WEBP): đọc cả ảnh, lấy mã sau "BK" */
export async function readSignPhoto(data: Buffer): Promise<SignOcr> {
  try {
    const text = await recognize(data, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ: 0123456789');
    return { bk: text.match(/BK\s*:?\s*(\d{6,12})/)?.[1] ?? null, name: null, text };
  } catch (e) {
    logger.warn(`Không đọc được ảnh bảng đón: ${(e as Error).message}`);
    return { bk: null, name: null };
  }
}

/** Đọc mã BK và tên khách trên bảng đón PDF dạng ảnh; không đọc được thì trả null (văn phòng tự chọn booking) */
export async function readSignImage(data: Uint8Array): Promise<SignOcr> {
  try {
    const img = await pdfImage(data);
    if (!img) return { bk: null, name: null };
    // Góc trên trái: "BK : 200815217"
    const top = cropBmp(img, 0, 0, 0.6, 0.2);
    const bkText = top ? await recognize(top, 'BK: 0123456789') : '';
    const bk = bkText.replace(/\s+/g, ' ').match(/(\d{6,12})/)?.[1] ?? null;
    // Giữa – dưới: tên chữ Latin
    const mid = cropBmp(img, 0.05, 0.6, 0.95, 0.85);
    const nameText = mid ? await recognize(mid, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ') : '';
    const name = nameText.replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim() || null;
    return { bk, name };
  } catch (e) {
    logger.warn(`Không đọc được bảng đón: ${(e as Error).message}`);
    return { bk: null, name: null };
  }
}
