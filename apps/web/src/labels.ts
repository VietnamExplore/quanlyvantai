import type {
  BookingStatus,
  CustomerType,
  DriverStatus,
  LocationType,
  Ownership,
  PaymentMethod,
  Role,
  SurchargeRule,
  TripStatus,
  VehicleStatus,
} from './types';

type Labels<K extends string> = Record<K, { label: string; color?: string }>;

export const ROLE: Labels<Role> = {
  ADMIN: { label: 'Admin', color: 'red' },
  DIEU_HANH: { label: 'Điều hành xe', color: 'blue' },
  KINH_DOANH: { label: 'Kinh doanh', color: 'green' },
  KE_TOAN: { label: 'Kế toán', color: 'purple' },
  LAI_XE: { label: 'Lái xe', color: 'orange' },
};

export const OWNERSHIP: Labels<Ownership> = {
  CONG_TY: { label: 'Công ty', color: 'blue' },
  DOI_TAC: { label: 'Đối tác', color: 'gold' },
};

export const VEHICLE_STATUS: Labels<VehicleStatus> = {
  SAN_SANG: { label: 'Sẵn sàng', color: 'green' },
  BAO_DUONG: { label: 'Bảo dưỡng', color: 'orange' },
  NGUNG_HOAT_DONG: { label: 'Ngừng hoạt động', color: 'default' },
};

export const DRIVER_STATUS: Labels<DriverStatus> = {
  DANG_LAM: { label: 'Đang làm', color: 'green' },
  NGHI_PHEP: { label: 'Nghỉ phép', color: 'orange' },
  NGHI_VIEC: { label: 'Nghỉ việc', color: 'default' },
};

export const CUSTOMER_TYPE: Labels<CustomerType> = {
  KHACH_LE: { label: 'Khách lẻ' },
  DOANH_NGHIEP: { label: 'Doanh nghiệp', color: 'blue' },
  DAI_LY: { label: 'Đại lý', color: 'purple' },
  KHACH_SAN: { label: 'Khách sạn', color: 'cyan' },
};

export const LOCATION_TYPE: Labels<LocationType> = {
  SAN_BAY: { label: 'Sân bay', color: 'blue' },
  KHACH_SAN: { label: 'Khách sạn', color: 'cyan' },
  DIEM_THAM_QUAN: { label: 'Điểm tham quan', color: 'green' },
  BEN_XE: { label: 'Bến xe', color: 'orange' },
  KHAC: { label: 'Khác' },
};

export const SURCHARGE_RULE: Labels<SurchargeRule> = {
  BAN_DEM: { label: 'Tự động: ban đêm 22h–5h', color: 'geekblue' },
  LE_TET: { label: 'Tự động: ngày lễ, Tết', color: 'red' },
  THU_CONG: { label: 'Chọn tay khi báo giá' },
};

export const BOOKING_STATUS: Labels<BookingStatus> = {
  NHAP: { label: 'Nháp', color: 'default' },
  BAO_GIA: { label: 'Đã báo giá', color: 'gold' },
  XAC_NHAN: { label: 'Đã xác nhận', color: 'blue' },
  HOAN_THANH: { label: 'Hoàn thành', color: 'green' },
  HUY: { label: 'Đã hủy', color: 'red' },
};

export const TRIP_STATUS: Labels<TripStatus> = {
  CHO_DIEU: { label: 'Chờ điều xe', color: 'orange' },
  DA_GAN: { label: 'Đã gán xe', color: 'blue' },
  TAI_XE_NHAN: { label: 'Tài xế đã nhận', color: 'cyan' },
  DANG_DEN_DON: { label: 'Đang đến đón', color: 'geekblue' },
  DA_DON_KHACH: { label: 'Đã đón khách', color: 'purple' },
  HOAN_THANH: { label: 'Hoàn thành', color: 'green' },
  HUY: { label: 'Đã hủy', color: 'red' },
};

export const PAYMENT_METHOD: Labels<PaymentMethod> = {
  TIEN_MAT: { label: 'Tiền mặt', color: 'green' },
  CHUYEN_KHOAN: { label: 'Chuyển khoản', color: 'blue' },
  THE: { label: 'Thẻ', color: 'purple' },
  KHAC: { label: 'Khác' },
};

/** Chuyển bộ nhãn thành danh sách option cho Select / Radio. */
export const toOptions = <K extends string>(labels: Labels<K>) =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value].label }));
