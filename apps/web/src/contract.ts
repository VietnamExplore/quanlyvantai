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
    /** Ngôn ngữ giấy tờ: khác "vi" thì mặc định in song ngữ */
    docLanguage?: string;
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
  /** Bên A của bản nháp lấy từ: danh sách hành khách (booking OTA) | hồ sơ khách hàng | người liên hệ */
  draftSource: 'OTA' | 'CUSTOMER' | 'CONTACT';
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

/** Bản tiếng Anh của điều khoản mẫu (hợp đồng song ngữ); sửa ở Cài đặt → Điều khoản hợp đồng (tiếng Anh) */
export const DEFAULT_CONTRACT_TERMS_EN = `ARTICLE 4. RIGHTS AND OBLIGATIONS OF PARTY A (THE HIRER)
1. Provide an accurate passenger list (full name, year of birth), pick-up and drop-off times and places; notify Party B of any change at least 12 hours in advance.
2. Pay the contract value in full and on time as specified in Article 3.
3. Ensure passengers comply with traffic safety rules and wear seat belts while the vehicle is moving; do not bring prohibited, flammable, explosive or toxic goods on board.
4. Compensate for any damage caused by Party A's passengers to Party B's vehicle or property (if any).

ARTICLE 5. RIGHTS AND OBLIGATIONS OF PARTY B (THE CARRIER)
1. Provide a vehicle of the agreed type that meets technical safety and environmental standards, displays the "CONTRACT VEHICLE" badge and carries compulsory insurance; drivers hold an appropriate driving licence.
2. Pick up and drop off passengers at the times and places stated in the contract; carry only the passengers named in the attached list; take no passengers outside the contract.
3. The driver carries the contract (paper copy or a device to access the electronic contract) and the passenger list throughout the journey.
4. Party B may refuse to carry passengers who violate regulations or endanger order and safety on board.
5. Fulfil all tax obligations to the State and issue invoices as required by law.

ARTICLE 6. COMPENSATION AND DISPUTE RESOLUTION
1. The party in breach of the contract shall compensate the injured party in accordance with the law. Party B compensates for injury to passengers and loss of luggage caused by Party B's fault in accordance with the law and the insurance policy.
2. In case of a breakdown on the road, Party B provides an equivalent replacement vehicle as soon as possible at no extra cost to Party A.
3. If Party A cancels a confirmed trip, Party A pays the actual costs incurred (if any) as agreed by both parties.
4. Disputes are settled by negotiation; failing that, they are referred to the competent court.

ARTICLE 7. GENERAL COMMITMENTS
1. Both parties undertake to comply fully with the terms of this contract.
2. Hotline for passengers' feedback, complaints and denunciations: {hotline}.
3. This contract takes effect from the date of signing until both parties have fulfilled their obligations. The electronic contract has the same legal validity as a paper contract; if printed, it is made in 02 copies, each party keeping 01 copy of equal validity.`;

// ───── Đọc số tiền bằng chữ (tiếng Anh) ─────

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function enTriple(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ''));
  return parts.join(' and ');
}

/** 1250000 → "One million two hundred and fifty thousand Vietnam dong" */
export function moneyInWordsEn(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return 'Zero Vietnam dong';
  const scales = ['', 'thousand', 'million', 'billion', 'trillion'];
  const out: string[] = [];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
    const g = n % 1000;
    if (g) out.unshift(`${enTriple(g)}${scales[i] ? ` ${scales[i]}` : ''}`);
  }
  const s = `${out.join(' ')} Vietnam dong`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
