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
  const L = ['Tên khách:', 'Điện thoại:', 'Email:', 'Tuyến đường:', 'Ngày đi:', 'Giờ khởi hành:', 'Giờ đón dự kiến:', 'Sơ đồ ghế/giường:', 'Số lượng:', 'Số lượng ghế/giường đã hủy:', 'Số lượng ghế/giường còn lại:', 'Mã ghế/giường:', 'Giảm Giá NX:', 'Tổng tiền:', 'Đón tại:', 'Trả tại:', 'Khách', 'Em cám ơn', 'Ghi chú:'];
  const f = (l: string) => field(t, l, L);
  const route = f('Tuyến đường:') ?? '';
  const busRoute = route.match(/\(thuộc tuyến ([^)]+)\)/i)?.[1] ?? route;
  const qty = Number(f('Số lượng:')?.match(/\d+/)?.[0] ?? 0);
  const cancelled = Number(f('Số lượng ghế/giường đã hủy:')?.match(/\d+/)?.[0] ?? 0);
  const left = Number(f('Số lượng ghế/giường còn lại:')?.match(/\d+/)?.[0] ?? 0);
  const priceText = f('Tổng tiền:');
  const pickupAt = f('Giờ đón dự kiến:');
  const paid = between(t, / (Khách (?:đã|chưa) thanh toán[^.]*)/, / Em cám ơn/) ?? t.match(/Khách (?:đã|chưa) thanh toán[^.]*/)?.[0] ?? null;
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
      pickup: f('Đón tại:'),
      dropoff: f('Trả tại:'),
      priceText,
      ...money(priceText ?? ''),
      transport: true,
      busRoute,
      extra: [
        pickupAt ? `Giờ đón dự kiến: ${pickupAt}` : null,
        f('Sơ đồ ghế/giường:') ? `Loại xe Vexere: ${f('Sơ đồ ghế/giường:')}` : null,
        f('Mã ghế/giường:') ? `Ghế: ${f('Mã ghế/giường:')}` : null,
        f('Giảm Giá NX:') ? `Giảm giá nhà xe: ${f('Giảm Giá NX:')}` : null,
        paid,
        kind === 'CANCEL' ? `Hủy ${cancelled} vé, còn ${left} vé` : null,
      ].filter((x): x is string => !!x),
    },
  };
}

/** 12Go (noreply@12go.asia): "PLEASE CONFIRM!! NEW BOOKING - #12GO… 26 Oct 11:00 <đón>-<trả>" / "Cancellation happened for booking 12GO…" */
function parse12go(subject: string, text: string, receivedAt: Date): ParsedMail {
  const ch = channel('12GO');
  const t = flat(text);
  const ref = (subject.match(/#?(12GO\d{6,})/i) ?? t.match(/(12GO\d{6,})/i))?.[1].toUpperCase() ?? null;
  const kind: MailKind = /cancel/i.test(subject) ? 'CANCEL' : /new booking/i.test(subject) ? 'BOOKING' : /chang|amend|modif/i.test(subject) ? 'CHANGE' : 'OTHER';
  if (!ref || kind === 'OTHER') return { channel: ch, kind: 'OTHER', ref, booking: null };
  const name = between(t, / Customer name: /, / PLEASE| Thank you| Click|$/);
  if (kind === 'CANCEL') {
    return {
      channel: ch,
      kind,
      ref,
      booking: { product: between(t, / Direction: /, / Date \(time\)/) ?? undefined, pickupTime: dmyDateTime(between(t, / Date \(time\): /, / Number of seats/) ?? ''), adults: Number(between(t, / Number of seats: /, / Customer/)) || undefined, customerName: name, transport: true },
    };
  }
  // "26 Oct 11:00 Vincom Plaza Hue-35 Dao Duy Tu" (năm: năm nhận email, tháng đã qua thì năm sau)
  const m = subject.match(/(\d{1,2}) ([A-Za-z]{3}) (\d{1,2}):(\d{2})\s+(.+)$/);
  let pickupTime: string | null = null;
  let pickup: string | null = null;
  let dropoff: string | null = null;
  if (m) {
    const mon = monthOf(m[2]);
    const y = receivedAt.getFullYear() + (mon < receivedAt.getMonth() - 1 ? 1 : 0);
    pickupTime = iso(y, mon, Number(m[1]), Number(m[3]), m[4]);
    const parts = m[5].split(/\s*-\s*/);
    pickup = parts[0] || null;
    dropoff = parts.slice(1).join(' - ') || null;
  }
  return {
    channel: ch,
    kind,
    ref,
    booking: {
      ref,
      product: `12Go: ${pickup ?? '?'} → ${dropoff ?? '?'}`,
      pickupTime,
      adults: 1,
      children: 0,
      customerName: name,
      pickup,
      dropoff,
      price: null,
      currency: null,
      priceText: null,
      transport: true,
      busRoute: pickup && dropoff ? `${pickup} - ${dropoff}` : null,
      review: 'Email 12Go không ghi số khách, giá và tuyến – xem trên trang 12Go (op.12go.asia) rồi sửa booking',
      extra: [between(t, / Booking ID: [^,]+, /, / Customer name/) ?? ''].filter(Boolean),
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

export function parseOtaMail(mail: { sender: string; subject: string; text: string; receivedAt?: Date }): ParsedMail {
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
  if (ch.code === '12GO') return parse12go(subject, mail.text, mail.receivedAt ?? new Date());
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
