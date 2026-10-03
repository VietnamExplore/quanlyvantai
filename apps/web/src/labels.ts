import type { CustomerType, DriverStatus, LocationType, Ownership, Role, VehicleStatus } from './types';

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

/** Chuyển bộ nhãn thành danh sách option cho Select / Radio. */
export const toOptions = <K extends string>(labels: Labels<K>) =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value].label }));
