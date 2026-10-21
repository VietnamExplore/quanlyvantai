import type { TripStatus } from './types';

/** Xe ghép (shared shuttle bus): dữ liệu từ API /shuttle */

export type ShuttleStopKind = 'DIEM_DUNG' | 'KHU_VUC';
export type ShuttleRunStatus = 'MO_BAN' | 'DONG_BAN' | 'HUY';

export interface ShuttleStop {
  id: number;
  seq: number;
  name: string;
  kind: ShuttleStopKind;
  address: string | null;
  offsetMinutes: number;
  surcharge: string;
  canPickup: boolean;
  canDropoff: boolean;
  isActive: boolean;
}

export interface ShuttleSchedule {
  id: number;
  departTime: string;
  weekdays: number[];
  validFrom: string | null;
  validTo: string | null;
  capacity: number | null;
  isActive: boolean;
}

export interface ShuttleRoute {
  id: number;
  code: string;
  name: string;
  vehicleTypeId: number;
  vehicleType: { id: number; name: string; seats: number };
  capacity: number;
  durationMinutes: number;
  adultPrice: string;
  childPrice: string;
  agentAdultPrice: string | null;
  agentChildPrice: string | null;
  notes: string | null;
  isActive: boolean;
  sortOrder: number;
  stops: ShuttleStop[];
  schedules: ShuttleSchedule[];
}

export interface ShuttleRun {
  id: number;
  routeId: number;
  scheduleId: number | null;
  departAt: string;
  capacity: number;
  vehicleTypeId: number;
  status: ShuttleRunStatus;
  note: string | null;
  route: { id: number; code: string; name: string; durationMinutes: number };
  vehicleType: { id: number; name: string; seats: number; maxPassengers: number };
  vehicle: { id: number; plateNumber: string } | null;
  driver: { id: number; fullName: string; phone: string } | null;
  partner: { id: number; name: string; phone: string | null } | null;
  partnerPlate: string | null;
  partnerDriverName: string | null;
  partnerDriverPhone: string | null;
  partnerCost: string | null;
  /** Giao nhà xe theo đầu khách: giá mỗi khách */
  partnerPricePerPax: string | null;
  estimatedCost: string | null;
  dispatchNote: string | null;
  seatsConfirmed: number;
  seatsHeld: number;
  seatsLeft: number;
  bookingCount?: number;
  /** Chuyến theo lịch nhưng giờ chạy đã bị tắt / đổi, vẫn còn khách */
  offSchedule?: boolean;
  /** Tiến trình theo các lượt khách: chưa điều / đã điều / đang chạy / hoàn thành */
  tripStatus?: 'CHO_DIEU' | 'DA_DIEU' | 'DANG_CHAY' | 'HOAN_THANH' | null;
}

export interface ShuttleRunTrip {
  id: number;
  status: TripStatus;
  pickupTime: string;
  pickupAddress: string;
  dropoffAddress: string | null;
  passengers: number;
  childCount: number;
  flightNumber: string | null;
  departureFlight: string | null;
  notes: string | null;
  collectAmount: string | null;
  amount: string;
  shuttlePickupStop: ShuttleStop | null;
  shuttleDropoffStop: ShuttleStop | null;
  booking: {
    id: number;
    code: string;
    status: string;
    contactName: string;
    contactPhone: string;
    customerRef: string | null;
    leaderName: string | null;
    leaderPhone: string | null;
    /** Khách đi */
    passengers?: { seq: number; fullName: string; gender: string | null; birthYear: number | null; nationality: string | null; phone: string | null }[];
    customer: { name: string; type: string } | null;
    notes: string | null;
    balance: number;
  };
}

export interface ShuttleRunDetail extends ShuttleRun {
  route: ShuttleRun['route'] & { stops: ShuttleStop[] };
  trips: ShuttleRunTrip[];
}

export const RUN_STATUS: Record<ShuttleRunStatus, { label: string; color: string }> = {
  MO_BAN: { label: 'Mở bán', color: 'green' },
  DONG_BAN: { label: 'Đóng bán', color: 'orange' },
  HUY: { label: 'Đã hủy', color: 'red' },
};

export const RUN_PROGRESS: Record<NonNullable<ShuttleRun['tripStatus']>, { label: string; color: string }> = {
  CHO_DIEU: { label: 'Chưa điều xe', color: 'orange' },
  DA_DIEU: { label: 'Đã điều xe', color: 'blue' },
  DANG_CHAY: { label: 'Đang chạy', color: 'purple' },
  HOAN_THANH: { label: 'Hoàn thành', color: 'default' },
};

export const WEEKDAYS = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 7, label: 'CN' },
];

/** Giá vé: người lớn / trẻ em (giá đại lý nếu khách là đại lý) + phụ phí khu vực đón / trả mỗi ghế */
export function shuttlePrice(route: ShuttleRoute, opts: { adults: number; children: number; agent?: boolean; pickup?: ShuttleStop; dropoff?: ShuttleStop }) {
  const adult = Number((opts.agent && route.agentAdultPrice) || route.adultPrice);
  const child = Number((opts.agent && route.agentChildPrice) || route.childPrice);
  const seats = opts.adults + opts.children;
  const surcharge = (Number(opts.pickup?.surcharge ?? 0) + Number(opts.dropoff?.surcharge ?? 0)) * seats;
  return { adult, child, fare: opts.adults * adult + opts.children * child, surcharge };
}

/** Địa chỉ mặc định của điểm dừng cố định */
export const stopAddress = (s: ShuttleStop) => (s.address ? `${s.name} (${s.address})` : s.name);
