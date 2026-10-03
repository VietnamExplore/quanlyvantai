export type Role = 'ADMIN' | 'DIEU_HANH' | 'KINH_DOANH' | 'KE_TOAN' | 'LAI_XE';
export type Ownership = 'CONG_TY' | 'DOI_TAC';
export type VehicleStatus = 'SAN_SANG' | 'BAO_DUONG' | 'NGUNG_HOAT_DONG';
export type DriverStatus = 'DANG_LAM' | 'NGHI_PHEP' | 'NGHI_VIEC';
export type CustomerType = 'KHACH_LE' | 'DOANH_NGHIEP' | 'DAI_LY' | 'KHACH_SAN';
export type LocationType = 'SAN_BAY' | 'KHACH_SAN' | 'DIEM_THAM_QUAN' | 'BEN_XE' | 'KHAC';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  roles: Role[];
  driverId: number | null;
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
  _count?: { vehicles: number };
}

export interface Vehicle extends Ref {
  plateNumber: string;
  vehicleTypeId: number;
  vehicleType: { id: number; code: string; name: string; seats: number };
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
  salesUserId: number | null;
  salesUser: { id: number; fullName: string } | null;
  creditLimit: string | null;
  discountPercent: string | null;
  notes: string | null;
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
}

export interface ExpiryAlert {
  kind: 'XE' | 'LAI_XE';
  id: number;
  name: string;
  document: string;
  expiry: string;
  daysLeft: number;
}
