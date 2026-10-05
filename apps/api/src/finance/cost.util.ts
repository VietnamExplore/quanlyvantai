type Num = { toString(): string } | number | string | null;

export interface TripCostInput {
  partnerId: number | null;
  partnerCost: Num;
  /** Phát sinh nhà xe (trước thuế) */
  partnerExtraUp?: Num;
  partnerExtraDown?: Num;
  partnerExtraStatus?: string | null;
  estimatedCost: Num;
  costs: { amount: Num; categoryCode?: string | null }[];
  /** Chi phí xăng theo định mức (km × định mức × giá) */
  fuelCost?: Num;
}

/**
 * Chi phí của chuyến dùng cho báo cáo lợi nhuận:
 * - Xe đối tác: giá thuê đối tác + chi phí phát sinh.
 * - Xe công ty: tổng chi phí thực đã nhập; chưa nhập dòng nào thì tạm dùng chi phí dự kiến.
 */
export function tripCost(t: TripCostInput) {
  const extra = t.costs.reduce((s, c) => s + Number(c.amount ?? 0), 0);
  if (t.partnerId) return { cost: partnerNet(t) + extra, actual: true, known: true };
  // Xe công ty đã ghi km: xăng tính theo định mức (bỏ khoản xăng nhập tay của chuyến để không tính trùng)
  if (t.fuelCost !== null && t.fuelCost !== undefined) {
    const others = t.costs.filter((c) => c.categoryCode !== 'XANG_DAU').reduce((s, c) => s + Number(c.amount ?? 0), 0);
    return { cost: Number(t.fuelCost) + others, actual: true, known: true };
  }
  if (t.costs.length) return { cost: extra, actual: true, known: true };
  if (t.estimatedCost !== null && t.estimatedCost !== undefined) return { cost: Number(t.estimatedCost), actual: false, known: true };
  return { cost: 0, actual: false, known: false };
}

export const DEFAULT_COST_CATEGORIES = [
  { code: 'XANG_DAU', name: 'Xăng dầu', sortOrder: 1 },
  { code: 'CAU_DUONG', name: 'Cầu đường / BOT', sortOrder: 2 },
  { code: 'BEN_BAI', name: 'Bến bãi / gửi xe', sortOrder: 3 },
  { code: 'AN_O_TAI_XE', name: 'Ăn ở tài xế', sortOrder: 4 },
  { code: 'LUONG_TAI_XE', name: 'Lương / tiền chuyến tài xế', sortOrder: 5 },
  { code: 'RUA_XE', name: 'Rửa xe', sortOrder: 6 },
  { code: 'KHAC', name: 'Khác', sortOrder: 99 },
];

type ExtraInput = { partnerCost: Num; partnerExtraUp?: Num; partnerExtraDown?: Num; partnerExtraStatus?: string | null };

/** Phát sinh nhà xe chỉ được tính khi Điều hành / Admin đã duyệt */
export const extraApproved = (t: { partnerExtraStatus?: string | null }) => t.partnerExtraStatus === 'DA_DUYET';

/** Giá nhà xe trước thuế = giá thuê + phát sinh tăng − phát sinh giảm đã duyệt (không âm) */
export function partnerNet(t: ExtraInput) {
  const ok = extraApproved(t);
  return Math.max(0, Number(t.partnerCost ?? 0) + (ok ? Number(t.partnerExtraUp ?? 0) - Number(t.partnerExtraDown ?? 0) : 0));
}

/** Số tiền phải trả nhà xe cho chuyến: giá chưa thuế + thuế (khi nhà xe xuất hóa đơn) */
export function partnerPayable(t: ExtraInput & { partnerInvoice?: boolean; partnerVatPercent?: Num }) {
  const net = partnerNet(t);
  const vat = t.partnerInvoice ? Math.round((net * Number(t.partnerVatPercent ?? 0)) / 100) : 0;
  return { net, vat, total: net + vat };
}
