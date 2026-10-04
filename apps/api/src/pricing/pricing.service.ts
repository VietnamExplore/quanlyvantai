import { BadRequestException, Injectable } from '@nestjs/common';
import { SurchargeRule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CalculatePriceDto } from './pricing.dto';

const TZ = 'Asia/Ho_Chi_Minh';
const HOUR_MS = 3_600_000;
const DEFAULT_ROUTE_HOURS = 2;

export interface PriceLine {
  name: string;
  amount: number;
  auto?: boolean;
}

export interface PriceResult {
  unitPrice: number;
  /** Diễn giải cách tính giá cơ bản */
  breakdown: PriceLine[];
  /** Phụ thu tự động (ban đêm, lễ Tết) */
  surcharges: PriceLine[];
  amount: number;
  /** Giá mua đối tác tham khảo (nếu tuyến có khai báo) */
  partnerCost: number | null;
  /** Gói giá thuê theo ngày đã dùng (null nếu tính theo tuyến) */
  rentalRateId: number | null;
  /** Giờ kết thúc dự kiến */
  endTime: string;
}

/** Làm tròn đến nghìn đồng */
const roundVnd = (v: number) => Math.round(v / 1000) * 1000;

/** Giờ (0–23) và ngày "YYYY-MM-DD" theo giờ Việt Nam */
function vnHourAndDate(d: Date) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(d)) % 24;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  return { hour, date };
}

export const sumLines = (lines: PriceLine[]) => lines.reduce((s, l) => s + Number(l.amount || 0), 0);

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(dto: CalculatePriceDto): Promise<PriceResult> {
    const pickup = new Date(dto.pickupTime);
    const days = dto.days ?? 1;
    const breakdown: PriceLine[] = [];
    let partnerCost: number | null = null;
    let durationHours: number;
    let rentalRateId: number | null = null;

    const vehicleType = await this.prisma.vehicleType.findUniqueOrThrow({ where: { id: dto.vehicleTypeId } });

    if (dto.routePriceId) {
      const route = await this.prisma.routePrice.findUniqueOrThrow({
        where: { id: dto.routePriceId },
        include: { items: { where: { vehicleTypeId: dto.vehicleTypeId } } },
      });
      const item = route.items[0];
      if (!item) throw new BadRequestException(`Tuyến "${route.name}" chưa có giá cho ${vehicleType.name}`);
      breakdown.push({ name: `${route.name} (${vehicleType.name})`, amount: Number(item.price) });
      partnerCost = item.partnerCost === null ? null : Number(item.partnerCost);
      durationHours = route.durationHours === null ? DEFAULT_ROUTE_HOURS : Number(route.durationHours);
    } else {
      const service = await this.prisma.service.findUnique({ where: { code: dto.serviceType } });
      if (!service) throw new BadRequestException('Dịch vụ không tồn tại');
      if (service.pricingMode !== 'THEO_NGAY') throw new BadRequestException(`Dịch vụ "${service.name}" tính giá theo tuyến: hãy chọn tuyến`);
      const rate = dto.rentalRateId
        ? await this.prisma.rentalRate.findFirst({ where: { id: dto.rentalRateId, vehicleTypeId: dto.vehicleTypeId } })
        : await this.prisma.rentalRate.findFirst({ where: { vehicleTypeId: dto.vehicleTypeId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
      if (!rate) {
        throw new BadRequestException(
          dto.rentalRateId
            ? `Gói giá thuê đã chọn không thuộc ${vehicleType.name}`
            : `${vehicleType.name} chưa có giá thuê theo ngày. Hãy chọn tuyến hoặc khai báo giá thuê.`,
        );
      }
      rentalRateId = rate.id;
      const pkg = rate.name && rate.name !== 'Giá chuẩn' ? ` – ${rate.name}` : '';

      if (dto.halfDay && rate.halfDayPrice !== null) {
        breakdown.push({ name: `Thuê nửa ngày${pkg} (${rate.halfDayHours}h/${rate.halfDayKm}km)`, amount: Number(rate.halfDayPrice) });
        durationHours = rate.halfDayHours;
      } else {
        breakdown.push({
          name: `Thuê ${days} ngày${pkg} × ${Number(rate.fullDayPrice).toLocaleString('vi-VN')}đ (${rate.fullDayHours}h/${rate.fullDayKm}km mỗi ngày)`,
          amount: Number(rate.fullDayPrice) * days,
        });
        if (days > 1 && Number(rate.driverOvernightFee) > 0) {
          breakdown.push({ name: `Lưu đêm tài xế ${days - 1} đêm`, amount: Number(rate.driverOvernightFee) * (days - 1) });
        }
        durationHours = (days - 1) * 24 + rate.fullDayHours;
      }
      if (dto.extraKm) breakdown.push({ name: `Vượt ${dto.extraKm} km`, amount: dto.extraKm * Number(rate.extraKmPrice) });
      if (dto.extraHours) breakdown.push({ name: `Vượt ${dto.extraHours} giờ`, amount: dto.extraHours * Number(rate.extraHourPrice) });
    }

    if (dto.extraHours && dto.routePriceId) durationHours += dto.extraHours;
    const unitPrice = sumLines(breakdown);
    const surcharges = await this.autoSurcharges(pickup, unitPrice);

    return {
      unitPrice,
      breakdown,
      surcharges,
      amount: unitPrice + sumLines(surcharges),
      partnerCost,
      rentalRateId,
      endTime: new Date(pickup.getTime() + durationHours * HOUR_MS).toISOString(),
    };
  }

  /** Phụ thu tự động theo giờ đón (ban đêm) và ngày đón (lễ Tết). */
  private async autoSurcharges(pickup: Date, base: number): Promise<PriceLine[]> {
    const { hour, date } = vnHourAndDate(pickup);
    const rules = await this.prisma.surcharge.findMany({
      where: { isActive: true, rule: { in: [SurchargeRule.BAN_DEM, SurchargeRule.LE_TET] } },
    });
    const day = new Date(date);
    const holiday = rules.some((r) => r.rule === SurchargeRule.LE_TET)
      ? await this.prisma.holiday.findFirst({ where: { startDate: { lte: day }, endDate: { gte: day } } })
      : null;

    const lines: PriceLine[] = [];
    for (const r of rules) {
      const applies = r.rule === SurchargeRule.BAN_DEM ? hour >= 22 || hour < 5 : !!holiday;
      if (!applies) continue;
      const amount = r.isPercent ? roundVnd((base * Number(r.value)) / 100) : Number(r.value);
      const label = r.rule === SurchargeRule.LE_TET && holiday ? `${r.name} – ${holiday.name}` : r.name;
      lines.push({ name: r.isPercent ? `${label} (${Number(r.value)}%)` : label, amount, auto: true });
    }
    return lines;
  }
}
