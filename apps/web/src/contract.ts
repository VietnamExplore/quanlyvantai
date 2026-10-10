/** Hợp đồng vận chuyển hành khách (NĐ 158/2024 Điều 7, 17; TT 36/2024 Phụ lục IV, V) */

export interface TransportContract {
  id: number;
  bookingId: number;
  number: string;
  signedDate: string;
  hirerName: string;
  hirerIdNumber: string | null;
  hirerTaxCode: string | null;
  hirerAddress: string | null;
  hirerPhone: string | null;
  hirerEmail: string | null;
  hirerBank: string | null;
  hirerRepresentative: string | null;
  hirerPosition: string | null;
  hirerRepIdNumber: string | null;
  paymentMethod: string | null;
  extraTerms: string | null;
  token: string;
  acceptedAt: string | null;
  acceptedName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractTrip {
  id: number;
  seq: number;
  status: string;
  serviceType: string;
  pickupTime: string;
  endTime: string;
  pickupAddress: string;
  dropoffAddress: string | null;
  itinerary: string | null;
  passengers: number;
  days: number;
  distanceKm: number | null;
  routeName: string | null;
  service: { name: string };
  vehicleType: { name: string; seats: number };
  vehicle: { plateNumber: string } | null;
  driver: { fullName: string; phone: string } | null;
  partnerPlate: string | null;
  partnerDriverName: string | null;
  partnerDriverPhone: string | null;
}

export interface ContractData {
  booking: {
    id?: number;
    code: string;
    status: string;
    customerRef: string | null;
    contactName: string;
    contactPhone: string;
    leaderRole: string | null;
    leaderName: string | null;
    leaderPhone: string | null;
    customer: { name: string; phone?: string | null; taxCode?: string | null; address?: string | null } | null;
    invoiceRequired: boolean;
    vatPercent: number;
    depositAmount: number;
    taxable: number;
    vatAmount: number;
    total: number;
  };
  trips: ContractTrip[];
  /** Số lượt xe ghép trong booking (không thuộc hợp đồng thuê xe) */
  shuttleTrips: number;
  passengers: { seq: number; fullName: string; birthYear: number | null; note: string | null }[];
  contract: TransportContract | null;
  company: Record<string, string | undefined>;
}

export interface ContractForBooking extends ContractData {
  draft: Partial<TransportContract> & { signedDate: string };
}

/** Đường dẫn bản hợp đồng điện tử (QR, gửi khách, app lái xe) */
export const contractUrl = (token: string) => `${window.location.origin}/e/hd/${token}`;

/** Điều khoản mặc định (Điều 4 trở đi); sửa ở Cài đặt → Hợp đồng vận chuyển. {hotline} = số điện thoại tiếp nhận phản ánh */
export const DEFAULT_CONTRACT_TERMS = `ĐIỀU 4. QUYỀN VÀ NGHĨA VỤ CỦA BÊN A (BÊN THUÊ VẬN TẢI)
1. Cung cấp chính xác danh sách hành khách (họ tên, năm sinh), thời gian và địa điểm đón, trả khách; thông báo cho Bên B khi có thay đổi trước ít nhất 12 giờ.
2. Thanh toán đầy đủ, đúng hạn giá trị hợp đồng theo Điều 3.
3. Đảm bảo hành khách chấp hành quy định về an toàn giao thông, thắt dây an toàn khi xe chạy; không mang theo hàng cấm, hàng dễ cháy nổ, chất độc hại lên xe.
4. Bồi thường thiệt hại do hành khách thuộc Bên A gây ra cho phương tiện, tài sản của Bên B (nếu có).

ĐIỀU 5. QUYỀN VÀ NGHĨA VỤ CỦA BÊN B (BÊN VẬN CHUYỂN)
1. Bố trí xe đúng loại, đảm bảo điều kiện an toàn kỹ thuật và bảo vệ môi trường, có phù hiệu "XE HỢP ĐỒNG", có bảo hiểm bắt buộc theo quy định; lái xe có giấy phép lái xe phù hợp.
2. Đón, trả khách đúng thời gian, địa điểm ghi trong hợp đồng; chỉ vận chuyển hành khách có trong danh sách kèm theo hợp đồng; không đón thêm khách ngoài hợp đồng.
3. Lái xe mang theo hợp đồng (bản giấy hoặc thiết bị truy cập hợp đồng điện tử) và danh sách hành khách trong suốt hành trình.
4. Được từ chối vận chuyển hành khách vi phạm quy định, gây mất an ninh trật tự, an toàn trên xe.
5. Thực hiện đầy đủ nghĩa vụ thuế đối với Nhà nước; xuất hóa đơn theo quy định.

ĐIỀU 6. BỒI THƯỜNG THIỆT HẠI VÀ GIẢI QUYẾT TRANH CHẤP
1. Bên vi phạm hợp đồng gây thiệt hại phải bồi thường cho bên bị thiệt hại theo quy định của pháp luật. Bên B bồi thường thiệt hại về người và hành lý của hành khách do lỗi của Bên B theo quy định của pháp luật và hợp đồng bảo hiểm.
2. Xe hỏng trên đường: Bên B bố trí xe thay thế tương đương trong thời gian sớm nhất, không tính thêm chi phí cho Bên A.
3. Bên A hủy chuyến sau khi đã xác nhận thì thanh toán các chi phí thực tế đã phát sinh (nếu có) theo thỏa thuận của hai bên.
4. Tranh chấp được giải quyết bằng thương lượng; không thương lượng được thì đưa ra Tòa án có thẩm quyền giải quyết.

ĐIỀU 7. CAM KẾT CHUNG
1. Hai bên cam kết thực hiện đúng các điều khoản của hợp đồng.
2. Số điện thoại tiếp nhận phản ánh, khiếu nại, tố cáo của hành khách: {hotline}.
3. Hợp đồng có hiệu lực từ ngày ký đến khi hai bên hoàn thành nghĩa vụ. Hợp đồng điện tử có giá trị pháp lý như hợp đồng bằng văn bản giấy; trường hợp in ra giấy, hợp đồng được lập thành 02 bản, mỗi bên giữ 01 bản có giá trị như nhau.`;

// ───── Đọc số tiền bằng chữ ─────

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readTriple(n: number, full: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const out: string[] = [];
  if (full || h > 0) out.push(DIGITS[h], 'trăm');
  if (t > 1) {
    out.push(DIGITS[t], 'mươi');
    if (u === 1) out.push('mốt');
    else if (u === 4) out.push('tư');
    else if (u === 5) out.push('lăm');
    else if (u > 0) out.push(DIGITS[u]);
  } else if (t === 1) {
    out.push('mười');
    if (u === 5) out.push('lăm');
    else if (u > 0) out.push(DIGITS[u]);
  } else if (u > 0) {
    if (full || h > 0) out.push('lẻ');
    out.push(DIGITS[u]);
  }
  return out.join(' ');
}

/** 1250000 → "Một triệu hai trăm năm mươi nghìn đồng" */
export function moneyInWords(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return 'Không đồng';
  const units = ['', 'nghìn', 'triệu', 'tỷ'];
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) {
      // "tỷ" vẫn phải đọc khi cả nhóm tỷ bằng 0 nhưng còn nhóm cao hơn (nghìn tỷ)
      if (i % 3 === 0 && i > 0 && parts.length) parts.push('tỷ');
      continue;
    }
    parts.push(readTriple(g, i < groups.length - 1));
    const unit = i % 3 === 0 ? (i === 0 ? '' : 'tỷ') : units[i % 3];
    if (unit) parts.push(unit);
  }
  const s = parts.join(' ').replace(/\s+/g, ' ').trim() + ' đồng';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
