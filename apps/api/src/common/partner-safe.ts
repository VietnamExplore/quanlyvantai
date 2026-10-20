/**
 * Thông tin khách hàng không được gửi cho nhà xe đối tác (và lái xe): tên kênh bán / đại lý (GetYourGuide, Vé xe rẻ, 12Go,
 * TOTO…), mã đặt chỗ của khách, tên khách hàng. Ghi chú / lịch trình chuyến gửi đi được bỏ các đoạn (ngăn bởi "·", ";",
 * xuống dòng) có những thông tin này – phần còn lại (điểm đón, số khách, yêu cầu của khách…) giữ nguyên.
 * Bản giống hệt ở apps/web/src/partner-safe.ts.
 */
const CHANNELS =
  /get ?your ?guide|\bgyg[a-z0-9]*\b|viator|tripadvisor|b[oó]kun|v[ée] ?xe ?r[ẻe]|vexere|\b12 ?go\b|12go\d*|\btoto\b|winwin ?travel|klook|kkday|trip\.com|\bctrip\b|traveloka|agoda|globaltix|booking\.com|expedia|redbus|easybook|\bota\b|\bBR-\d+/i;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function partnerSafe(text: string | null | undefined, hide: (string | null | undefined)[] = []): string | null {
  if (!text) return text ?? null;
  // Mã đặt chỗ, tên khách hàng (≥ 3 ký tự) của booking
  const words = hide.map((x) => (x ?? '').trim()).filter((x) => x.length >= 3);
  const own = words.length ? new RegExp(words.map(esc).join('|'), 'i') : null;
  const keep = (seg: string) => !CHANNELS.test(seg) && !(own && own.test(seg));
  const out = text
    .split('\n')
    .map((line) =>
      line
        .split(/\s+·\s+|\s*;\s*/)
        .filter((seg) => seg.trim() && keep(seg))
        .join(' · '),
    )
    .filter((line) => line.trim())
    .join('\n')
    .trim();
  return out || null;
}
