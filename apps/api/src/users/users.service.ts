import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { normalizePhone } from '../common/phone';
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
  partner: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(q?: string, role?: Role) {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        // Tài khoản hệ thống "Website công ty" (đứng tên booking lấy từ website) không hiện.
        // So khớp đúng tên: trong LIKE của SQL, "_" là ký tự đại diện nên startsWith('__') sẽ ẩn mọi người dùng
        username: { not: '__website__' },
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

  salesStaff() {
    return this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null, roles: { has: Role.KINH_DOANH } },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  findOne(id: number) {
    return this.prisma.user.findUniqueOrThrow({ where: { id }, select: userSelect });
  }

  /** Tên đăng nhập không phân biệt hoa thường: "HungLH" trùng "hunglh" */
  private async assertUsernameFree(username: string, exceptId?: number) {
    const dup = await this.prisma.user.findFirst({
      where: { username: { equals: username.trim(), mode: 'insensitive' }, deletedAt: null, ...(exceptId && { id: { not: exceptId } }) },
      select: { fullName: true },
    });
    if (dup) throw new BadRequestException(`Tên đăng nhập "${username.trim()}" đã được dùng cho ${dup.fullName}`);
  }

  /** Số điện thoại dùng để đăng nhập nên không được trùng giữa các tài khoản */
  private async assertPhoneFree(phone: string | null | undefined, exceptId?: number) {
    const p = normalizePhone(phone);
    if (p.length < 9) return;
    const others = await this.prisma.user.findMany({ where: { deletedAt: null, phone: { not: null }, ...(exceptId && { id: { not: exceptId } }) }, select: { phone: true, fullName: true, username: true } });
    const dup = others.find((u) => normalizePhone(u.phone) === p);
    if (dup) throw new BadRequestException(`Số điện thoại ${phone} đã đăng ký cho ${dup.fullName} (${dup.username}). Mỗi số chỉ dùng cho một tài khoản để đăng nhập.`);
  }

  /**
   * Xóa người dùng: chưa có dữ liệu thì xóa hẳn; đã tạo booking, phiếu thu chi, điều xe… thì
   * khóa + ẩn khỏi danh sách (giữ tên người tạo trên chứng từ cũ), giải phóng tên đăng nhập và SĐT.
   */
  async remove(id: number, currentUserId: number) {
    if (id === currentUserId) throw new BadRequestException('Không thể tự xóa tài khoản của chính mình');
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        username: true,
        roles: true,
        isActive: true,
        deletedAt: true,
        driver: { select: { id: true } },
        _count: {
          select: {
            customers: true,
            salesBookings: true,
            createdBookings: true,
            assignedTrips: true,
            tripCosts: true,
            payments: true,
            partnerPayments: true,
            cashVouchers: true,
            tripEvents: true,
            decidedAdvances: true,
          },
        },
      },
    });
    if (!u || u.deletedAt) throw new BadRequestException('Không tìm thấy người dùng');
    if (u.isActive && u.roles.includes(Role.ADMIN)) {
      const admins = await this.prisma.user.count({ where: { isActive: true, deletedAt: null, roles: { has: Role.ADMIN }, id: { not: id } } });
      if (!admins) throw new BadRequestException('Đây là Admin cuối cùng, không thể xóa');
    }
    const used = Object.values(u._count).some((n) => n > 0);
    if (!used) {
      await this.prisma.$transaction([
        this.prisma.driver.updateMany({ where: { userId: id }, data: { userId: null } }),
        this.prisma.user.delete({ where: { id } }),
      ]);
      return { deleted: true, kept: false };
    }
    await this.prisma.$transaction([
      this.prisma.driver.updateMany({ where: { userId: id }, data: { userId: null } }),
      this.prisma.user.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false, pushToken: null, phone: null, username: `${u.username}~xoa${id}` },
      }),
    ]);
    return { deleted: true, kept: true };
  }

  /** Tài khoản nhà xe phải chọn nhà xe; vai trò khác không gắn nhà xe */
  private checkPartnerLink(roles?: Role[], partnerId?: number | null) {
    if (!roles) return;
    if (roles.includes(Role.NHA_XE) && !partnerId) throw new BadRequestException('Tài khoản nhà xe phải chọn nhà xe đối tác');
    if (roles.includes(Role.NHA_XE) && roles.some((r) => r !== Role.NHA_XE)) {
      throw new BadRequestException('Tài khoản nhà xe không được kèm vai trò khác của văn phòng / lái xe');
    }
  }

  async create(dto: CreateUserDto) {
    const { password, driverId, ...data } = dto;
    this.checkPartnerLink(data.roles, data.partnerId);
    await this.assertUsernameFree(data.username);
    await this.assertPhoneFree(data.phone);
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
    if (data.roles) {
      const current = await this.prisma.user.findUnique({ where: { id }, select: { partnerId: true } });
      this.checkPartnerLink(data.roles, data.partnerId !== undefined ? data.partnerId : current?.partnerId);
      if (!data.roles.includes(Role.NHA_XE)) data.partnerId = null;
    }
    if (id === currentUserId && (dto.isActive === false || (dto.roles && !dto.roles.includes(Role.ADMIN)))) {
      throw new BadRequestException('Không thể tự khóa hoặc tự bỏ quyền Admin của chính mình');
    }
    // Luôn giữ ít nhất một Admin đang hoạt động
    if (dto.isActive === false || (dto.roles && !dto.roles.includes(Role.ADMIN))) {
      const target = await this.prisma.user.findUnique({ where: { id }, select: { roles: true, isActive: true } });
      if (target?.isActive && target.roles.includes(Role.ADMIN)) {
        const admins = await this.prisma.user.count({ where: { isActive: true, deletedAt: null, roles: { has: Role.ADMIN }, id: { not: id } } });
        if (!admins) throw new BadRequestException('Đây là Admin cuối cùng đang hoạt động, không thể khóa hoặc bỏ quyền Admin');
      }
    }
    if (data.username !== undefined) await this.assertUsernameFree(data.username, id);
    if (data.phone) await this.assertPhoneFree(data.phone, id);
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
