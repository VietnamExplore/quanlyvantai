import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';

const userSelect = {
  id: true,
  username: true,
  fullName: true,
  phone: true,
  email: true,
  roles: true,
  isActive: true,
  createdAt: true,
  driver: { select: { id: true, fullName: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(q?: string, role?: Role) {
    return this.prisma.user.findMany({
      where: {
        ...(role && { roles: { has: role } }),
        ...(q && {
          OR: [
            { username: { contains: q, mode: 'insensitive' } },
            { fullName: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
        }),
      },
      select: userSelect,
      orderBy: { id: 'asc' },
    });
  }

  findOne(id: number) {
    return this.prisma.user.findUniqueOrThrow({ where: { id }, select: userSelect });
  }

  async create(dto: CreateUserDto) {
    const { password, driverId, ...data } = dto;
    return this.prisma.user.create({
      data: {
        ...data,
        username: data.username.trim(),
        passwordHash: await bcrypt.hash(password, 10),
        ...(driverId && { driver: { connect: { id: driverId } } }),
      },
      select: userSelect,
    });
  }

  async update(id: number, dto: UpdateUserDto, currentUserId: number) {
    const { password, driverId, ...data } = dto;
    if (id === currentUserId && (dto.isActive === false || (dto.roles && !dto.roles.includes(Role.ADMIN)))) {
      throw new BadRequestException('Không thể tự khóa hoặc tự bỏ quyền Admin của chính mình');
    }
    return this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        ...(password && { passwordHash: await bcrypt.hash(password, 10) }),
        ...(driverId !== undefined && {
          driver: driverId === null ? { disconnect: true } : { connect: { id: driverId } },
        }),
      },
      select: userSelect,
    });
  }
}
