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
  passengers: number;
  days: number;
  itinerary: string | null;
  notes: string | null;
  dispatchNote: string | null;
  vehicleType: { name: string };
  service?: { name: string };
  vehicle: { plateNumber: string } | null;
  booking: { code: string; contactName: string; contactPhone: string; customer: { name: string } | null };
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
