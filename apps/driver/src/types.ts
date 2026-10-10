export type TripStatus = 'CHO_DIEU' | 'DA_GAN' | 'TAI_XE_NHAN' | 'DANG_DEN_DON' | 'DA_DON_KHACH' | 'HOAN_THANH' | 'HUY';
export type ServiceType = string;

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  roles: string[];
  driverId: number | null;
}

export interface Trip {
  id: number;
  serviceType: ServiceType;
  status: TripStatus;
  pickupTime: string;
  endTime: string;
  pickupAddress: string;
  dropoffAddress: string | null;
  flightNumber: string | null;
  departureFlight?: string | null;
  passengers: number;
  days: number;
  itinerary: string | null;
  notes: string | null;
  dispatchNote: string | null;
  /** Văn phòng nhờ lái xe thu tiền khách (đ) */
  collectAmount?: string | null;
  collectNote?: string | null;
  collectedAt?: string | null;
  collectedAmount?: string | null;
  collectMethod?: 'TIEN_MAT' | 'CHUYEN_KHOAN' | null;
  /** Xe công ty: ghi km đồng hồ, tính xăng theo định mức */
  trackKm?: boolean;
  /** Km bắt đầu tự lấy (km kết thúc chuyến trước của xe), null = lái xe phải nhập */
  suggestStartKm?: number | null;
  startKm?: number | null;
  endKm?: number | null;
  vehicleType: { name: string };
  service?: { name: string };
  vehicle: { plateNumber: string } | null;
  booking: {
    code: string;
    contactName: string;
    contactPhone: string;
    customer: { name: string } | null;
    /** Người liên hệ trong chuyến: HDV | TRUONG_DOAN */
    leaderRole?: string | null;
    leaderName?: string | null;
    leaderPhone?: string | null;
    /** Ứng dụng liên lạc: ZALO | WHATSAPP | KAKAOTALK | WECHAT | LINE | VIBER | TELEGRAM (trống = đoán theo đầu số) */
    leaderApp?: import('./contact').ContactApp | null;
    leaderAppId?: string | null;
    passengers?: Passenger[];
    /** Hợp đồng vận chuyển điện tử (mở bằng mã để xuất trình khi kiểm tra) */
    contract?: { number: string; token: string } | null;
    signTitle?: string | null;
    docLanguage?: string | null;
    signSubtitle?: string | null;
    /** Có file bảng đón khách gửi: image/png, image/jpeg, image/webp, application/pdf */
    signFileType?: string | null;
  };
}

export interface Passenger {
  seq: number;
  fullName: string;
  gender: string | null;
  nationality: string | null;
  phone: string | null;
  note: string | null;
}

export interface CostCategory {
  code: string;
  name: string;
  isActive: boolean;
}

export interface TripCost {
  id: number;
  categoryCode: string;
  category: { name: string };
  amount: string;
  spentAt: string;
  note: string | null;
  byDriver: boolean;
  /** Có ảnh hóa đơn / vé */
  receiptFile?: string | null;
}

export interface DriverProfile {
  id: number;
  fullName: string;
  phone: string;
  licenseClass: string | null;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  healthCheckExpiry: string | null;
  defaultVehicles: { id: number; plateNumber: string }[];
}
