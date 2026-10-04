import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/vi';
import 'dayjs/locale/zh-cn';
import type { Settings } from './types';

/** Ngôn ngữ giấy tờ gửi khách (báo giá, danh sách hành khách, bảng đón) */
export type DocLang = 'vi' | 'en' | 'ko' | 'zh' | 'ja';

export const DOC_LANGS: { value: DocLang; label: string; short: string }[] = [
  { value: 'vi', label: 'Tiếng Việt', short: 'VI' },
  { value: 'en', label: 'Tiếng Anh (English)', short: 'EN' },
  { value: 'ko', label: 'Tiếng Hàn (한국어)', short: 'KO' },
  { value: 'zh', label: 'Tiếng Trung (中文)', short: 'ZH' },
  { value: 'ja', label: 'Tiếng Nhật (日本語)', short: 'JA' },
];

export const toDocLang = (v?: string | null): DocLang => (DOC_LANGS.some((l) => l.value === v) ? (v as DocLang) : 'vi');

const DAYJS_LOCALE: Record<DocLang, string> = { vi: 'vi', en: 'en', ko: 'ko', zh: 'zh-cn', ja: 'ja' };

/** Chữ trên giấy tờ theo từng ngôn ngữ */
const DICT = {
  quoteTitle: {
    vi: 'BÁO GIÁ DỊCH VỤ VẬN CHUYỂN',
    en: 'TRANSPORTATION SERVICE QUOTATION',
    ko: '차량 운송 서비스 견적서',
    zh: '交通服务报价单',
    ja: '送迎・車両サービス見積書',
  },
  quoteTextTitle: { vi: 'BÁO GIÁ DỊCH VỤ XE', en: 'TRANSPORT QUOTATION', ko: '차량 서비스 견적', zh: '用车报价', ja: '車両サービス見積' },
  quoteIntro: {
    vi: 'Kính gửi Quý khách báo giá dịch vụ xe như sau',
    en: 'We are pleased to provide our quotation for your transportation as follows',
    ko: '요청하신 차량 서비스 견적을 아래와 같이 안내드립니다',
    zh: '谨将贵方所需用车服务报价如下',
    ja: 'ご依頼の車両サービスについて、下記の通りお見積りいたします',
  },
  no: { vi: 'Số', en: 'No.', ko: '번호', zh: '编号', ja: '番号' },
  yourRef: { vi: 'Mã của Quý khách', en: 'Your ref.', ko: '고객 예약번호', zh: '贵方订单号', ja: 'お客様予約番号' },
  date: { vi: 'Ngày', en: 'Date', ko: '날짜', zh: '日期', ja: '日付' },
  printDate: { vi: 'Ngày in', en: 'Printed', ko: '출력일', zh: '打印日期', ja: '印刷日' },
  staff: { vi: 'NV báo giá', en: 'Contact', ko: '담당자', zh: '联系人', ja: '担当者' },
  tel: { vi: 'ĐT', en: 'Tel', ko: '전화', zh: '电话', ja: '電話' },
  to: { vi: 'Kính gửi', en: 'To', ko: '수신', zh: '致', ja: '宛先' },
  contact: { vi: 'Người liên hệ', en: 'Contact person', ko: '담당자', zh: '联系人', ja: 'ご担当者' },
  phone: { vi: 'Điện thoại', en: 'Phone', ko: '전화번호', zh: '电话', ja: '電話番号' },
  address: { vi: 'Địa chỉ', en: 'Address', ko: '주소', zh: '地址', ja: '住所' },
  taxCode: { vi: 'MST', en: 'Tax code', ko: '사업자번호', zh: '税号', ja: '税番号' },
  hotline: { vi: 'Hotline', en: 'Hotline', ko: '핫라인', zh: '热线', ja: 'ホットライン' },
  email: { vi: 'Email', en: 'Email', ko: '이메일', zh: '邮箱', ja: 'メール' },
  colNo: { vi: 'STT', en: 'No.', ko: '번호', zh: '序号', ja: 'No.' },
  colService: { vi: 'Dịch vụ / Hành trình', en: 'Service / Route', ko: '서비스 / 경로', zh: '服务 / 行程', ja: 'サービス / 行程' },
  colTime: { vi: 'Thời gian', en: 'Pick-up time', ko: '픽업 시간', zh: '接送时间', ja: 'お迎え時間' },
  colVehicle: { vi: 'Loại xe', en: 'Vehicle', ko: '차량', zh: '车型', ja: '車種' },
  colAmount: { vi: 'Thành tiền', en: 'Amount', ko: '금액', zh: '金额', ja: '金額' },
  flight: { vi: 'Chuyến bay', en: 'Flight', ko: '항공편', zh: '航班', ja: 'フライト' },
  itinerary: { vi: 'Lịch trình', en: 'Itinerary', ko: '일정', zh: '行程安排', ja: '旅程' },
  basePrice: { vi: 'Giá xe', en: 'Vehicle rate', ko: '차량 요금', zh: '车费', ja: '車両料金' },
  price: { vi: 'Giá', en: 'Price', ko: '요금', zh: '价格', ja: '料金' },
  lineTotal: { vi: 'Thành tiền', en: 'Total', ko: '합계', zh: '小计', ja: '小計' },
  subtotal: { vi: 'Tạm tính', en: 'Subtotal', ko: '소계', zh: '小计', ja: '小計' },
  discount: { vi: 'Giảm giá', en: 'Discount', ko: '할인', zh: '折扣', ja: '割引' },
  vat: { vi: 'VAT', en: 'VAT', ko: '부가세', zh: '增值税', ja: '付加価値税' },
  grandTotal: { vi: 'TỔNG CỘNG', en: 'GRAND TOTAL', ko: '총액', zh: '总计', ja: '合計' },
  deposit: { vi: 'Đặt cọc', en: 'Deposit', ko: '예약금', zh: '定金', ja: '前金' },
  balance: { vi: 'Còn lại', en: 'Balance', ko: '잔액', zh: '余款', ja: '残金' },
  notes: { vi: 'Ghi chú', en: 'Notes', ko: '참고 사항', zh: '备注', ja: '備考' },
  validUntil: {
    vi: 'Báo giá có hiệu lực đến ngày',
    en: 'This quotation is valid until',
    ko: '견적 유효기간',
    zh: '报价有效期至',
    ja: '見積有効期限',
  },
  bank: { vi: 'Thông tin chuyển khoản', en: 'Bank transfer details', ko: '계좌 이체 정보', zh: '银行转账信息', ja: 'お振込先' },
  customerConfirm: { vi: 'Xác nhận của khách hàng', en: 'Customer confirmation', ko: '고객 확인', zh: '客户确认', ja: 'お客様確認' },
  companyRep: { vi: 'Đại diện công ty', en: 'On behalf of the company', ko: '회사 대표', zh: '公司代表', ja: '会社代表' },
  signHint: { vi: '(Ký, ghi rõ họ tên)', en: '(Signature & full name)', ko: '(서명 및 성명)', zh: '（签名及姓名）', ja: '（署名・氏名）' },
  signStampHint: {
    vi: '(Ký, ghi rõ họ tên, đóng dấu)',
    en: '(Signature, full name & stamp)',
    ko: '(서명, 성명 및 직인)',
    zh: '（签名、姓名及盖章）',
    ja: '（署名・氏名・捺印）',
  },
  pax: { vi: 'khách', en: 'pax', ko: '명', zh: '人', ja: '名' },
  days: { vi: 'ngày', en: 'day(s)', ko: '일', zh: '天', ja: '日間' },
  quoteStaff: { vi: 'Nhân viên báo giá', en: 'Your contact', ko: '담당자', zh: '联系人', ja: '担当者' },
  bankText: { vi: 'Chuyển khoản', en: 'Bank transfer', ko: '계좌 이체', zh: '银行转账', ja: 'お振込先' },
  // Danh sách hành khách
  paxTitle: { vi: 'DANH SÁCH HÀNH KHÁCH', en: 'PASSENGER LIST', ko: '탑승객 명단', zh: '乘客名单', ja: '乗客名簿' },
  paxCustomer: { vi: 'Đơn vị / khách hàng', en: 'Customer', ko: '고객', zh: '客户', ja: 'お客様' },
  paxContact: { vi: 'Liên hệ', en: 'Contact', ko: '연락처', zh: '联系人', ja: '連絡先' },
  tripInfo: { vi: 'Thông tin chuyến xe', en: 'Trip details', ko: '차량 운행 정보', zh: '用车信息', ja: '運行情報' },
  colRoute: { vi: 'Hành trình', en: 'Route', ko: '경로', zh: '行程', ja: '行程' },
  colVehicleDriver: { vi: 'Xe / Lái xe', en: 'Vehicle / Driver', ko: '차량 / 기사', zh: '车辆 / 司机', ja: '車両 / 運転手' },
  notDispatched: { vi: 'chưa điều xe', en: 'to be assigned', ko: '배차 예정', zh: '待派车', ja: '手配中' },
  paxListTitle: { vi: 'Danh sách hành khách', en: 'Passengers', ko: '탑승객', zh: '乘客', ja: '乗客' },
  persons: { vi: 'người', en: 'persons', ko: '명', zh: '人', ja: '名' },
  fullName: { vi: 'Họ và tên', en: 'Full name', ko: '성명', zh: '姓名', ja: '氏名' },
  gender: { vi: 'Giới tính', en: 'Gender', ko: '성별', zh: '性别', ja: '性別' },
  male: { vi: 'Nam', en: 'Male', ko: '남', zh: '男', ja: '男性' },
  female: { vi: 'Nữ', en: 'Female', ko: '여', zh: '女', ja: '女性' },
  birthYear: { vi: 'Năm sinh', en: 'Year of birth', ko: '출생연도', zh: '出生年份', ja: '生年' },
  idNumber: { vi: 'CCCD / Hộ chiếu', en: 'ID / Passport', ko: '신분증 / 여권', zh: '身份证 / 护照', ja: '身分証 / 旅券' },
  nationality: { vi: 'Quốc tịch', en: 'Nationality', ko: '국적', zh: '国籍', ja: '国籍' },
  paxPhone: { vi: 'SĐT', en: 'Phone', ko: '전화', zh: '电话', ja: '電話' },
  driver: { vi: 'Lái xe', en: 'Driver', ko: '기사', zh: '司机', ja: '運転手' },
  carrierRep: { vi: 'Đại diện đơn vị vận tải', en: 'Transport operator', ko: '운송사 대표', zh: '运输公司代表', ja: '運送会社代表' },
} satisfies Record<string, Record<DocLang, string>>;

export type DocKey = keyof typeof DICT;

/** Hàm dịch theo ngôn ngữ giấy tờ */
export function docT(lang: DocLang) {
  return (key: DocKey) => DICT[key][lang] ?? DICT[key].vi;
}

/** Giờ đón theo kiểu từng nước, ví dụ "21:10 Fri 09/10/2026" */
export const docTime = (iso: string, lang: DocLang) =>
  dayjs(iso)
    .locale(DAYJS_LOCALE[lang])
    .format(lang === 'vi' ? 'HH:mm dd DD/MM/YYYY' : lang === 'en' ? 'HH:mm ddd DD/MM/YYYY' : 'HH:mm (dd) YYYY/MM/DD');

export const docDate = (d: string | Date | dayjs.Dayjs, lang: DocLang) =>
  dayjs(d).format(lang === 'vi' || lang === 'en' ? 'DD/MM/YYYY' : 'YYYY/MM/DD');

/** Tiền: "324.000 đ" (Việt) hoặc "324,000 VND" (ngoại ngữ) */
export const docMoney = (v: number | string, lang: DocLang, unit = true) => {
  const n = Math.round(Number(v) || 0);
  if (lang === 'vi') return `${n.toLocaleString('vi-VN')}${unit ? ' đ' : ''}`;
  return `${n.toLocaleString('en-US')}${unit ? ' VND' : ''}`;
};

type Named = { name: string; names?: unknown };
const pick = (x: Named | null | undefined, lang: DocLang) =>
  lang === 'vi' ? undefined : ((x?.names ?? {}) as Partial<Record<DocLang, string>>)[lang]?.trim() || undefined;

/** Tên dịch vụ theo ngôn ngữ (chưa nhập tên ngoại ngữ thì dùng tên tiếng Việt) */
export const docServiceName = (s: Named | null | undefined, fallback: string, lang: DocLang) => pick(s, lang) ?? s?.name ?? fallback;

/** Tên loại xe theo ngôn ngữ; chưa nhập thì ghi theo số chỗ, ví dụ "16-seat vehicle" */
export function docVehicleName(vt: Named & { seats?: number }, lang: DocLang) {
  const own = pick(vt, lang);
  if (own || lang === 'vi' || !vt.seats) return own ?? vt.name;
  const n = vt.seats;
  return { en: `${n}-seat vehicle`, ko: `${n}인승 차량`, zh: `${n}座车`, ja: `${n}人乗り車両` }[lang];
}

/** Ghi chú cuối báo giá theo ngôn ngữ (chưa nhập thì dùng bản tiếng Việt) */
export const docFooter = (s: Settings, lang: DocLang) =>
  (lang === 'vi' ? s.quoteFooter : s[`quoteFooter_${lang}` as keyof Settings]?.trim() || s.quoteFooter) ?? '';

/** Thông tin công ty theo ngôn ngữ giấy tờ (bản dịch ở Thông tin công ty; bỏ trống thì dùng tiếng Việt) */
export const docCompany = (s: Settings, lang: DocLang, field: 'companyName' | 'companyAddress' | 'bankInfo') =>
  (lang === 'vi' ? undefined : s[`${field}_${lang}`]?.trim()) || s[field] || '';
