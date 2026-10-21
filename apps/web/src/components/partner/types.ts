import type { TripStatus } from '../../types';

/** Chuyến nhà xe được xem (không có giá bán cho khách, thông tin khách hàng, SĐT từng khách) */
export interface PartnerTrip {
  id: number;
  seq: number;
  status: TripStatus;
  serviceType: string;
  pickupTime: string;
  endTime: string | null;
  pickupAddress: string;
  dropoffAddress: string | null;
  flightNumber: string | null;
  departureFlight: string | null;
  passengers: number;
  days: number;
  itinerary: string | null;
  notes: string | null;
  dispatchNote: string | null;
  partnerPlate: string | null;
  partnerDriverName: string | null;
  partnerDriverPhone: string | null;
  partnerCost: string | null;
  /** Văn phòng yêu cầu nhà xe xuất hóa đơn cho công ty */
  partnerInvoice: boolean;
  partnerInvoiceNote: string | null;
  partnerVatPercent: string;
  /** Văn phòng điều chỉnh giá: lý do */
  partnerAdjustNote: string | null;
  /** Phát sinh (trước thuế) nhà xe nhập khi hoàn thành */
  partnerExtraUp: string;
  partnerExtraDown: string;
  partnerExtraNote: string | null;
  /** Duyệt phát sinh: CHO_DUYET | DA_DUYET | TU_CHOI (chỉ phát sinh đã duyệt mới tính công nợ) */
  partnerExtraStatus: string | null;
  partnerExtraReviewNote: string | null;
  vehicleType: { name: string; seats: number };
  /** Xe ghép: tuyến, giờ khởi hành, giá mỗi khách (giao theo đầu khách) */
  shuttleRun?: { departAt: string; partnerPricePerPax: string | null; route: { name: string } } | null;
  shuttlePickupStop?: { name: string } | null;
  shuttleDropoffStop?: { name: string } | null;
  service: { name: string } | null;
  booking: {
    code: string;
    leaderRole: string | null;
    leaderName: string | null;
    leaderPhone: string | null;
    leaderApp: string | null;
    leaderAppId: string | null;
    signTitle: string | null;
    docLanguage: string | null;
    signSubtitle: string | null;
    signFileType: string | null;
    passengers: { seq: number; fullName: string; gender: string | null; birthYear?: number | null; nationality: string | null; phone?: string | null }[];
    /** Khách để gọi đón: trưởng đoàn / khách đi có SĐT / người đặt là khách đi */
    guestContact?: { name: string | null; phone: string } | null;
    /** Hợp đồng vận chuyển điện tử: lái xe xuất trình khi kiểm tra */
    contract?: { number: string; token: string } | null;
  };
}
