/**
 * Đọc email thông báo booking của các kênh OTA (GetYourGuide, Klook, KKday…).
 * Mỗi kênh nhận diện theo địa chỉ gửi / nội dung (cả email được chuyển tiếp); kênh đã có mẫu thì đọc ra booking,
 * kênh chưa có mẫu chỉ nhận diện email đặt / đổi / hủy để báo điều hành nhập tay.
 */

export type MailKind = 'BOOKING' | 'CHANGE' | 'CANCEL' | 'OTHER';

export interface OtaChannel {
  code: string;
  name: string;
  /** Địa chỉ gửi / tên miền */
  from: RegExp;
  /** Dấu hiệu trong tiêu đề / nội dung (email được chuyển tiếp) */
  mark?: RegExp;
}

/** Các kênh OTA công ty bán (mã nguồn khách = mã kênh) */
export const OTA_CHANNELS: OtaChannel[] = [
  { code: 'GYG', name: 'GetYourGuide', from: /getyourguide\.com/i, mark: /getyourguide|\bS\d{5,7} - GYG[A-Z0-9]{6,}/i },
  { code: 'KLOOK', name: 'Klook', from: /klook\.com/i, mark: /\bklook\b/i },
  { code: 'KKDAY', name: 'KKday', from: /kkday\.com/i, mark: /\bkkday\b/i },
  { code: 'VIATOR', name: 'Viator', from: /viator\.com|tripadvisor\.com/i, mark: /\bviator\b/i },
  { code: 'TRIPCOM', name: 'Trip.com', from: /trip\.com|ctrip\.com/i, mark: /\btrip\.com\b|\bctrip\b/i },
  { code: 'TRAVELOKA', name: 'Traveloka', from: /traveloka\.com/i, mark: /\btraveloka\b/i },
  { code: 'AGODA', name: 'Agoda', from: /agoda\.com/i, mark: /\bagoda\b/i },
  { code: 'BOOKINGCOM', name: 'Booking.com', from: /booking\.com/i, mark: /\bbooking\.com\b/i },
  { code: 'EXPEDIA', name: 'Expedia', from: /expedia\.com|expediapartnercentral/i, mark: /\bexpedia\b/i },
  { code: 'VEXERE', name: 'Vé xe rẻ', from: /vexere\.com/i, mark: /\bvexere\b|v[ée] xe r[ẻe]/i },
  { code: 'REDBUS', name: 'redBus', from: /redbus\./i, mark: /\bredbus\b/i },
  { code: 'EASYBOOK', name: 'Easybook', from: /easybook\.com/i, mark: /\beasybook\b/i },
  { code: '12GO', name: '12Go', from: /12go\.(asia|co|com)/i, mark: /\b12go\b/i },
];

/** Một booking đọc được từ email */
export interface OtaMailBooking {
  ref: string;
  product: string;
  /** Giờ đón (giờ Việt Nam, ISO) */
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
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&#8217;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[ \t\r]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .trim();
}

/** Gộp thành một dòng, bỏ link / ký tự bảng để dò theo nhãn */
function flat(text: string) {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\(https?:\/\/[^)\s]*\)/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[|#>*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "October 19, 2026, 12:00 PM" / "June 4, 2026 at 1:00 PM" / "September 9, 2026 9:00 AM" → ISO giờ Việt Nam */
export function enDateTime(s: string) {
  const m = s.match(/([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})(?:,| at)? *(\d{1,2}):(\d{2}) *(AM|PM)?/i);
  if (!m) return null;
  const mon = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3)));
  if (mon < 0) return null;
  let h = Number(m[4]);
  const ap = m[6]?.toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (h > 23) return null;
  return `${m[3]}-${String(mon + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}T${String(h).padStart(2, '0')}:${m[5]}:00+07:00`;
}

/** Tên sản phẩm GetYourGuide lặp 2 lần liền nhau ("X X") → "X" */
function undouble(s: string) {
  const t = s.trim();
  const half = t.slice(0, Math.floor(t.length / 2)).trim();
  return half && t === `${half} ${half}` ? half : t;
}

/** "₫ 600,000" / "VND 1.200.000" / "US$ 25.00" → số + đơn vị tiền */
export function money(s: string): { price: number | null; currency: string | null } {
  const m = s.match(/(₫|VND|đ|US\$|\$|€|EUR|USD|KRW|₩|SGD|JPY|¥)\s*([\d.,]+)|([\d.,]+)\s*(₫|VND|đ|USD|EUR)/i);
  if (!m) return { price: null, currency: null };
  const cur = (m[1] ?? m[4]).toUpperCase();
  const raw = m[2] ?? m[3];
  const currency = /₫|VND|Đ/.test(cur) ? 'VND' : /US\$|USD|^\$$/.test(cur) ? 'USD' : /€|EUR/.test(cur) ? 'EUR' : /₩|KRW/.test(cur) ? 'KRW' : cur;
  let price: number;
  if (currency === 'VND' || currency === 'KRW') price = Number(raw.replace(/[.,\s]/g, ''));
  else price = Number(raw.replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
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

/** GetYourGuide: "Booking - S437368 - GYG…", "Urgent: New booking received - …", "Booking detail change: - …", "A booking has been canceled - …" */
function parseGyg(subject: string, text: string): ParsedMail {
  const channel = OTA_CHANNELS[0];
  const t = flat(text);
  const ref = (subject.match(/\bGYG[A-Z0-9]{8,}\b/) ?? t.match(/\bGYG[A-Z0-9]{8,}\b/))?.[0] ?? null;
  const s = subject.toLowerCase();
  if (/cancel/.test(s) || /was cancell?ed/i.test(t)) {
    return {
      channel,
      kind: 'CANCEL',
      ref,
      booking: {
        product: undouble(between(t, /Tour: /, / Name: | Date: /) ?? ''),
        customerName: between(t, /Name: /, / Date: /),
        pickupTime: enDateTime(between(t, /Date: /, / Please | Best regards/) ?? ''),
      },
    };
  }
  if (/detail change|has changed/i.test(s + t)) {
    const pickup = between(t, /Pickup location /, / \(coordinates| Open in Google Maps| Number of participants/);
    const pax = Number(between(t, /Number of participants /, / Language| Contact/)?.match(/\d+/)?.[0] ?? 0);
    return {
      channel,
      kind: 'CHANGE',
      ref,
      booking: {
        product: undouble(between(t, /following booking has changed\. /, / Booking reference/) ?? ''),
        pickupTime: enDateTime(between(t, /Date /, / Pickup location| Number of participants/) ?? ''),
        pickup,
        adults: pax || undefined,
        language: between(t, / Language /, / Contact customer|$/),
      },
    };
  }
  if (/booking|booked/i.test(s)) {
    const product = undouble(between(t, /(?:has been booked|last-minute booking): /, / Reference number/) ?? '');
    const parts = between(t, /Number of participants /, / Main customer| Tour language| Pickup| Price/) ?? '';
    let adults = 0;
    let children = 0;
    for (const m of parts.matchAll(/(\d+) x ([^()\d]+)/g)) {
      if (/child|infant|youth|kid/i.test(m[2])) children += Number(m[1]);
      else adults += Number(m[1]);
    }
    if (!adults && !children) adults = Number(parts.match(/\d+/)?.[0] ?? 1);
    const main = between(t, /Main customer /, / Tour language| Pickup| Price| Open booking/) ?? '';
    const email = main.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null;
    const priceText = between(t, / Price /, / Open booking| We.re here|$/);
    return {
      channel,
      kind: 'BOOKING',
      ref,
      booking: {
        ref: ref ?? undefined,
        product,
        pickupTime: enDateTime(between(t, / Date /, / Number of participants/) ?? ''),
        adults,
        children,
        customerName: (email ? main.slice(0, main.indexOf(email)) : main.split(/ Phone:/)[0]).trim() || null,
        customerEmail: email,
        phone: main.match(/Phone: *(\+?[\d ()-]{6,})/)?.[1].replace(/[^\d+]/g, '') ?? null,
        language: main.match(/Language: *([A-Za-z ]+)/)?.[1].trim() ?? null,
        pickup: between(t, / Pickup /, / Open in Google Maps| Price/),
        dropoff: between(t, / Drop-?off /i, / Open in Google Maps| Price/),
        priceText,
        ...money(priceText ?? ''),
      },
    };
  }
  return { channel, kind: 'OTHER', ref, booking: null };
}

/** Kênh chưa có mẫu: chỉ nhận diện email đặt / đổi / hủy theo tiêu đề */
function kindOf(subject: string): MailKind {
  const s = subject.toLowerCase();
  if (/cancel|hủy|huỷ|refund/.test(s)) return 'CANCEL';
  if (/chang|amend|modif|update|thay đổi/.test(s)) return 'CHANGE';
  if (/booking|order|reservation|confirm|đặt chỗ|đơn hàng|đặt vé|new|mới/.test(s) && !/review|newsletter|promo|invoice|payout|payment|statement|report|webinar|survey/.test(s)) return 'BOOKING';
  return 'OTHER';
}

export function detectChannel(sender: string, subject: string, text: string) {
  return OTA_CHANNELS.find((c) => c.from.test(sender)) ?? OTA_CHANNELS.find((c) => c.mark && (c.mark.test(subject) || c.mark.test(text.slice(0, 4000)))) ?? null;
}

export function parseOtaMail(mail: { sender: string; subject: string; text: string }): ParsedMail {
  const channel = detectChannel(mail.sender, mail.subject, mail.text);
  if (!channel) return { channel: null, kind: 'OTHER', ref: null, booking: null };
  if (channel.code === 'GYG') return parseGyg(mail.subject.replace(/^(fwd?|tr|chuyển tiếp):\s*/i, ''), mail.text);
  return { channel, kind: kindOf(mail.subject.replace(/^(fwd?|tr):\s*/i, '')), ref: null, booking: null };
}
