export type Role = 'ADMIN' | 'DIEU_HANH' | 'KINH_DOANH' | 'KE_TOAN' | 'LAI_XE' | 'NHA_XE';
export type Ownership = 'CONG_TY' | 'DOI_TAC';
export type VehicleStatus = 'SAN_SANG' | 'BAO_DUONG' | 'NGUNG_HOAT_DONG';
export type DriverStatus = 'DANG_LAM' | 'NGHI_PHEP' | 'NGHI_VIEC';
/** Mã loại khách hàng (danh mục /customer-types; mặc định KHACH_LE, DOANH_NGHIEP, DAI_LY, KHACH_SAN) */
export type CustomerType = string;
export type LocationType = 'SAN_BAY' | 'KHACH_SAN' | 'DIEM_THAM_QUAN' | 'BEN_XE' | 'KHAC';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  roles: Role[];
  driverId: number | null;
  /** Tài khoản nhà xe đối tác: nhà xe được liên kết */
  partnerId?: number | null;
}

interface Ref {
  id: number;
}

export interface VehicleType extends Ref {
  code: string;
  name: string;
  seats: number;
  maxPassengers: number;
  licenseClasses: string[];
  isActive: boolean;
  /** Tên trên giấy tờ gửi khách nước ngoài */
  names?: Partial<Record<'en' | 'ko' | 'zh' | 'ja', string>>;
  /** Định mức xăng dầu (lít/100km), null = 11 */
  fuelNorm: string | null;
  _count?: { vehicles: number };
}

export interface Vehicle extends Ref {
  plateNumber: string;
  vehicleTypeId: number;
  vehicleType: { id: number; code: string; name: string; seats: number; fuelNorm: string | null };
  /** Định mức xăng dầu riêng (lít/100km), null = theo loại xe */
  fuelNorm: string | null;
  /** Loại nhiên liệu (mặt hàng Petrolimex) */
  fuelType: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  ownership: Ownership;
  partnerId: number | null;
  partner: { id: number; name: string } | null;
  status: VehicleStatus;
  registrationExpiry: string | null;
  insuranceExpiry: string | null;
  badgeExpiry: string | null;
  odometerKm: number | null;
  defaultDriverId: number | null;
  defaultDriver: { id: number; fullName: string; phone: string } | null;
  notes: string | null;
}

export interface Driver extends Ref {
  fullName: string;
  phone: string;
  idCardNumber: string | null;
  licenseClass: string | null;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  healthCheckExpiry: string | null;
  partnerId: number | null;
  partner: { id: number; name: string } | null;
  status: DriverStatus;
  user: { id: number; username: string; isActive: boolean } | null;
  defaultVehicles: { id: number; plateNumber: string }[];
  notes: string | null;
}

export interface Partner extends Ref {
  name: string;
  contactName: string | null;
  phone: string | null;
  zalo: string | null;
  taxCode: string | null;
  address: string | null;
  bankName: string | null;
  bankAccount: string | null;
  vehicleTypeCodes: string[];
  rating: number | null;
  notes: string | null;
  isActive: boolean;
  _count?: { vehicles: number; drivers: number };
}

export interface Customer extends Ref {
  type: CustomerType;
  name: string;
  phone: string | null;
  email: string | null;
  taxCode: string | null;
  address: string | null;
  /** Thông tin Bên A trên hợp đồng vận chuyển */
  idNumber: string | null;
  representative: string | null;
  representativeTitle: string | null;
  representativeIdNumber: string | null;
  bankAccount: string | null;
  salesUserId: number | null;
  salesUser: { id: number; fullName: string } | null;
  creditLimit: string | null;
  discountPercent: string | null;
  paymentTermDays: number;
  notes: string | null;
  /** Ngôn ngữ giấy tờ mặc định: vi | en | ko | zh | ja */
  docLanguage: string;
  isActive: boolean;
}

export interface Location extends Ref {
  name: string;
  type: LocationType;
  address: string | null;
  lat: number | null;
  lng: number | null;
  isActive: boolean;
}

export interface User extends Ref {
  username: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  roles: Role[];
  isActive: boolean;
  driver: { id: number; fullName: string } | null;
  /** Tài khoản nhà xe đối tác: nhà xe được liên kết */
  partner?: { id: number; name: string } | null;
}

// ───── Bảng giá & booking ─────

/** Mã dịch vụ trong danh mục Dịch vụ */
export type ServiceType = string;
export type PricingMode = 'TUYEN' | 'THEO_NGAY' | 'XE_GHEP';

export interface Service {
  code: string;
  name: string;
  pricingMode: PricingMode;
  hasFlight: boolean;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  /** Tên trên giấy tờ gửi khách nước ngoài */
  names?: Partial<Record<'en' | 'ko' | 'zh' | 'ja', string>>;
  _count?: { trips: number; routes: number };
}

type ServiceRef = Pick<Service, 'code' | 'name' | 'color' | 'pricingMode' | 'hasFlight' | 'names'>;
export type SurchargeRule = 'BAN_DEM' | 'LE_TET' | 'THU_CONG';
/** Mã nguồn khách trong danh mục Nguồn khách */
export type BookingSource = string;

export interface CustomerKind {
  code: string;
  name: string;
  color: string | null;
  /** Hưởng giá đại lý (xe ghép), booking mặc định nguồn Đại lý */
  isAgent: boolean;
  sortOrder: number;
  isActive: boolean;
  _count?: { customers: number };
}
export interface CustomerSource {
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  _count?: { bookings: number };
}
export type BookingStatus = 'NHAP' | 'BAO_GIA' | 'XAC_NHAN' | 'HOAN_THANH' | 'HUY';
export type TripStatus = 'CHO_DIEU' | 'DA_GAN' | 'TAI_XE_NHAN' | 'DANG_DEN_DON' | 'DA_DON_KHACH' | 'HOAN_THANH' | 'HUY';

export interface RoutePrice extends Ref {
  name: string;
  serviceType: ServiceType;
  service?: ServiceRef;
  fromLocationId: number | null;
  fromLocation: { id: number; name: string } | null;
  toLocationId: number | null;
  toLocation: { id: number; name: string } | null;
  distanceKm: number | null;
  durationHours: string | null;
  notes: string | null;
  isActive: boolean;
  items: { vehicleTypeId: number; price: string; partnerCost: string | null; vehicleType: { id: number; code: string; name: string; seats: number } }[];
}

export interface RentalRate {
  fullDayPrice: string;
  fullDayHours: number;
  fullDayKm: number;
  halfDayPrice: string | null;
  halfDayHours: number;
  halfDayKm: number;
  extraKmPrice: string;
  extraHourPrice: string;
  driverOvernightFee: string;
  /** Các dòng giá tự thêm: thuê 4 tiếng, 6 tiếng… */
  extraOptions: RentalOption[];
}

export interface RentalOption {
  name: string;
  price: number;
  hours: number;
  km: number;
}

export interface RentalRateRow extends Ref {
  code: string;
  name: string;
  seats: number;
  rentalRate: RentalRate | null;
}

export interface Surcharge extends Ref {
  name: string;
  rule: SurchargeRule;
  isPercent: boolean;
  value: string;
  isActive: boolean;
}

export interface Holiday extends Ref {
  name: string;
  startDate: string;
  endDate: string;
}

export interface PriceLine {
  name: string;
  amount: number;
  auto?: boolean;
}

export interface PriceResult {
  unitPrice: number;
  breakdown: PriceLine[];
  surcharges: PriceLine[];
  amount: number;
  partnerCost: number | null;
  endTime: string;
}

export interface BookingTrip extends Ref {
  /** Ký nhận điện tử của khách trên app lái xe */
  signoffName?: string | null;
  signoffAt?: string | null;
  /** SVG path chữ ký (khung 600×300) */
  signoffSvg?: string | null;
  signoffNote?: string | null;
  seq: number;
  /** Xe ghép */
  shuttleRunId?: number | null;
  shuttlePickupStopId?: number | null;
  shuttleDropoffStopId?: number | null;
  childCount?: number;
  shuttleRun?: { id: number; departAt: string; routeId: number; status: string; route: { name: string } } | null;
  shuttlePickupStop?: { id: number; name: string; kind: string } | null;
  shuttleDropoffStop?: { id: number; name: string; kind: string } | null;
  serviceType: ServiceType;
  service?: ServiceRef;
  pickupTime: string;
  endTime: string;
  pickupLocationId: number | null;
  pickupAddress: string;
  dropoffLocationId: number | null;
  dropoffAddress: string | null;
  flightNumber: string | null;
  departureFlight: string | null;
  /** Nhờ lái xe thu tiền khách giúp */
  collectAmount?: string | null;
  collectNote?: string | null;
  collectedAt?: string | null;
  collectedAmount?: string | null;
  collectMethod?: 'TIEN_MAT' | 'CHUYEN_KHOAN' | null;
  collectSettledAt?: string | null;
  /** Nhà xe đối tác phải xuất hóa đơn cho công ty */
  partnerInvoice?: boolean;
  partnerInvoiceNote?: string | null;
  /** Thuế suất trên hóa đơn nhà xe (%) */
  partnerVatPercent?: string | number;
  /** Sự cố nhà xe: TRE_GIO | KHONG_DON */
  partnerIssue?: string | null;
  /** Lý do điều chỉnh giá nhà xe gần nhất */
  partnerAdjustNote?: string | null;
  /** Phát sinh nhà xe (trước thuế) */
  partnerExtraUp?: string | number;
  partnerExtraDown?: string | number;
  partnerExtraNote?: string | null;
  /** Duyệt phát sinh: CHO_DUYET | DA_DUYET | TU_CHOI */
  partnerExtraStatus?: string | null;
  partnerExtraReviewNote?: string | null;
  partnerExtraReviewedBy?: string | null;
  partnerExtraReviewedAt?: string | null;
  /** Km đồng hồ và xăng theo định mức (xe công ty) */
  startKm?: number | null;
  endKm?: number | null;
  fuelNorm?: string | null;
  fuelPrice?: string | null;
  fuelLiters?: string | null;
  fuelCost?: string | null;
  passengers: number;
  vehicleTypeId: number;
  vehicleType: { id: number; code: string; name: string; seats: number; maxPassengers: number; names?: VehicleType['names'] };
  routePriceId: number | null;
  routePrice: { id: number; name: string } | null;
  days: number;
  extraKm: number;
  extraHours: number;
  unitPrice: string;
  surcharges: PriceLine[];
  amount: string;
  estimatedCost: string | null;
  itinerary: string | null;
  notes: string | null;
  status: TripStatus;
  vehicle?: { plateNumber: string } | null;
  driver?: { fullName: string } | null;
  partner?: { name: string } | null;
  partnerPlate?: string | null;
  partnerDriverName?: string | null;
  partnerDriverPhone?: string | null;
}

export interface Passenger {
  id?: number;
  fullName: string;
  gender: 'NAM' | 'NU' | null;
  birthYear: number | null;
  idNumber: string | null;
  nationality: string | null;
  phone: string | null;
  note: string | null;
  /** Lái xe bổ sung trên app khi đón khách */
  addedByDriverId?: number | null;
  addedByName?: string | null;
  addedAt?: string | null;
}

export type PaymentMethod = 'TIEN_MAT' | 'CHUYEN_KHOAN' | 'THE' | 'KHAC';

export interface Payment {
  id: number;
  amount: string;
  method: PaymentMethod;
  paidAt: string;
  reference: string | null;
  note: string | null;
  createdBy?: { id: number; fullName: string };
}

export interface CostCategory {
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  /** Lái xe được chọn trên app */
  driverVisible: boolean;
  _count?: { costs: number };
}

export interface TripCostRow {
  id: number;
  tripId: number;
  categoryCode: string;
  category: { name: string };
  amount: string;
  spentAt: string;
  note: string | null;
  byDriver: boolean;
  /** Ảnh hóa đơn / vé lái xe chụp trên app */
  receiptFile?: string | null;
  createdById: number | null;
  createdBy: { fullName: string } | null;
}

export interface Booking extends Ref {
  customerRef: string | null;
  /** Ngôn ngữ giấy tờ gửi khách: vi | en | ko | zh | ja */
  docLanguage: string;
  /** Bản dịch nội dung cho giấy tờ ngoại ngữ: { en: { "trip.12.pickupAddress": { src, text } } } */
  docTranslations?: Record<string, Record<string, { src: string; text: string }>>;
  /** Người liên hệ trong chuyến: HDV | TRUONG_DOAN */
  leaderRole: 'HDV' | 'TRUONG_DOAN' | null;
  leaderName: string | null;
  leaderPhone: string | null;
  leaderApp: import('./contact-apps').ContactApp | null;
  leaderAppId: string | null;
  payments: Payment[];
  paid: number;
  balance: number;
  passengers: Passenger[];
  signTitle: string | null;
  signSubtitle: string | null;
  signFile: string | null;
  signFileName: string | null;
  signFileType: string | null;
  code: string;
  customerId: number | null;
  customer: { id: number; name: string; type: CustomerType; phone: string | null; email: string | null; taxCode: string | null; address: string | null } | null;
  contactName: string;
  contactPhone: string;
  source: BookingSource;
  status: BookingStatus;
  salesUserId: number | null;
  salesUser: { id: number; fullName: string; phone?: string | null } | null;
  createdBy: { id: number; fullName: string; phone?: string | null };
  discountAmount: string;
  /** Khách lấy hóa đơn VAT: giá chuyến là giá chưa thuế */
  invoiceRequired?: boolean;
  vatPercent: string;
  invoiceCompany?: string | null;
  invoiceTaxCode?: string | null;
  invoiceAddress?: string | null;
  invoiceEmail?: string | null;
  depositAmount: string;
  quoteValidUntil: string | null;
  notes: string | null;
  internalNotes: string | null;
  cancelReason: string | null;
  trips: BookingTrip[];
  createdAt: string;
  subtotal: number;
  /** Thành tiền chưa thuế (sau giảm giá) */
  taxable?: number;
  vatAmount: number;
  total: number;
  remaining: number;
}

// ───── Điều phối ─────

export interface DispatchTrip extends Omit<BookingTrip, 'vehicleType' | 'routePrice'> {
  bookingId: number;
  booking: {
    id: number;
    code: string;
    customerRef: string | null;
    status: BookingStatus;
    contactName: string;
    contactPhone: string;
    customer: { id: number; name: string } | null;
    leaderRole?: 'HDV' | 'TRUONG_DOAN' | null;
    leaderName?: string | null;
    leaderPhone?: string | null;
    leaderApp?: import('./contact-apps').ContactApp | null;
    leaderAppId?: string | null;
    /** Hành khách đầu tiên trong danh sách hành khách (nếu có) */
    passengers?: { fullName: string; phone: string | null; birthYear?: number | null }[];
  };
  vehicleType: { id: number; code: string; name: string; seats: number; maxPassengers: number };
  vehicleId: number | null;
  vehicle: { id: number; plateNumber: string; vehicleType: { name: string } } | null;
  driverId: number | null;
  driver: { id: number; fullName: string; phone: string } | null;
  partnerId: number | null;
  partner: { id: number; name: string; phone: string | null } | null;
  partnerPlate: string | null;
  partnerDriverName: string | null;
  partnerDriverPhone: string | null;
  partnerCost: string | null;
  dispatchNote: string | null;
  assignedAt: string | null;
  assignedBy: { id: number; fullName: string } | null;
  events?: { id: number; status: TripStatus; note: string | null; createdAt: string; user: { fullName: string } | null }[];
}

export interface ScheduleVehicle {
  id: number;
  plateNumber: string;
  status: VehicleStatus;
  vehicleType: { id: number; code: string; name: string; seats: number; maxPassengers: number };
  defaultDriver: { id: number; fullName: string } | null;
  trips: DispatchTrip[];
}

export interface Schedule {
  from: string;
  to: string;
  vehicles: ScheduleVehicle[];
  partnerTrips: DispatchTrip[];
  waiting: DispatchTrip[];
  overdueCount: number;
  /** Số chuyến chờ điều xa hơn 7 ngày tới (không có trong waiting) */
  waitingLater: number;
  /** Ngày cuối của cửa sổ 7 ngày (YYYY-MM-DD) */
  waitingUntil: string;
}

interface Conflict {
  code: string;
  pickupTime: string;
  endTime: string;
}

export interface DispatchOptions {
  vehicles: {
    id: number;
    plateNumber: string;
    status: VehicleStatus;
    vehicleType: { id: number; code: string; name: string; seats: number; maxPassengers: number; licenseClasses: string[] };
    defaultDriver: { id: number; fullName: string } | null;
    exactType: boolean;
    conflicts: Conflict[];
  }[];
  drivers: { id: number; fullName: string; phone: string; status: DriverStatus; licenseClass: string | null; conflicts: Conflict[] }[];
}

type ForeignLang = 'en' | 'ko' | 'zh' | 'ja';
/** Cài đặt công ty; các khóa *_en/_ko/_zh/_ja là bản ngoại ngữ trên giấy tờ gửi khách */
export type Settings = Partial<
  Record<
    | 'companyName'
    | 'companyAddress'
    | 'companyPhone'
    | 'companyEmail'
    | 'companyTaxCode'
    | 'companyWebsite'
    | 'companySlogan'
    | 'bankInfo'
    | 'quoteFooter'
    | 'companyLogo'
    // Hợp đồng vận chuyển (NĐ 158/2024)
    | 'companyRepresentative'
    | 'companyRepresentativeTitle'
    | 'companyRepresentativeId'
    | 'companyTransportLicense'
    | 'companyHotline'
    | 'contractTerms'
    | 'contractTerms_en'
    | 'zaloDriverGroup'
    | 'gpsSpeedLimit'
    | 'gpsStopMinutes'
    | 'gpsLostMinutes'
    | 'vietmapKey'
    | 'googleMapsKey'
    | `${'companyName' | 'companyAddress' | 'bankInfo' | 'quoteFooter'}_${ForeignLang}`
    // Dịch tự động: dịch vụ đang dùng; khóa API chỉ báo đã cài + 4 ký tự cuối
    | 'translateProvider'
    | 'translateKeySet'
    | 'translateKeyHint',
    string
  >
>;

export interface ExpiryAlert {
  kind: 'XE' | 'LAI_XE';
  id: number;
  name: string;
  document: string;
  expiry: string;
  daysLeft: number;
}
