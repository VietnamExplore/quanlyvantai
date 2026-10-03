import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let message = 'Lỗi cơ sở dữ liệu';

    if (e.code === 'P2002') {
      status = 409;
      const fields = (e.meta?.target as string[] | undefined)?.join(', ');
      message = `Dữ liệu bị trùng${fields ? `: ${fields}` : ''}`;
    } else if (e.code === 'P2003') {
      status = 409;
      message = 'Không thể xóa hoặc sửa vì dữ liệu đang được dùng ở nơi khác';
    } else if (e.code === 'P2025') {
      status = 404;
      message = 'Không tìm thấy dữ liệu';
    }

    res.status(status).json({ statusCode: status, message });
  }
}
