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
  paymentTermDays: number;
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

// ───── Bảng giá & booking ─────

/** Mã dịch vụ trong danh mục Dịch vụ */
export type ServiceType = string;
export type PricingMode = 'TUYEN' | 'THEO_NGAY';

export interface Service {
  code: string;
  name: string;
  pricingMode: PricingMode;
  hasFlight: boolean;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { trips: number; routes: number };
}

type ServiceRef = Pick<Service, 'code' | 'name' | 'color' | 'pricingMode' | 'hasFlight'>;
export type SurchargeRule = 'BAN_DEM' | 'LE_TET' | 'THU_CONG';
export type BookingSource = 'HOTLINE' | 'ZALO' | 'WEBSITE' | 'EMAIL' | 'DAI_LY' | 'KHAC';
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
  seq: number;
  serviceType: ServiceType;
  service?: ServiceRef;
  pickupTime: string;
  endTime: string;
  pickupLocationId: number | null;
  pickupAddress: string;
  dropoffLocationId: number | null;
  dropoffAddress: string | null;
  flightNumber: string | null;
  passengers: number;
  vehicleTypeId: number;
  vehicleType: { id: number; code: string; name: string; seats: number; maxPassengers: number };
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
  createdById: number | null;
  createdBy: { fullName: string } | null;
}

export interface Booking extends Ref {
  customerRef: string | null;
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
  salesUser: { id: number; fullName: string } | null;
  createdBy: { id: number; fullName: string };
  discountAmount: string;
  vatPercent: string;
  depositAmount: string;
  quoteValidUntil: string | null;
  notes: string | null;
  internalNotes: string | null;
  cancelReason: string | null;
  trips: BookingTrip[];
  createdAt: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  remaining: number;
}

// ───── Điều phối ─────

export interface DispatchTrip extends Omit<BookingTrip, 'vehicleType' | 'routePrice'> {
  bookingId: number;
  booking: { id: number; code: string; customerRef: string | null; status: BookingStatus; contactName: string; contactPhone: string; customer: { id: number; name: string } | null };
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

export type Settings = Partial<
  Record<'companyName' | 'companyAddress' | 'companyPhone' | 'companyEmail' | 'companyTaxCode' | 'bankInfo' | 'quoteFooter', string>
>;

export interface ExpiryAlert {
  kind: 'XE' | 'LAI_XE';
  id: number;
  name: string;
  document: string;
  expiry: string;
  daysLeft: number;
}
