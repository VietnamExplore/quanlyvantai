import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

/** Các khóa cài đặt được phép lưu */
export const SETTING_KEYS = [
  'companyName',
  'companyAddress',
  'companyPhone',
  'companyEmail',
  'companyTaxCode',
  'bankInfo',
  'quoteFooter',
] as const;

@Controller('settings')
@Roles(...OFFICE_ROLES)
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    const rows = await this.prisma.setting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  @Put()
  @Roles(Role.ADMIN)
  async save(@Body() body: Record<string, unknown>) {
    const entries = Object.entries(body).filter(([k]) => (SETTING_KEYS as readonly string[]).includes(k));
    if (entries.some(([, v]) => typeof v !== 'string')) throw new BadRequestException('Giá trị cài đặt phải là chữ');
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.setting.upsert({ where: { key }, update: { value: value as string }, create: { key, value: value as string } }),
      ),
    );
    return this.get();
  }
}
