import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { withDates } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverDto, DriverQueryDto, DriverSalaryDto, UpdateDriverDto } from './drivers.dto';

const DATE_FIELDS = ['licenseExpiry', 'healthCheckExpiry'] as const;

const driverInclude = {
  partner: { select: { id: true, name: true } },
  user: { select: { id: true, username: true, isActive: true } },
  defaultVehicles: { select: { id: true, plateNumber: true } },
} satisfies Prisma.DriverInclude;

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  findAll({ q, status, owner }: DriverQueryDto) {
    return this.prisma.driver.findMany({
      where: {
        status,
        ...(owner === 'company' && { partnerId: null }),
        ...(owner && owner !== 'company' && { partnerId: Number(owner) }),
        ...(q && {
          OR: [
            { fullName: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { licenseNumber: { contains: q } },
          ],
        }),
      },
      include: driverInclude,
      orderBy: [{ partnerId: { sort: 'asc', nulls: 'first' } }, { fullName: 'asc' }],
    });
  }

  findOne(id: number) {
    return this.prisma.driver.findUniqueOrThrow({ where: { id }, include: driverInclude });
  }

  create(dto: CreateDriverDto) {
    return this.prisma.driver.create({
      data: withDates(dto, [...DATE_FIELDS]) as Prisma.DriverUncheckedCreateInput,
      include: driverInclude,
    });
  }

  update(id: number, dto: UpdateDriverDto) {
    return this.prisma.driver.update({
      where: { id },
      data: withDates(dto, [...DATE_FIELDS]) as Prisma.DriverUncheckedUpdateInput,
      include: driverInclude,
    });
  }

  salaries(driverId: number) {
    return this.prisma.driverSalary.findMany({ where: { driverId }, orderBy: { effectiveFrom: 'desc' } });
  }

  /** Mức lương áp dụng cho tháng hiện tại của từng lái xe công ty (null = chưa cài) */
  async currentSalaries() {
    const monthStart = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).slice(0, 7)}-01T00:00:00Z`);
    const rows = await this.prisma.driverSalary.findMany({
      where: { effectiveFrom: { lte: monthStart }, driver: { partnerId: null } },
      orderBy: { effectiveFrom: 'desc' },
    });
    const byDriver: Record<number, (typeof rows)[number]> = {};
    for (const r of rows) byDriver[r.driverId] ??= r;
    return byDriver;
  }

  async setSalary(driverId: number, dto: DriverSalaryDto, userId: number) {
    const driver = await this.prisma.driver.findUniqueOrThrow({ where: { id: driverId } });
    if (driver.partnerId) throw new BadRequestException('Chỉ cài lương cho lái xe công ty');
    const effectiveFrom = new Date(`${dto.effectiveFrom}-01T00:00:00Z`);
    const data = { baseSalary: dto.baseSalary, commissionPercent: dto.commissionPercent, note: dto.note?.trim() || null };
    return this.prisma.driverSalary.upsert({
      where: { driverId_effectiveFrom: { driverId, effectiveFrom } },
      create: { driverId, effectiveFrom, createdById: userId, ...data },
      update: data,
    });
  }

  removeSalary(id: number) {
    return this.prisma.driverSalary.delete({ where: { id } });
  }

  remove(id: number) {
    return this.prisma.driver.delete({ where: { id } });
  }
}
