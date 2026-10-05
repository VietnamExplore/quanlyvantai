import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const [type, token] = (req.headers.authorization ?? '').split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('Chưa đăng nhập');

    let payload: { sub: number };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
    }

    // Đọc lại người dùng mỗi request để tài khoản bị khóa hoặc đổi quyền có hiệu lực ngay
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { driver: { select: { id: true } } },
    });
    if (!user || !user.isActive || user.deletedAt) throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị khóa');

    const authUser: AuthUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roles: user.roles,
      driverId: user.driver?.id ?? null,
      partnerId: user.partnerId ?? null,
    };
    req.user = authUser;

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (required?.length && !required.some((r) => user.roles.includes(r))) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }
    return true;
  }
}
