import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { withDates } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverDto, DriverQueryDto, UpdateDriverDto } from './drivers.dto';

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

  remove(id: number) {
    return this.prisma.driver.delete({ where: { id } });
  }
}
