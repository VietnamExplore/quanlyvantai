import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Định mức xăng dầu mặc định (lít/100km) khi xe và loại xe đều chưa cài */
export const DEFAULT_FUEL_NORM = 11;
/** Quãng đường tối đa hợp lý mỗi ngày của chuyến (chặn gõ nhầm số km) */
const MAX_KM_PER_DAY = 1500;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Km đồng hồ từng chuyến và chi phí xăng theo định mức:
 * - Km bắt đầu = km kết thúc của chuyến trước của cùng xe (chưa có thì lấy số km hiện tại của xe / lái xe nhập).
 * - Lít = số km × định mức / 100; chi phí = lít × giá xăng dầu.
 * - Định mức: sửa riêng cho chuyến → định mức của xe → của loại xe → 11 lít/100km; giá: cài đặt "Giá xăng dầu",
 *   chưa cài thì lấy giá bình quân các lần đổ xăng 60 ngày gần đây. Định mức + giá được chốt vào chuyến.
 */
@Injectable()
export class OdometerService {
  constructor(private readonly prisma: PrismaService) {}

  async config() {
    const row = await this.prisma.setting.findUnique({ where: { key: 'fuelPrice' } });
    const set = Number(row?.value?.replace(/[^\d]/g, '') || 0);
    let price = set > 0 ? set : null;
    let priceSource: 'setting' | 'average' | null = price ? 'setting' : null;
    if (!price) {
      const since = new Date(Date.now() - 60 * 86_400_000);
      const agg = await this.prisma.cashVoucher.aggregate({ where: { type: 'CHI', liters: { gt: 0 }, date: { gte: since } }, _sum: { amount: true, liters: true } });
      const liters = Number(agg._sum.liters ?? 0);
      if (liters > 0) {
        price = Math.round(Number(agg._sum.amount ?? 0) / liters);
        priceSource = 'average';
      }
    }
    return { price, priceSource };
  }

  /** Km kết thúc gần nhất của xe trước chuyến này (chuyến trước / ngày hôm trước); chưa có thì km hiện tại của xe */
  async previousEndKm(trip: { id: number; vehicleId: number | null; pickupTime: Date }) {
    if (!trip.vehicleId) return null;
    const prev = await this.prisma.bookingTrip.findFirst({
      where: { vehicleId: trip.vehicleId, id: { not: trip.id }, endKm: { not: null }, status: { not: 'HUY' }, pickupTime: { lte: trip.pickupTime } },
      orderBy: [{ pickupTime: 'desc' }, { id: 'desc' }],
      select: { endKm: true },
    });
    if (prev?.endKm) return prev.endKm;
    const v = await this.prisma.vehicle.findUnique({ where: { id: trip.vehicleId }, select: { odometerKm: true } });
    return v?.odometerKm ?? null;
  }

  /**
   * Ghi km cho chuyến. startKm/endKm = undefined: giữ nguyên; fuelNorm (văn phòng) = định mức riêng cho chuyến này.
   * Đủ km bắt đầu + kết thúc thì tính lít và chi phí xăng theo định mức.
   */
  async record(tripId: number, input: { startKm?: number | null; endKm?: number | null; fuelNorm?: number | null }) {
    const trip = await this.prisma.bookingTrip.findUnique({
      where: { id: tripId },
      select: { id: true, vehicleId: true, pickupTime: true, days: true, startKm: true, endKm: true, fuelNorm: true, vehicle: { select: { fuelNorm: true, vehicleType: { select: { fuelNorm: true } } } } },
    });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến');
    let startKm = input.startKm !== undefined ? input.startKm : trip.startKm;
    if (startKm === null || startKm === undefined) startKm = await this.previousEndKm(trip);
    const endKm = input.endKm !== undefined ? input.endKm : trip.endKm;
    if (endKm !== null && endKm !== undefined) {
      if (startKm === null || startKm === undefined) throw new BadRequestException('Chưa có km bắt đầu: nhập số km đồng hồ lúc bắt đầu chuyến');
      if (endKm < startKm) throw new BadRequestException(`Km kết thúc (${endKm.toLocaleString('vi-VN')}) nhỏ hơn km bắt đầu (${startKm.toLocaleString('vi-VN')})`);
      if (endKm - startKm > MAX_KM_PER_DAY * Math.max(1, trip.days)) throw new BadRequestException(`Quãng đường ${(endKm - startKm).toLocaleString('vi-VN')} km quá lớn, kiểm tra lại số km`);
    }

    const data: Prisma.BookingTripUncheckedUpdateInput = { startKm: startKm ?? null, endKm: endKm ?? null };
    if (startKm != null && endKm != null) {
      const cfg = await this.config();
      const norm =
        input.fuelNorm ??
        (trip.fuelNorm ? Number(trip.fuelNorm) : null) ??
        (trip.vehicle?.fuelNorm ? Number(trip.vehicle.fuelNorm) : null) ??
        (trip.vehicle?.vehicleType.fuelNorm ? Number(trip.vehicle.vehicleType.fuelNorm) : DEFAULT_FUEL_NORM);
      const liters = round2(((endKm - startKm) * norm) / 100);
      Object.assign(data, { fuelNorm: norm, fuelPrice: cfg.price, fuelLiters: liters, fuelCost: cfg.price ? Math.round(liters * cfg.price) : null });
    } else {
      Object.assign(data, { fuelLiters: null, fuelCost: null, ...(input.fuelNorm !== undefined && { fuelNorm: input.fuelNorm }) });
    }
    await this.prisma.bookingTrip.update({ where: { id: tripId }, data });

    if (endKm != null && trip.vehicleId) {
      // Số km hiện tại của xe
      await this.prisma.vehicle.updateMany({ where: { id: trip.vehicleId, OR: [{ odometerKm: null }, { odometerKm: { lt: endKm } }] }, data: { odometerKm: endKm } });
      // Sửa km kết thúc: chuyến kế tiếp đang lấy km cũ làm km bắt đầu thì cập nhật theo
      if (trip.endKm != null && trip.endKm !== endKm) {
        const next = await this.prisma.bookingTrip.findFirst({
          where: { vehicleId: trip.vehicleId, id: { not: trip.id }, startKm: trip.endKm, pickupTime: { gte: trip.pickupTime } },
          orderBy: { pickupTime: 'asc' },
          select: { id: true },
        });
        if (next) await this.record(next.id, { startKm: endKm }).catch(() => undefined);
      }
    }
    return data;
  }
}
