import { BadRequestException, Injectable } from '@nestjs/common';
import { Ownership, Prisma } from '@prisma/client';
import { withDates } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto, UpdateVehicleDto, VehicleQueryDto } from './vehicles.dto';

const DATE_FIELDS = ['registrationExpiry', 'insuranceExpiry', 'badgeExpiry'] as const;

const vehicleInclude = {
  vehicleType: { select: { id: true, code: true, name: true, seats: true } },
  partner: { select: { id: true, name: true } },
  defaultDriver: { select: { id: true, fullName: true, phone: true } },
} satisfies Prisma.VehicleInclude;

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: VehicleQueryDto) {
    const { q, ...filters } = query;
    return this.prisma.vehicle.findMany({
      where: {
        ...filters,
        ...(q && {
          OR: [
            { plateNumber: { contains: q, mode: 'insensitive' } },
            { brand: { contains: q, mode: 'insensitive' } },
            { model: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      include: vehicleInclude,
      orderBy: [{ ownership: 'asc' }, { vehicleType: { seats: 'asc' } }, { plateNumber: 'asc' }],
    });
  }

  findOne(id: number) {
    return this.prisma.vehicle.findUniqueOrThrow({ where: { id }, include: vehicleInclude });
  }

  create(dto: CreateVehicleDto) {
    this.checkOwnership(dto.ownership, dto.partnerId);
    const data = withDates(dto, [...DATE_FIELDS]);
    if (data.ownership === Ownership.CONG_TY) data.partnerId = null;
    return this.prisma.vehicle.create({ data: data as Prisma.VehicleUncheckedCreateInput, include: vehicleInclude });
  }

  async update(id: number, dto: UpdateVehicleDto) {
    const current = await this.prisma.vehicle.findUniqueOrThrow({ where: { id } });
    const ownership = dto.ownership ?? current.ownership;
    const partnerId = dto.partnerId !== undefined ? dto.partnerId : current.partnerId;
    this.checkOwnership(ownership, partnerId);

    const data = withDates(dto, [...DATE_FIELDS]);
    if (ownership === Ownership.CONG_TY) data.partnerId = null;
    return this.prisma.vehicle.update({
      where: { id },
      data: data as Prisma.VehicleUncheckedUpdateInput,
      include: vehicleInclude,
    });
  }

  remove(id: number) {
    return this.prisma.vehicle.delete({ where: { id } });
  }

  private checkOwnership(ownership: Ownership, partnerId?: number | null) {
    if (ownership === Ownership.DOI_TAC && !partnerId) {
      throw new BadRequestException('Xe đối tác phải chọn nhà xe đối tác');
    }
  }
}
