/**
 * Quốc tịch theo mã nước của số điện thoại (tên tiếng Việt, cùng cách ghi trong danh sách hành khách).
 * [mã gọi quốc tế, mã quốc gia ISO, tên]; mã dài khớp trước mã ngắn (vd 852 Hồng Kông trước 85…).
 */
const CODES: [string, string, string][] = [
  ['84', 'VN', 'Việt Nam'],
  ['82', 'KR', 'Hàn Quốc'],
  ['81', 'JP', 'Nhật Bản'],
  ['86', 'CN', 'Trung Quốc'],
  ['852', 'HK', 'Hồng Kông'],
  ['853', 'MO', 'Ma Cao'],
  ['886', 'TW', 'Đài Loan'],
  ['850', 'KP', 'Triều Tiên'],
  ['856', 'LA', 'Lào'],
  ['855', 'KH', 'Campuchia'],
  ['66', 'TH', 'Thái Lan'],
  ['65', 'SG', 'Singapore'],
  ['60', 'MY', 'Malaysia'],
  ['62', 'ID', 'Indonesia'],
  ['63', 'PH', 'Philippines'],
  ['95', 'MM', 'Myanmar'],
  ['673', 'BN', 'Brunei'],
  ['670', 'TL', 'Đông Timor'],
  ['91', 'IN', 'Ấn Độ'],
  ['92', 'PK', 'Pakistan'],
  ['880', 'BD', 'Bangladesh'],
  ['94', 'LK', 'Sri Lanka'],
  ['977', 'NP', 'Nepal'],
  ['976', 'MN', 'Mông Cổ'],
  ['7', 'RU', 'Nga'],
  ['380', 'UA', 'Ukraina'],
  ['375', 'BY', 'Belarus'],
  ['44', 'GB', 'Anh'],
  ['353', 'IE', 'Ireland'],
  ['33', 'FR', 'Pháp'],
  ['49', 'DE', 'Đức'],
  ['39', 'IT', 'Ý'],
  ['34', 'ES', 'Tây Ban Nha'],
  ['351', 'PT', 'Bồ Đào Nha'],
  ['31', 'NL', 'Hà Lan'],
  ['32', 'BE', 'Bỉ'],
  ['352', 'LU', 'Luxembourg'],
  ['41', 'CH', 'Thụy Sĩ'],
  ['43', 'AT', 'Áo'],
  ['45', 'DK', 'Đan Mạch'],
  ['46', 'SE', 'Thụy Điển'],
  ['47', 'NO', 'Na Uy'],
  ['358', 'FI', 'Phần Lan'],
  ['354', 'IS', 'Iceland'],
  ['48', 'PL', 'Ba Lan'],
  ['420', 'CZ', 'Séc'],
  ['421', 'SK', 'Slovakia'],
  ['36', 'HU', 'Hungary'],
  ['40', 'RO', 'Romania'],
  ['359', 'BG', 'Bulgaria'],
  ['30', 'GR', 'Hy Lạp'],
  ['385', 'HR', 'Croatia'],
  ['386', 'SI', 'Slovenia'],
  ['381', 'RS', 'Serbia'],
  ['370', 'LT', 'Litva'],
  ['371', 'LV', 'Latvia'],
  ['372', 'EE', 'Estonia'],
  ['356', 'MT', 'Malta'],
  ['357', 'CY', 'Síp'],
  ['90', 'TR', 'Thổ Nhĩ Kỳ'],
  ['972', 'IL', 'Israel'],
  ['971', 'AE', 'UAE'],
  ['966', 'SA', 'Ả Rập Xê Út'],
  ['974', 'QA', 'Qatar'],
  ['965', 'KW', 'Kuwait'],
  ['98', 'IR', 'Iran'],
  ['20', 'EG', 'Ai Cập'],
  ['27', 'ZA', 'Nam Phi'],
  ['212', 'MA', 'Maroc'],
  ['234', 'NG', 'Nigeria'],
  ['254', 'KE', 'Kenya'],
  ['61', 'AU', 'Úc'],
  ['64', 'NZ', 'New Zealand'],
  ['52', 'MX', 'Mexico'],
  ['55', 'BR', 'Brazil'],
  ['54', 'AR', 'Argentina'],
  ['56', 'CL', 'Chile'],
  ['57', 'CO', 'Colombia'],
  ['51', 'PE', 'Peru'],
  ['58', 'VE', 'Venezuela'],
  ['1', 'US', 'Mỹ'],
];
/** Mã gọi +1 dùng chung: phân biệt bằng quốc gia khách chọn khi đặt */
const NANP: Record<string, string> = { US: 'Mỹ', CA: 'Canada', PR: 'Puerto Rico', JM: 'Jamaica', DO: 'Cộng hòa Dominica' };
const BY_ISO = Object.fromEntries([...CODES.map(([, iso, name]) => [iso, name]), ...Object.entries(NANP)]);
const SORTED = [...CODES].sort((a, b) => b[0].length - a[0].length);

/** Tên quốc gia (tiếng Việt) theo mã ISO 2 chữ */
export const countryName = (iso?: string | null) => (iso ? (BY_ISO[iso.toUpperCase()] ?? null) : null);

/**
 * Quốc tịch theo số điện thoại: "+82 10-1234-5678" → Hàn Quốc; số Việt Nam không có mã nước (0912…) → Việt Nam;
 * số không có dấu + nhưng bắt đầu bằng mã nước (8210…) cũng nhận. Không xác định được thì theo quốc gia khách chọn (nếu có).
 */
export function nationalityFromPhone(phone?: string | null, fallbackIso?: string | null) {
  const raw = (phone ?? '').trim();
  let digits = raw.replace(/\D/g, '');
  const intl = raw.startsWith('+') || raw.startsWith('00');
  if (raw.startsWith('00')) digits = digits.slice(2);
  if (!digits) return countryName(fallbackIso);
  // Số trong nước Việt Nam: 0 + 9–10 số (di động 03/05/07/08/09, cố định 02x)
  if (!intl && /^0[2-9]\d{8,9}$/.test(digits)) return 'Việt Nam';
  if (intl || digits.length >= 11) {
    const hit = SORTED.find(([code]) => digits.startsWith(code));
    if (hit) return hit[0] === '1' ? (NANP[(fallbackIso ?? '').toUpperCase()] ?? 'Mỹ') : hit[2];
  }
  return countryName(fallbackIso);
}
