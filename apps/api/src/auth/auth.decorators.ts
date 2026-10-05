import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Bỏ qua kiểm tra đăng nhập (ví dụ: API đăng nhập). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Chỉ cho phép các vai trò được liệt kê. Đặt ở method sẽ ghi đè cấu hình ở class. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Các bộ phận làm việc trên web văn phòng. */
export const OFFICE_ROLES: Role[] = [Role.ADMIN, Role.DIEU_HANH, Role.KINH_DOANH, Role.KE_TOAN];

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  roles: Role[];
  driverId: number | null;
  /** Tài khoản nhà xe đối tác: nhà xe được liên kết */
  partnerId?: number | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
