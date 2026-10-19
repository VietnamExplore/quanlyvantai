import { pdfText } from './toto-pdf';
import { readSignImage, readSignPhoto } from './toto-sign-ocr';

/** Booking có thể nhận bảng đón: mã đặt chỗ TOTO + tên khách */
export interface SignCandidate {
  reservationId: string;
  customerName: string;
}

export interface SignMatch {
  file: string;
  reservationId: string | null;
  /** Ghép theo: mã đặt chỗ / tên khách; null = không ghép được (văn phòng tự chọn) */
  by: 'ma' | 'ten' | null;
}

/** Chữ hoa không dấu, chỉ chữ và số: "NAM HOON (남훈)" → "NAMHOON" */
const key = (s: string) =>
  s
    .replace(/\([^)]*\)/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/**
 * Ghép file bảng đón (PDF / ảnh) với booking TOTO: theo mã đặt chỗ trong tên file hoặc nội dung PDF,
 * không có mã thì theo tên khách (tên dài nhất khớp – tránh "KIM" khớp nhầm "KIM MIN JUN"); không chắc thì để trống.
 */
export async function matchSign(file: { name: string; data: Uint8Array; pdf: boolean }, candidates: SignCandidate[]): Promise<SignMatch> {
  let text = '';
  if (file.pdf) {
    try {
      // Bản sao: thư viện PDF chiếm vùng dữ liệu được đưa vào (còn dùng để đọc ảnh nếu cần)
      text = await pdfText(file.data.slice());
    } catch {
      /* PDF chỉ có ảnh / không đọc được chữ: ghép theo tên file */
    }
  }
  // Bảng đón TOTO là ảnh (PDF tạo bằng jsPDF, không có chữ): đọc chữ trên ảnh – mã sau "BK :", tên khách chữ Latin
  if (!text.trim()) {
    const ocr = file.pdf ? await readSignImage(file.data) : await readSignPhoto(Buffer.from(file.data));
    text = [ocr.bk ? `BK : ${ocr.bk}` : '', ocr.name ?? '', ocr.text ?? ''].join('\n');
  }
  const hay = `${file.name}\n${text}`;
  // 1. Mã đặt chỗ (dãy số đứng riêng, không nằm trong số dài hơn)
  const byId = candidates.filter((c) => new RegExp(`(^|\\D)${c.reservationId}(\\D|$)`).test(hay));
  if (byId.length === 1) return { file: file.name, reservationId: byId[0].reservationId, by: 'ma' };
  // 2. Tên khách
  const hayKey = key(hay);
  const byName = candidates
    .map((c) => ({ c, k: key(c.customerName) }))
    .filter((x) => x.k.length >= 4 && hayKey.includes(x.k))
    .sort((a, b) => b.k.length - a.k.length);
  // Nhiều booking trùng tên khách: không đoán
  if (byName.length && (byName.length === 1 || byName[0].k.length > byName[1].k.length)) {
    const same = byName.filter((x) => x.k === byName[0].k);
    if (same.length === 1) return { file: file.name, reservationId: byName[0].c.reservationId, by: 'ten' };
  }
  return { file: file.name, reservationId: null, by: null };
}
