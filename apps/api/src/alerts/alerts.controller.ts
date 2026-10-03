import { Controller, Get, Query } from '@nestjs/common';
import { DriverStatus, Ownership, VehicleStatus } from '@prisma/client';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { addDays } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';

interface ExpiryAlert {
  kind: 'XE' | 'LAI_XE';
  id: number;
  name: string;
  document: string;
  expiry: Date;
  daysLeft: number;
}

const VEHICLE_DOCS = [
  ['registrationExpiry', 'Đăng kiểm'],
  ['insuranceExpiry', 'Bảo hiểm'],
  ['badgeExpiry', 'Phù hiệu'],
] as const;

const DRIVER_DOCS = [
  ['licenseExpiry', 'Bằng lái'],
  ['healthCheckExpiry', 'Khám sức khỏe'],
] as const;

@Controller('alerts')
@Roles(...OFFICE_ROLES)
export class AlertsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Giấy tờ của xe và lái xe công ty đã hết hạn hoặc sắp hết hạn trong `days` ngày tới. */
  @Get('expiring')
  async expiring(@Query('days') daysParam?: string) {
    const days = Number(daysParam) > 0 ? Number(daysParam) : 30;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const until = addDays(today, days);

    const [vehicles, drivers] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: {
          ownership: Ownership.CONG_TY,
          status: { not: VehicleStatus.NGUNG_HOAT_DONG },
          OR: VEHICLE_DOCS.map(([field]) => ({ [field]: { lte: until } })),
        },
      }),
      this.prisma.driver.findMany({
        where: {
          partnerId: null,
          status: { not: DriverStatus.NGHI_VIEC },
          OR: DRIVER_DOCS.map(([field]) => ({ [field]: { lte: until } })),
        },
      }),
    ]);

    const alerts: ExpiryAlert[] = [];
    const push = (kind: ExpiryAlert['kind'], id: number, name: string, document: string, expiry: Date | null) => {
      if (!expiry || expiry > until) return;
      const daysLeft = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
      alerts.push({ kind, id, name, document, expiry, daysLeft });
    };

    for (const v of vehicles) for (const [field, label] of VEHICLE_DOCS) push('XE', v.id, v.plateNumber, label, v[field]);
    for (const d of drivers) for (const [field, label] of DRIVER_DOCS) push('LAI_XE', d.id, d.fullName, label, d[field]);

    return alerts.sort((a, b) => a.daysLeft - b.daysLeft);
  }
}
