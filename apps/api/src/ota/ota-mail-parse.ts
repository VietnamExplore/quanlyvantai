/**
 * Đọc email thông báo booking của các kênh OTA (GetYourGuide, Viator, Vé xe rẻ, 12Go, Agoda / GlobalTix…).
 * Mỗi kênh nhận diện theo địa chỉ gửi / nội dung (cả email được chuyển tiếp); kênh đã có mẫu thì đọc ra booking,
 * kênh chưa có mẫu chỉ nhận diện email đặt / đổi / hủy để báo điều hành nhập tay.
 * Chỉ email đúng mẫu đặt / đổi / hủy mới xử lý – tin nhắn của khách, email quảng cáo, báo cáo… bỏ qua.
 */

export type MailKind = 'BOOKING' | 'CHANGE' | 'CANCEL' | 'OTHER';

export interface OtaChannel {
  code: string;
  name: string;
  /** Địa chỉ gửi / tên miền */
  from: RegExp;
  /** Dấu hiệu trong tiêu đề / nội dung (email được chuyển tiếp) */
  mark?: RegExp;
  /** Tên khách hàng (đại lý) văn phòng đã tạo cho kênh, vd "Getyourguide VNE" */
  alias: RegExp;
}

/** Các kênh OTA công ty bán */
export const OTA_CHANNELS: OtaChannel[] = [
  { code: 'GYG', name: 'GetYourGuide', from: /getyourguide\.com/i, mark: /\bS\d{5,7} - GYG[A-Z0-9]{6,}/i, alias: /get ?your ?guide|\bgyg\b/i },
  { code: 'KLOOK', name: 'Klook', from: /klook\.com/i, mark: /\bklook\b/i, alias: /klook/i },
  { code: 'KKDAY', name: 'KKday', from: /kkday\.com/i, mark: /\bkkday\b/i, alias: /kkday/i },
  { code: 'VIATOR', name: 'Viator', from: /viator\.com/i, mark: /\bviator\b/i, alias: /viator/i },
  { code: 'TRIPCOM', name: 'Trip.com', from: /trip\.com|ctrip\.com/i, mark: /\btrip\.com\b|\bctrip\b/i, alias: /trip\.?com|ctrip/i },
  { code: 'TRAVELOKA', name: 'Traveloka', from: /traveloka\.com/i, mark: /\btraveloka\b/i, alias: /traveloka/i },
  { code: 'AGODA', name: 'Agoda', from: /agoda\.com/i, mark: /\bagoda\b/i, alias: /agoda/i },
  { code: 'BOOKINGCOM', name: 'Booking.com', from: /booking\.com/i, mark: /\bbooking\.com\b/i, alias: /booking\.com/i },
  { code: 'EXPEDIA', name: 'Expedia', from: /expedia\.com|expediapartnercentral/i, mark: /\bexpedia\b/i, alias: /expedia/i },
  { code: 'VEXERE', name: 'Vé Xe Rẻ', from: /vexere\.com/i, mark: /\bvexere\b|v[ée] xe r[ẻe]/i, alias: /v[ée] ?xe ?r[ẻe]|vexere/i },
  { code: 'REDBUS', name: 'redBus', from: /redbus\./i, mark: /\bredbus\b/i, alias: /redbus/i },
  { code: 'EASYBOOK', name: 'Easybook', from: /easybook\.com/i, mark: /\beasybook\b/i, alias: /easybook/i },
  { code: '12GO', name: '12Go', from: /12go\.(asia|co|com)/i, mark: /\b12go\b/i, alias: /12 ?go\b/i },
];
const channel = (code: string) => OTA_CHANNELS.find((c) => c.code === code)!;

/** Một booking đọc được từ email */
export interface OtaMailBooking {
  ref: string;
  product: string;
  /** Giờ đón / khởi hành (giờ Việt Nam, ISO) */
  pickupTime: string | null;
  adults: number;
  children: number;
  customerName: string | null;
  customerEmail: string | null;
  phone: string | null;
  language: string | null;
  pickup: string | null;
  dropoff: string | null;
  /** Giá kênh OTA trả / khách trả, giữ nguyên số trên email */
  price: number | null;
  currency: string | null;
  priceText: string | null;
  /** Kênh chỉ bán vận chuyển (vé xe, 12Go): không cần xét tên sản phẩm */
  transport?: boolean;
  /** Xe ghép / bus theo tuyến, vd "Đà Nẵng - Hội An" (dò tuyến xe ghép) */
  busRoute?: string | null;
  /** Email không có số khách / giá: booking để Nháp cho điều hành kiểm tra */
  review?: string | null;
  /** Ghi chú thêm vào booking */
  extra?: string[];
  /** Danh sách hành khách (tên, năm sinh) – 12Go PDF */
  travelers?: { name: string; birthYear: number | null }[];
  /** Email hủy một phần (Vé xe rẻ): số vé còn lại */
  remaining?: number;
  /** Giờ trên email là giờ đón tại điểm đón (không phải giờ xuất bến của tuyến) */
  atPickupStop?: boolean;
}

export interface ParsedMail {
  channel: OtaChannel | null;
  kind: MailKind;
  ref: string | null;
  /** Kênh có mẫu đọc: thông tin booking (đặt mới / đổi / hủy – có trường nào thì điền trường đó) */
  booking: Partial<OtaMailBooking> | null;
}

/** HTML email → chữ thường: mỗi khối / ô bảng một dòng */
export function htmlToText(html: string) {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|th|li|h\d|table|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&zwnj;|&zwj;|&shy;/gi, '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&copy;/gi, '©')
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[​-‍­]/g, '')
    .replace(/[ \t\r]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .trim();
}

/** Gộp thành một dòng, bỏ link / ký tự bảng để dò theo nhãn */
function flat(text: string) {
  return ` ${text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\(https?:\/\/[^)\s]*\)/g, ' ')
    .replace(/\[?https?:\/\/\S+/g, ' ')
    .replace(/[|#>*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthOf = (s: string) => MONTHS.indexOf(s.toLowerCase().slice(0, 3));
const pad = (n: number | string) => String(n).padStart(2, '0');
function iso(y: number, mon: number, d: number, h: number, mi: number | string) {
  if (mon < 0 || mon > 11 || d < 1 || d > 31 || h > 23) return null;
  return `${y}-${pad(mon + 1)}-${pad(d)}T${pad(h)}:${pad(mi)}:00+07:00`;
}
function hour(h: string, ap?: string) {
  let x = Number(h);
  if (ap?.toUpperCase() === 'PM' && x < 12) x += 12;
  if (ap?.toUpperCase() === 'AM' && x === 12) x = 0;
  return x;
}

/** "October 19, 2026, 12:00 PM" / "June 4, 2026 at 1:00 PM" / "Dec 03, 2026 09:00" → ISO giờ Việt Nam */
export function enDateTime(s: string) {
  const m = s.match(/([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})(?:,| at)? *(\d{1,2}):(\d{2}) *(AM|PM)?/i);
  return m ? iso(Number(m[3]), monthOf(m[1]), Number(m[2]), hour(m[4], m[6]), m[5]) : null;
}

/** "06 Oct 2026 11:30 AM" / "10-Oct-26 08:30:00" → ISO giờ Việt Nam */
export function dmyDateTime(s: string) {
  const m = s.match(/(\d{1,2})[ -]([A-Za-z]{3,9})[ -](\d{2,4})\s+(\d{1,2}):(\d{2})(?::\d{2})? *(AM|PM)?/i);
  if (!m) return null;
  const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  return iso(y, monthOf(m[2]), Number(m[1]), hour(m[4], m[6]), m[5]);
}

/** "20/10/2026" + "10:15" → ISO giờ Việt Nam */
function vnDateTime(date: string, time: string) {
  const d = date.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const t = time.match(/(\d{1,2}):(\d{2})/);
  return d && t ? iso(Number(d[3]), Number(d[2]) - 1, Number(d[1]), Number(t[1]), t[2]) : null;
}

/** Tên sản phẩm GetYourGuide lặp 2 lần liền nhau ("X X") → "X" */
function undouble(s: string) {
  const t = s.trim();
  const half = t.slice(0, Math.floor(t.length / 2)).trim();
  return half && t === `${half} ${half}` ? half : t;
}

/** "₫ 600,000" / "VND 1.200.000" / "VND 390000.0" / "127.500 VND" / "US$ 25.00" → số + đơn vị tiền */
export function money(s: string): { price: number | null; currency: string | null } {
  const m = s.match(/(₫|VND|US\$|\$|€|EUR|USD|KRW|₩|SGD|JPY|¥)\s*([\d.,]+)|([\d.,]+)\s*(₫|VND|đ|USD|EUR)/i);
  if (!m) return { price: null, currency: null };
  const cur = (m[1] ?? m[4]).toUpperCase();
  const raw = (m[2] ?? m[3]).replace(/[.,]$/, '');
  const currency = /₫|VND|Đ/.test(cur) ? 'VND' : /US\$|USD|^\$$/.test(cur) ? 'USD' : /€|EUR/.test(cur) ? 'EUR' : /₩|KRW/.test(cur) ? 'KRW' : cur;
  let price: number;
  if (currency === 'VND' || currency === 'KRW') {
    // "390000.0" (số thập phân) / "1,200,000" / "127.500" (dấu nghìn)
    price = /^\d+[.,]\d{1,2}$/.test(raw) ? Math.round(Number(raw.replace(',', '.'))) : Number(raw.replace(/[.,\s]/g, ''));
  } else price = Number(raw.replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(price) ? { price, currency } : { price: null, currency };
}

/** Chữ giữa nhãn `from` và nhãn kế tiếp */
function between(t: string, from: RegExp, to: RegExp) {
  const a = t.search(from);
  if (a < 0) return null;
  const rest = t.slice(a).replace(from, '');
  const b = rest.search(to);
  return (b < 0 ? rest : rest.slice(0, b)).trim() || null;
}

/** Giá trị của nhãn trong danh sách nhãn (đến nhãn bất kỳ kế tiếp) */
function field(t: string, label: string, labels: string[]) {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return between(t, new RegExp(` ${esc(label)}\\s*`), new RegExp(` (?:${labels.filter((l) => l !== label).map(esc).join('|')})`));
}

const digits = (s: string | null | undefined) => {
  const v = (s ?? '').replace(/[^\d+]/g, '');
  return v.replace(/(?!^)\+/g, '') || null;
};

/** Số người lớn / trẻ em: "2 x Adult (Age 0 - 99), 1 x Child", "2 Adults, 1 Child", "1 Adult" */
function paxOf(s: string) {
  let adults = 0;
  let children = 0;
  for (const m of s.matchAll(/(\d+)\s*x?\s*(adults?|child(?:ren)?|infants?|youths?|kids?|seniors?|students?|travell?ers?|people|persons?|participants?)/gi)) {
    if (/child|infant|youth|kid/i.test(m[2])) children += Number(m[1]);
    else adults += Number(m[1]);
  }
  if (!adults && !children) adults = Number(s.match(/\d+/)?.[0] ?? 0);
  return { adults, children };
}

/** GetYourGuide – chỉ 4 mẫu: "Booking - S… - GYG…", "Urgent: New booking received - …", "Booking detail change: - …", "A booking has been canceled - …" */
function parseGyg(subject: string, text: string): ParsedMail {
  const ch = channel('GYG');
  const t = flat(text);
  const ref = subject.match(/\bGYG[A-Z0-9]{8,}\b/)?.[0] ?? null;
  const isBooking = /^(urgent: )?(new booking received|booking) - S\d+ - GYG/i.test(subject);
  const isChange = /^booking detail change:? - S\d+ - GYG/i.test(subject);
  const isCancel = /^a booking has been cancell?ed - S\d+ - GYG/i.test(subject);
  if (!ref || !(isBooking || isChange || isCancel)) return { channel: ch, kind: 'OTHER', ref, booking: null };
  if (isCancel) {
    return {
      channel: ch,
      kind: 'CANCEL',
      ref,
      booking: {
        product: undouble(between(t, / Tour: /, / Name: | Date: /) ?? ''),
        customerName: between(t, / Name: /, / Date: /),
        pickupTime: enDateTime(between(t, / Date: /, / Please | Best regards/) ?? ''),
      },
    };
  }
  if (isChange) {
    const pickup = between(t, / Pickup location /, / \(coordinates| Open in Google Maps| Number of participants/);
    const pax = paxOf(between(t, / Number of participants /, / Language| Contact/) ?? '');
    return {
      channel: ch,
      kind: 'CHANGE',
      ref,
      booking: {
        product: undouble(between(t, /following booking has changed\. /, / Booking reference/) ?? ''),
        pickupTime: enDateTime(between(t, / Date /, / Pickup location| Number of participants/) ?? ''),
        pickup,
        adults: pax.adults + pax.children || undefined,
        language: between(t, / Language /, / Contact customer|$/),
      },
    };
  }
  const product = undouble(between(t, /(?:has been booked|last-minute booking): /, / Reference number/) ?? '');
  const pax = paxOf(between(t, / Number of participants /, / Main customer| Tour language| Pickup| Price/) ?? '');
  const main = between(t, / Main customer /, / Tour language| Pickup| Price| Open booking/) ?? '';
  const email = main.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null;
  const priceText = between(t, / Price /, / Open booking| We.re here|$/);
  return {
    channel: ch,
    kind: 'BOOKING',
    ref,
    booking: {
      ref,
      product,
      pickupTime: enDateTime(between(t, / Date /, / Number of participants/) ?? ''),
      ...pax,
      customerName: (email ? main.slice(0, main.indexOf(email)) : main.split(/ Phone:/)[0]).trim() || null,
      customerEmail: email,
      phone: digits(main.match(/Phone: *(\+?[\d ()-]{6,})/)?.[1]),
      language: main.match(/Language: *([A-Za-z ]+)/)?.[1].trim() ?? null,
      pickup: between(t, / Pickup /, / Open in Google Maps| Price/),
      dropoff: between(t, / Drop-?off /i, / Open in Google Maps| Price/),
      priceText,
      ...money(priceText ?? ''),
    },
  };
}

/** Viator (booking@…viator.com): "New Booking for …", "Canceled Booking: …", "Amended Booking …" */
function parseViator(subject: string, text: string): ParsedMail {
  const ch = channel('VIATOR');
  const t = flat(text);
  const ref = (t.match(/Booking Reference: #?(BR-\d+)/i) ?? subject.match(/#?(BR-\d+)/))?.[1] ?? null;
  const kind: MailKind = /^cancell?ed booking|booking cancell?ed/i.test(subject) ? 'CANCEL' : /amend|changed|modif/i.test(subject) ? 'CHANGE' : /^new booking/i.test(subject) ? 'BOOKING' : 'OTHER';
  if (!ref || kind === 'OTHER') return { channel: ch, kind: 'OTHER', ref, booking: null };
  const L = ['Booking Reference:', 'Tour Name:', 'Travel Date:', 'Lead Traveler Name:', 'Traveler Names:', 'Travelers:', 'Product Code:', 'Tour Grade:', 'Tour Grade Code:', 'Tour Grade Description:', 'Tour Option:', 'Tour Language:', 'Location:', 'Net Rate:', 'Pickup Point/Meeting point:', 'Date of Birth:', 'Special Requirements:', 'Phone:', 'Email:', 'Optional:', 'Canceled', 'Have questions'];
  const f = (l: string) => field(t, l, L);
  const time = (f('Tour Grade Code:') ?? '').match(/(\d{1,2}:\d{2})/)?.[1] ?? (f('Tour Grade:') ?? f('Tour Option:') ?? '').match(/(\d{1,2}:\d{2})\s*$/)?.[1] ?? '00:00';
  const date = (f('Travel Date:') ?? '').replace(/^[A-Za-z]{3},?\s*/, '');
  const product = f('Tour Name:') ?? (between(t, /BR-\d+ Canceled /, / Tour Option:/) || null) ?? '';
  const pax = paxOf(f('Travelers:') ?? '');
  const priceText = (f('Net Rate:') ?? '').replace(/\.$/, '') || null;
  const pickup = f('Pickup Point/Meeting point:');
  const extra = [f('Traveler Names:') && `Khách: ${f('Traveler Names:')}`, f('Special Requirements:') && !/^no$/i.test(f('Special Requirements:')!) ? `Yêu cầu: ${f('Special Requirements:')}` : null].filter((x): x is string => !!x);
  return {
    channel: ch,
    kind,
    ref,
    booking: {
      ref,
      product,
      pickupTime: enDateTime(`${date} ${time}`),
      ...pax,
      customerName: f('Lead Traveler Name:'),
      customerEmail: f('Email:')?.split(' ')[0] ?? null,
      phone: digits(f('Phone:')?.replace(/\(.*?\)|[A-Z]{2}(?=\+)/g, '').match(/\+?[\d ()-]{7,}/)?.[0]),
      language: (f('Tour Language:') ?? '').split(/\s*-\s*/)[0] || null,
      pickup: pickup && !/has not decided|select .*later/i.test(pickup) ? pickup : null,
      dropoff: null,
      priceText,
      ...money(priceText ?? ''),
      extra,
    },
  };
}

/** Vé xe rẻ (nhaxe@vexere.com): "VeXeRe đặt vé khách: …, Mã vé: X." / "VeXeRe HUỶ VÉ khách: …" */
function parseVexere(subject: string, text: string): ParsedMail {
  const ch = channel('VEXERE');
  const t = flat(text);
  const ref = subject.match(/Mã vé:\s*([A-Z0-9]{4,12})/i)?.[1] ?? null;
  const kind: MailKind = /hu[ỷỶyY] v[ée]/i.test(subject) ? 'CANCEL' : /đặt vé/i.test(subject) ? 'BOOKING' : /đổi|thay đổi/i.test(subject) ? 'CHANGE' : 'OTHER';
  if (!ref || kind === 'OTHER') return { channel: ch, kind: 'OTHER', ref, booking: null };
  const L = ['Tên khách:', 'Điện thoại:', 'Email:', 'Tuyến đường:', 'Ngày đi:', 'Giờ khởi hành:', 'Giờ đón dự kiến:', 'Sơ đồ ghế/giường:', 'Số lượng:', 'Số lượng ghế/giường đã hủy:', 'Số lượng ghế/giường còn lại:', 'Mã ghế/giường:', 'Giảm Giá NX:', 'Tổng tiền:', 'Đón tại:', 'Trả tại:', 'Trung chuyển đón tại:', 'Trung chuyển trả tại:', 'Khách đã', 'Khách chưa', 'Em cám ơn', 'Ghi chú:'];
  const f = (l: string) => field(t, l, L);
  const route = f('Tuyến đường:') ?? '';
  // Điểm đón / trả theo tuyến đường ("A - B (thuộc tuyến …)") khi email không ghi "Đón tại" / "Trả tại"
  const [routeFrom, routeTo] = route.replace(/\s*\(thuộc tuyến[^)]*\)/i, '').split(/\s+-\s+/);
  const transferFrom = f('Trung chuyển đón tại:');
  const transferTo = f('Trung chuyển trả tại:');
  const busRoute = route.match(/\(thuộc tuyến ([^)]+)\)/i)?.[1] ?? route;
  const qty = Number(f('Số lượng:')?.match(/\d+/)?.[0] ?? 0);
  const cancelled = Number(f('Số lượng ghế/giường đã hủy:')?.match(/\d+/)?.[0] ?? 0);
  const left = Number(f('Số lượng ghế/giường còn lại:')?.match(/\d+/)?.[0] ?? 0);
  const priceText = f('Tổng tiền:');
  const pickupAt = f('Giờ đón dự kiến:');
  const paid = t.match(/Khách (?:đã|chưa) thanh toán[^.]*/)?.[0]?.trim() ?? null;
  return {
    channel: ch,
    kind,
    ref,
    booking: {
      ref,
      product: `Vé xe ${route.replace(/\s*\(thuộc tuyến[^)]*\)/i, '')}`.trim(),
      pickupTime: vnDateTime(f('Ngày đi:') ?? '', f('Giờ khởi hành:') ?? ''),
      adults: qty || cancelled || 1,
      children: 0,
      customerName: f('Tên khách:'),
      customerEmail: f('Email:'),
      phone: digits(f('Điện thoại:')),
      language: 'Vietnamese',
      pickup: f('Đón tại:') ?? routeFrom ?? transferFrom,
      dropoff: f('Trả tại:') ?? routeTo ?? transferTo,
      priceText,
      ...money(priceText ?? ''),
      transport: true,
      busRoute,
      ...(kind === 'CANCEL' && { remaining: left }),
      extra: [
        pickupAt ? `Giờ đón dự kiến: ${pickupAt}` : null,
        f('Sơ đồ ghế/giường:') ? `Loại xe Vexere: ${f('Sơ đồ ghế/giường:')}` : null,
        f('Mã ghế/giường:') ? `Ghế: ${f('Mã ghế/giường:')}` : null,
        f('Giảm Giá NX:') ? `Giảm giá nhà xe: ${f('Giảm Giá NX:')}` : null,
        transferFrom ? `Trung chuyển đón tại: ${transferFrom}` : null,
        transferTo ? `Trung chuyển trả tại: ${transferTo}` : null,
        paid,
        kind === 'CANCEL' ? `Hủy ${cancelled} vé, còn ${left} vé` : null,
      ].filter((x): x is string => !!x),
    },
  };
}

/** Địa danh gần tọa độ nhất (trong bán kính, độ) – tên viết theo kiểu routeEnds nhận ra */
const CITY_POINTS: [string, number, number, number][] = [
  ['Ba Na', 16.026, 108.036, 0.05],
  ['Hoi An', 15.88, 108.33, 0.08],
  ['Da Nang', 16.05, 108.2, 0.16],
  ['Hue', 16.46, 107.59, 0.15],
  ['Nha Trang', 12.24, 109.19, 0.15],
  ['Da Lat', 11.94, 108.44, 0.15],
  ['Ha Noi', 21.03, 105.85, 0.2],
  ['Ha Long', 20.95, 107.07, 0.2],
  ['Ho Chi Minh', 10.78, 106.7, 0.25],
];
function cityOf(lat: number, lng: number) {
  const hit = CITY_POINTS.map(([name, la, ln, r]) => ({ name, r, d: Math.hypot(lat - la, lng - ln) }))
    .filter((x) => x.d <= x.r)
    .sort((a, b) => a.d / a.r - b.d / b.r)[0];
  return hit?.name ?? null;
}

/**
 * 12Go (noreply@12go.asia). Chỉ tạo booking từ email "Confirmed booking" (tiêu đề "#12GO… - 26 Sep 08:00, <đón>-<trả> for <khách>")
 * có PDF vé đính kèm: PDF ghi tuyến, giờ, loại xe, số khách, tên từng khách, địa chỉ điểm đón / trả; email ghi giá + liên hệ khách.
 * Email "PLEASE CONFIRM!! NEW BOOKING" (chưa đủ thông tin) bỏ qua. "Cancellation happened for booking 12GO…" → hủy.
 */
function parse12go(subject: string, text: string, pdf: string): ParsedMail {
  const ch = channel('12GO');
  const t = flat(text);
  const ref = (subject.match(/#?(12GO\d{6,})/i) ?? t.match(/(12GO\d{6,})/i))?.[1].toUpperCase() ?? null;
  if (!ref) return { channel: ch, kind: 'OTHER', ref, booking: null };
  if (/cancel/i.test(subject)) {
    return {
      channel: ch,
      kind: 'CANCEL',
      ref,
      booking: {
        product: between(t, / Direction: /, / Date \(time\)/) ?? undefined,
        pickupTime: dmyDateTime(between(t, / Date \(time\): /, / Number of seats/) ?? ''),
        adults: Number(between(t, / Number of seats: /, / Customer/)) || undefined,
        customerName: between(t, / Customer name: /, / Thank you|$/),
        transport: true,
      },
    };
  }
  const confirmed = /^#?12GO\d+ - .+ for /i.test(subject) || / Confirmed booking for /i.test(t);
  if (!confirmed || !/Booking ID/i.test(pdf)) return { channel: ch, kind: 'OTHER', ref, booking: null };
  const lines = pdf.split('\n').map((x) => x.trim()).filter(Boolean);
  const line = (re: RegExp) => lines.find((x) => re.test(x))?.replace(re, '').trim() || null;
  const from = line(/^From:\s*/);
  const to = line(/^To:\s*/);
  // Địa chỉ đầy đủ (có tên thành phố) ngay sau tên điểm trong khối "Boarding point" / "Arrival point"
  const addressAfter = (label: string, name: string | null) => {
    const i = lines.findIndex((x) => x === label);
    const next = i >= 0 ? lines.slice(i + 1, i + 4) : [];
    const addr = next.find((x, k) => k > 0 && !/^Coordinates|^Arrival point|^Login|^Booking#/i.test(x) && x !== name);
    return addr && /,/.test(addr) ? addr : null;
  };
  const fromAddr = addressAfter('Boarding point', from);
  const toAddr = addressAfter('Arrival point', to);
  // Thành phố theo tọa độ điểm đón / trả (có điểm chỉ ghi số nhà, vd "35 Dao Duy Tu")
  const cityAt = (label: string) => {
    const i = lines.findIndex((x) => x === label);
    const c = (i >= 0 ? lines.slice(i + 1, i + 5) : []).find((x) => /^Coordinates/i.test(x))?.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    return c ? cityOf(Number(c[1]), Number(c[2])) : null;
  };
  const fromCity = cityAt('Boarding point');
  const toCity = cityAt('Arrival point');
  const paxLine = lines.find((x) => /^PASSENGERS\b/i.test(x)) ?? '';
  const adults = Number(paxLine.match(/Adults?\s+(\d+)/i)?.[1] ?? 0);
  const children = Number(paxLine.match(/Child(?:ren)?\s+(\d+)/i)?.[1] ?? 0) + Number(paxLine.match(/Infants?\s+(\d+)/i)?.[1] ?? 0);
  const pi = lines.findIndex((x) => /^PASSENGERS\b/i.test(x));
  const travelers: { name: string; birthYear: number | null }[] = [];
  for (const x of pi >= 0 ? lines.slice(pi + 1) : []) {
    if (/^INFORMATION\b/i.test(x)) break;
    const m = x.match(/^(.+?)\s*\((\d{1,2} [A-Za-z]{3} (\d{4}))\)$/);
    travelers.push({ name: (m?.[1] ?? x).trim(), birthYear: m ? Number(m[3]) : null });
  }
  const priceText = t.match(/Total paid ([A-Z]{3} [\d.,]+)/i)?.[1] ?? null;
  // Liên hệ khách: tên, SĐT, email (các dòng sau "Customer's contact information:")
  const contact = between(t, / Customer.s contact information: /, / Thank you/) ?? '';
  const phone = contact.match(/\+?\d[\d ()-]{6,}\d/)?.[0] ?? null;
  const email = contact.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null;
  const name = (phone ? contact.slice(0, contact.indexOf(phone)) : contact).trim() || subject.match(/ for (.+)$/)?.[1]?.trim() || null;
  const cls = line(/^Class:\s*/);
  return {
    channel: ch,
    kind: 'BOOKING',
    ref,
    booking: {
      ref,
      product: `12Go: ${from ?? '?'} → ${to ?? '?'}${cls ? ` (${cls})` : ''}`,
      pickupTime: dmyDateTime(line(/^Date:\s*/) ?? ''),
      adults: adults || (children ? 0 : travelers.length || 1),
      children,
      customerName: name,
      customerEmail: email,
      phone: digits(phone),
      language: null,
      pickup: from,
      dropoff: to,
      priceText,
      ...money(priceText ?? ''),
      transport: true,
      busRoute: `${fromCity ?? fromAddr ?? from ?? ''} - ${toCity ?? toAddr ?? to ?? ''}`,
      atPickupStop: true,
      travelers,
      extra: [fromAddr && `Điểm đón: ${fromAddr}`, toAddr && `Điểm trả: ${toAddr}`, cls && `Loại xe 12Go: ${cls}`].filter((x): x is string => !!x),
    },
  };
}

/** GlobalTix (ticket@globaltix.com) – bán lại qua Agoda / Klook / Traveloka…: "New Purchased Tickets <mã>" */
function parseGlobaltix(subject: string, text: string): ParsedMail {
  const t = flat(text);
  const reseller = between(t, / Reseller Name /, / Customer Name/) ?? '';
  const ch = OTA_CHANNELS.find((c) => c.alias.test(reseller) || c.mark?.test(reseller)) ?? null;
  const ref = (t.match(/Reference Number\s*:\s*([A-Z0-9]{6,})/i) ?? subject.match(/\b([A-Z0-9]{8,})\b/))?.[1] ?? null;
  const kind: MailKind = /cancel|refund|revok/i.test(subject) ? 'CANCEL' : /new purchased/i.test(subject) ? 'BOOKING' : 'OTHER';
  if (!ch || !ref || kind === 'OTHER') return { channel: ch, kind: 'OTHER', ref, booking: null };
  // Mỗi vé một khối "Confirmation Code …": cộng số khách, tiền
  const items = t.split(/ Confirmation Code /).slice(1);
  let adults = 0;
  let children = 0;
  let total = 0;
  let product = '';
  let pickupTime: string | null = null;
  for (const it of items) {
    const qty = Number(it.match(/QUANTITY (\d+)/)?.[1] ?? 1);
    const type = it.match(/QUANTITY \d+ (\w+)/)?.[1] ?? 'ADULT';
    if (/CHILD|INFANT/i.test(type)) children += qty;
    else adults += qty;
    total += qty * (money(it.match(/UNIT PRICE ([A-Z$₫]+ ?[\d.,]+)/)?.[1] ?? '').price ?? 0);
    product ||= (between(it, /^[A-Z0-9]+ /, / Date\/Time:/) ?? '').trim();
    pickupTime ??= dmyDateTime(it.match(/Date\/Time: (\d{1,2} [A-Za-z]{3,9} \d{4} \d{1,2}:\d{2} ?(?:AM|PM)?)/i)?.[1] ?? '');
  }
  const contact = items[0]?.match(/CONTACT_NUMBER_WITH_COUNTRY_CODE ([\d+ ]{7,})/)?.[1];
  return {
    channel: ch,
    kind,
    ref,
    booking: {
      ref,
      product: product.replace(/^(.+?) \1$/, '$1'),
      pickupTime,
      adults,
      children,
      customerName: between(t, / Customer Name /, / Customer Email/),
      customerEmail: between(t, / Alternate Email /, / Mobile Number/),
      phone: digits(contact ?? between(t, / Mobile Number /, / NRIC/)),
      language: null,
      pickup: null,
      dropoff: null,
      price: total || null,
      currency: total ? 'VND' : null,
      priceText: total ? `VND ${total.toLocaleString('en-US')} (${items.length} vé, qua GlobalTix)` : null,
      extra: [`Đặt qua GlobalTix · ${reseller}`, between(t, / Remarks /, / Summary/) ? `Ghi chú: ${between(t, / Remarks /, / Summary/)}` : null].filter((x): x is string => !!x),
    },
  };
}

/** Kênh chưa có mẫu: chỉ nhận diện email đặt / đổi / hủy theo tiêu đề */
function kindOf(subject: string): MailKind {
  const s = subject.toLowerCase();
  if (/review|newsletter|promo|invoice|payout|payment|statement|report|webinar|survey|optimi[sz]e|messaged you|message from|tips|policy|update your|account|verify|password/.test(s)) return 'OTHER';
  if (/cancel|hủy|huỷ|refund/.test(s)) return 'CANCEL';
  if (/amend|modif|thay đổi|booking (?:has )?changed|change request/.test(s)) return 'CHANGE';
  if (/new (?:booking|order|reservation)|booking confirm|order confirm|reservation confirm|đặt chỗ mới|đơn hàng mới|đặt vé/.test(s)) return 'BOOKING';
  return 'OTHER';
}

export function detectChannel(sender: string, subject: string, text: string) {
  return OTA_CHANNELS.find((c) => c.from.test(sender)) ?? OTA_CHANNELS.find((c) => c.mark && (c.mark.test(subject) || c.mark.test(text.slice(0, 4000)))) ?? null;
}

export function parseOtaMail(mail: { sender: string; subject: string; text: string; receivedAt?: Date; pdf?: string }): ParsedMail {
  const subject = mail.subject.replace(/^((fwd?|tr|chuyển tiếp|re):\s*)+/i, '').trim();
  // Trả lời / chuyển tiếp trong cùng chuỗi email: không phải thông báo gốc
  if (/^re:/i.test(mail.subject.trim())) return { channel: null, kind: 'OTHER', ref: null, booking: null };
  // Bókun (phần mềm quản lý kênh): kênh gốc (Viator, GetYourGuide…) đã gửi email riêng – bỏ qua để không trùng
  if (/bokun\.io/i.test(mail.sender)) return { channel: null, kind: 'OTHER', ref: null, booking: null };
  if (/globaltix\.com/i.test(mail.sender)) return parseGlobaltix(subject, mail.text);
  const ch = detectChannel(mail.sender, subject, mail.text);
  if (!ch) return { channel: null, kind: 'OTHER', ref: null, booking: null };
  if (ch.code === 'GYG') return parseGyg(subject, mail.text);
  if (ch.code === 'VIATOR' && /viator\.com/i.test(mail.sender)) return parseViator(subject, mail.text);
  if (ch.code === 'VEXERE') return parseVexere(subject, mail.text);
  if (ch.code === '12GO') return parse12go(subject, mail.text, mail.pdf ?? '');
  return { channel: ch, kind: kindOf(subject), ref: null, booking: null };
}

const fold = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();

/**
 * Booking vận chuyển / xe ghép: xe bus, shuttle, đưa đón, xe riêng, thuê xe (kể cả gói xe ghép Bà Nà kèm vé cáp treo).
 * Tour, vé tham quan, show, rafting… (kể cả "tour có đưa đón") không nhập.
 */
export function isOtaTransport(product: string) {
  const n = fold(product);
  const transport = /\bbus\b|shuttle|transfer|xe ghep|xe rieng|dua don|private car|car rental|thue xe|limousine|sleeper|\bcar\b.*\b(to|from)\b|airport (pick ?up|drop)/.test(n);
  const notTransport = /\btours?\b|day trip|rafting|zipline|cooking|class\b|show\b|cruise|kayak|trekking|massage|\bspa\b|entry ticket|admission|theme park|sightseeing|guided/.test(n);
  return transport && !notTransport;
}
