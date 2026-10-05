import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth.decorators';
import { ChangePasswordDto, LoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Tìm tài khoản theo tên đăng nhập (không phân biệt hoa thường), không có thì theo số điện thoại đã đăng ký */
  private async findLoginUser(login: string) {
    const include = { driver: { select: { id: true } } };
    const name = login.trim();
    const byName =
      (await this.prisma.user.findUnique({ where: { username: name }, include })) ??
      (await this.prisma.user.findFirst({ where: { username: { equals: name, mode: 'insensitive' }, deletedAt: null }, include }));
    if (byName) return byName;
    const phone = normalizePhone(name);
    if (phone.length < 9) return null;
    const candidates = await this.prisma.user.findMany({ where: { isActive: true, deletedAt: null, phone: { not: null } }, include });
    const matched = candidates.filter((u) => normalizePhone(u.phone) === phone);
    if (matched.length > 1) throw new UnauthorizedException('Số điện thoại này dùng cho nhiều tài khoản, hãy đăng nhập bằng tên đăng nhập');
    return matched[0] ?? null;
  }

  async login(dto: LoginDto) {
    const user = await this.findLoginUser(dto.username);
    const ok = user && user.isActive && !user.deletedAt && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!ok) throw new UnauthorizedException('Sai tên đăng nhập / số điện thoại hoặc mật khẩu');

    const accessToken = await this.jwt.signAsync({ sub: user.id });
    const authUser: AuthUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roles: user.roles,
      driverId: user.driver?.id ?? null,
    };
    return { accessToken, user: authUser };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
    });
    return { message: 'Đã đổi mật khẩu' };
  }
}
