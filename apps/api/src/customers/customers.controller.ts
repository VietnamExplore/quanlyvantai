import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, CustomerQueryDto, UpdateCustomerDto } from './customers.dto';

const customerInclude = {
  salesUser: { select: { id: true, fullName: true } },
} satisfies Prisma.CustomerInclude;

@Controller('customers')
@Roles(...OFFICE_ROLES)
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll(@Query() { q, type, salesUserId }: CustomerQueryDto) {
    return this.prisma.customer.findMany({
      where: {
        type,
        salesUserId,
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { email: { contains: q, mode: 'insensitive' } },
            { taxCode: { contains: q } },
          ],
        }),
      },
      include: customerInclude,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.customer.findUniqueOrThrow({ where: { id }, include: customerInclude });
  }

  @Post()
  @Roles(Role.ADMIN, Role.KINH_DOANH)
  create(@Body() dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: dto, include: customerInclude });
  }

  // Không xóa khách hàng: dùng isActive = false để giữ lịch sử booking và công nợ
  @Patch(':id')
  @Roles(Role.ADMIN, Role.KINH_DOANH)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomerDto) {
    return this.prisma.customer.update({ where: { id }, data: dto, include: customerInclude });
  }
}
