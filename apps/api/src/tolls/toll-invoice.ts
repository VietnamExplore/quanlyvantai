/**
 * Đọc hóa đơn điện tử ePass (Công ty CP Giao thông số Việt Nam – VDTC): mỗi dòng hàng hóa là một lượt xe qua trạm
 * "Cước đường bộ phương tiện 43F00747, Loại 2, đi qua trạm Phú Bài. Thời gian giao dịch: 17/09/2026 09:28:52, mã GD 3353813215"
 * kèm thành tiền chưa thuế; thuế suất ở cuối hóa đơn. Hỗ trợ file PDF (bản thể hiện) và XML (dữ liệu gốc hóa đơn).
 */

export interface TollLine {
  txId: string;
  plate: string;
  vehicleClass: number | null;
  station: string;
  /** Giờ Việt Nam */
  passedAt: Date;
  amountNet: number;
  vatPercent: number;
  /** Số thực trả (gồm thuế), làm tròn đồng */
  amount: number;
  invoiceNo: string | null;
  invoiceDate: Date | null;
}

export interface ParsedInvoice {
  invoiceNo: string | null;
  invoiceDate: Date | null;
  lines: TollLine[];
  /** Tổng thanh toán in trên hóa đơn (để đối chiếu) */
  total: number | null;
}

const vnNumber = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const vnDateTime = (s: string) => {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? '00'}+07:00`) : null;
};

/** Một dòng mô tả → lượt qua trạm (chưa có tiền) */
function parseDescription(text: string) {
  const t = text.replace(/\s+/g, ' ').trim();
  const plate = t.match(/phương tiện\s+([0-9]{2}[A-Z]{1,2}[0-9A-Z]{4,6})/i)?.[1];
  const time = t.match(/Thời gian giao dịch:?\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?)/i)?.[1];
  const txId = t.match(/mã GD:?\s*([0-9A-Za-z-]+)/i)?.[1];
  if (!plate || !time || !txId) return null;
  const station =
    t.match(/(?:đi qua|qua)\s+(.+?)\.\s*Thời gian/i)?.[1]?.replace(/^trạm\s+(thu phí\s+)?/i, '').trim() ??
    t.match(/tại\s+(.+?)\.\s*Thời gian/i)?.[1]?.trim() ??
    '';
  const cls = t.match(/Loại\s*(\d+)/i)?.[1];
  return { plate: plate.toUpperCase(), time: vnDateTime(time)!, txId, station, vehicleClass: cls ? Number(cls) : null, text: t };
}

const withVat = (net: number, vat: number) => Math.round(net * (1 + vat / 100));

/** Hóa đơn XML (định dạng hóa đơn điện tử theo Thông tư 78) */
export function parseInvoiceXml(xml: string): ParsedInvoice {
  const tag = (src: string, name: string) => src.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? null;
  const invoiceNo = tag(xml, 'SHDon');
  const nlap = tag(xml, 'NLap');
  const invoiceDate = nlap ? new Date(`${nlap.slice(0, 10)}T00:00:00Z`) : null;
  const rateText = tag(xml, 'TSuat') ?? '';
  const defaultVat = Number(rateText.replace('%', '')) || 0;
  const lines: TollLine[] = [];
  for (const m of xml.matchAll(/<HHDVu>([\s\S]*?)<\/HHDVu>/g)) {
    const d = parseDescription(tag(m[1], 'THHDVu') ?? '');
    if (!d) continue;
    const net = Number(tag(m[1], 'ThTien') ?? 0);
    const vat = Number((tag(m[1], 'TSuat') ?? '').replace('%', '')) || defaultVat;
    lines.push({ txId: d.txId, plate: d.plate, vehicleClass: d.vehicleClass, station: d.station, passedAt: d.time, amountNet: net, vatPercent: vat, amount: withVat(net, vat), invoiceNo, invoiceDate });
  }
  const total = Number(tag(xml, 'TgTTTBSo') ?? NaN);
  return { invoiceNo, invoiceDate, lines, total: Number.isFinite(total) ? total : null };
}

/** Chữ trên trang PDF theo dòng (gom theo tọa độ y), mỗi mục có tọa độ x */
type Row = { y: number; items: { x: number; s: string }[] };

/** Hóa đơn PDF: cột mô tả nằm giữa, cột STT bên trái, cột thành tiền bên phải */
export async function parseInvoicePdf(data: Uint8Array): Promise<ParsedInvoice> {
  // pdfjs là ESM: nạp động (máy chủ biên dịch CommonJS)
  const pdfjs = (await (new Function('s', 'return import(s)') as (s: string) => Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>)('pdfjs-dist/legacy/build/pdf.mjs'));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const rows: Row[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const pageRows: Row[] = [];
    for (const it of tc.items as { str: string; transform: number[] }[]) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      let row = pageRows.find((r) => Math.abs(r.y - y) <= 2);
      if (!row) pageRows.push((row = { y, items: [] }));
      row.items.push({ x: Math.round(it.transform[4]), s: it.str });
    }
    pageRows.sort((a, b) => b.y - a.y).forEach((r) => r.items.sort((a, b) => a.x - b.x));
    rows.push(...pageRows);
  }
  const all = rows.map((r) => r.items.map((x) => x.s).join(' ')).join('\n');
  const invoiceNo = all.match(/Số\s+(\d{3,})/)?.[1] ?? null;
  const d = all.match(/Ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/);
  const invoiceDate = d ? new Date(`${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}T00:00:00Z`) : null;
  const vat = Number(all.match(/Thuế suất GTGT:?\s*(\d+(?:[.,]\d+)?)\s*%/)?.[1]?.replace(',', '.') ?? 0);
  const total = all.match(/Tổng cộng tiền thanh toán:?\s*([\d.]+)/)?.[1];

  // Vùng bảng: từ dòng tiêu đề "Thành tiền" đến "Cộng tiền hàng"
  const head = rows.findIndex((r) => r.items.some((x) => /Thành tiền/.test(x.s)));
  const amountX = head >= 0 ? (rows[head].items.find((x) => /Thành tiền/.test(x.s))?.x ?? 450) - 30 : 440;
  const descParts: string[] = [];
  const amounts: number[] = [];
  for (let i = head + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.items.some((x) => /Cộng tiền hàng|Tổng cộng/.test(x.s))) break;
    for (const it of r.items) {
      if (it.x >= amountX && /^[\d.]+(,\d+)?$/.test(it.s.trim())) amounts.push(vnNumber(it.s.trim()));
      else if (it.x < 60 && /^\d+$/.test(it.s.trim())) continue; // STT
      else descParts.push(it.s);
    }
  }
  // Mỗi lượt kết thúc bằng "mã GD …"
  const chunks = [...descParts.join(' ').matchAll(/[\s\S]*?mã GD:?\s*[0-9A-Za-z-]+/gi)].map((m) => m[0].trim());
  const parsed = chunks.map(parseDescription).filter((x): x is NonNullable<ReturnType<typeof parseDescription>> => !!x);
  if (parsed.length !== amounts.length) {
    throw new Error(`Không đọc được bảng hóa đơn${invoiceNo ? ` số ${invoiceNo}` : ''}: ${parsed.length} lượt qua trạm nhưng ${amounts.length} dòng tiền`);
  }
  const lines = parsed.map((p, i) => ({
    txId: p.txId,
    plate: p.plate,
    vehicleClass: p.vehicleClass,
    station: p.station,
    passedAt: p.time,
    amountNet: amounts[i],
    vatPercent: vat,
    amount: withVat(amounts[i], vat),
    invoiceNo,
    invoiceDate,
  }));
  return { invoiceNo, invoiceDate, lines, total: total ? vnNumber(total) : null };
}

/** Phí ra vào sân bay (cảng hàng không) hay cước đường bộ */
export const isAirport = (station: string) => /sân bay|cảng hàng không|\bCHK|airport|cảng HK/i.test(station);

/** Biển số chỉ còn chữ và số, chữ hoa: "43F-007.47" → "43F00747" */
export const plateKey = (plate: string) => plate.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
