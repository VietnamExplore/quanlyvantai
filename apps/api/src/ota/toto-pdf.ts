import type { TotoRow } from './toto.service';

/**
 * Đọc file PDF trang chi tiết đặt chỗ của TOTO Booking (trang nhà cung cấp → mở một booking → In / Lưu PDF).
 * Trang có thêm số chuyến bay, SĐT / email khách, địa chỉ cụ thể, yêu cầu của khách, trạng thái – những thứ file Excel không có.
 */

/** Chữ trên PDF theo thứ tự vẽ: cùng dòng thì nối (cách xa thì thêm dấu cách), khác dòng thì xuống dòng */
export async function pdfText(data: Uint8Array) {
  // pdfjs là ESM: nạp động (máy chủ biên dịch CommonJS)
  const pdfjs = await (new Function('s', 'return import(s)') as (s: string) => Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>)('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    let out = '';
    let prev: { x: number; y: number; w: number } | null = null;
    for (const it of tc.items as { str?: string; transform: number[]; width: number; hasEOL?: boolean }[]) {
      if (it.str === undefined) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      const h = Math.abs(it.transform[3]) || 8;
      if (prev) {
        if (Math.abs(y - prev.y) > h * 0.5 || x < prev.x - 2) out += '\n';
        else if (x - (prev.x + prev.w) > h * 0.25) out += ' ';
      }
      out += it.str;
      if (it.str) prev = { x, y, w: it.width };
      if (it.hasEOL) {
        out += '\n';
        prev = null;
      }
    }
    pages.push(out);
  }
  return pages.join('\n').replace(/[ \t ]+\n/g, '\n').replace(/\n{2,}/g, '\n');
}

/** Thông tin thêm chỉ có trên trang chi tiết */
export interface TotoDetail {
  status: string;
  flightNumber: string | null;
  phone: string | null;
  email: string | null;
  requestMemo: string | null;
  /** Địa chỉ cụ thể của điểm đón / trả (vd "80 Le Manh Trinh, Danang, Viet Nam") */
  pickupDetail: string | null;
  dropDetail: string | null;
}

export type TotoPdfRow = TotoRow & { detail: TotoDetail };

const lines = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    // Bỏ dòng chỉ có biểu tượng (icon của trang web)
    .filter((l) => /[\p{L}\p{N}]/u.test(l));

/** Một trang chi tiết (phần sau "Total Amount") → dòng booking */
function parseDetail(text: string): TotoPdfRow | null {
  const at = text.search(/Total Amount\s*\(/);
  if (at < 0) return null;
  const body = text.slice(at);
  // Mã đặt chỗ của trang chi tiết: dòng chỉ có số ở cuối trang (tiêu đề trang chi tiết)
  const ids = [...text.matchAll(/^\s*(\d{6,12})\s*$/gm)].map((m) => m[1]);
  const listIds = [...text.matchAll(/^\s*\d+\s+(\d{6,12})\s+\w+/gm)].map((m) => m[1]);
  const reservationId = ids[ids.length - 1] ?? (listIds.length === 1 ? listIds[0] : null);
  if (!reservationId) return null;

  // Giá: "432,000 VND" + "( 432,000 VND x 1Unit)"
  const price = body.match(/([\d.,]+)\s*VND\s*\n?\s*\(\s*([\d.,]+)\s*VND\s*x\s*(\d+)\s*Unit\)/i);
  const amountVnd = price ? Number(price[1].replace(/[.,]/g, '')) : Number(body.match(/Total Amount\([^)]*\)\s*([\d.,]+)/)?.[1]?.replace(/[.,]/g, '') ?? 0) * 1000;
  // Tên sản phẩm: giữa dòng "Total Amount … VND" và dòng giá
  const head = body.match(/Total Amount\([^)]*\)[^\n]*\n([\s\S]*?)\n[\d.,]+\s*VND/);
  const programName = head ? lines(head[1]).join(' ').replace(/\|\s*$/, '').replace(/\s+\|\s*/g, ' | ').trim() : '';
  const afterPrice = price ? body.slice(body.indexOf(price[0]) + price[0].length) : body;
  const status = lines(afterPrice)[0] ?? '';
  // "2026-10-21(Wed) BX773 23:50" (chuyến bay có thể không có)
  const dt = afterPrice.match(/(\d{4}-\d{2}-\d{2})\s*\(\w+\)\s+(?:([A-Z0-9]{2}\s?\d{1,4}[A-Z]?)\s+)?(\d{1,2}:\d{2})/);
  const pax = afterPrice.match(/(\d+)\s*Adults?[^,\n]*,\s*(\d+)\s*Child[^,\n]*,\s*(\d+)\s*Infant/i);
  // Điểm đi / đến (tên ngắn) rồi khối "… Voucher(…)": điểm đón cụ thể, điểm trả cụ thể, tên khách, SĐT, email
  const dep = afterPrice.match(/DEPARTURE\([^)]*\)\s*\n([^\n]+)\n\s*ARRIVAL\([^)]*\)\s*\n([^\n]+)/);
  const voucherAt = afterPrice.search(/Voucher\s*\(/);
  const after = voucherAt >= 0 ? lines(afterPrice.slice(afterPrice.indexOf('\n', voucherAt) + 1)) : [];
  const phoneAt = after.findIndex((l) => /^\+?[\d][\d\s().-]{6,}$/.test(l));
  const emailAt = after.findIndex((l) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l));
  const contactAt = phoneAt >= 0 ? phoneAt : emailAt;
  // Trước SĐT: [điểm đón cụ thể, điểm trả cụ thể, tên khách]
  const before = contactAt > 0 ? after.slice(0, contactAt) : after.slice(0, 3);
  const name = before.length ? before[before.length - 1] : '';
  const places = before.slice(0, -1);
  const memo = afterPrice.match(/requestMemo[ \t]*:[ \t]*([^\n]*)/)?.[1]?.trim() || null;
  const carType = programName.match(/\[(\d+\s*Seats?)\]/i)?.[1] ?? '';
  const adult = Number(pax?.[1] ?? 0);
  const child = Number(pax?.[2] ?? 0);
  const infant = Number(pax?.[3] ?? 0);
  return {
    reservationId,
    carType,
    programName,
    route: dep ? `${dep[1].trim()} - ${dep[2].trim()}` : '',
    meetingPlace: places[0] ?? dep?.[1]?.trim() ?? '',
    dropPlace: places[1] ?? dep?.[2]?.trim() ?? '',
    customerName: name,
    meetingTime: dt ? `${dt[1]} ${dt[3]}` : '',
    adult,
    child,
    infant,
    totalPax: adult + child + infant,
    checkInDate: dt?.[1] ?? '',
    // Cùng đơn vị với file Excel: nghìn đồng
    totalAmount: amountVnd / 1000,
    additionalOption: '',
    detail: {
      status,
      flightNumber: dt?.[2]?.replace(/\s/g, '') ?? null,
      phone: phoneAt >= 0 ? after[phoneAt] : null,
      email: emailAt >= 0 ? after[emailAt] : null,
      requestMemo: memo && !/^NO DATA/i.test(memo) ? memo : null,
      pickupDetail: places[0] ?? null,
      dropDetail: places[1] ?? null,
    },
  };
}

export async function parseTotoPdf(data: Uint8Array) {
  const text = await pdfText(data);
  if (!/TOTOSYS|Total Amount\s*\(/i.test(text)) throw new Error('Không phải trang chi tiết đặt chỗ TOTO Booking');
  const row = parseDetail(text);
  if (!row) throw new Error('Không đọc được mã đặt chỗ / giá trên trang chi tiết TOTO');
  return row;
}
