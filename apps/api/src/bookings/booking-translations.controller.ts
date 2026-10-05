import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Prisma, Role, TripStatus } from '@prisma/client';
import { assertCanEditBooking } from './booking-access';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { OFFICE_ROLES, Roles, AuthUser, CurrentUser } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { TranslateService, type TargetLang } from '../translate/translate.service';

const LANGS = ['en', 'ko', 'zh', 'ja'] as const;
type Entry = { src: string; text: string };
type Translations = Partial<Record<TargetLang, Record<string, Entry>>>;

class TranslationEntryDto {
  @IsString() key: string;
  @IsString() @MaxLength(5000) text: string;
}

class SaveTranslationsDto {
  @IsIn(LANGS, { message: 'Ngôn ngữ không hợp lệ' }) lang: TargetLang;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranslationEntryDto)
  entries: TranslationEntryDto[];
}

class AutoTranslateDto {
  @IsIn(LANGS, { message: 'Ngôn ngữ không hợp lệ' }) lang: TargetLang;
  /** true = dịch lại toàn bộ; mặc định chỉ dịch mục chưa dịch hoặc câu gốc đã sửa (giữ bản đã sửa tay) */
  @IsOptional() @IsBoolean() force?: boolean;
}

/**
 * Bản dịch nội dung booking cho giấy tờ ngoại ngữ (điểm đón / trả, lịch trình, phụ thu, ghi chú, dòng phụ bảng đón).
 * Mỗi bản dịch lưu kèm câu gốc (src): khi câu tiếng Việt bị sửa, bản dịch cũ coi là "cần dịch lại" và giấy tờ in tiếng Việt.
 */
@Controller('bookings/:id/translations')
@Roles(...OFFICE_ROLES)
export class BookingTranslationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly translator: TranslateService,
  ) {}

  /** Các nội dung cần dịch của booking, theo thứ tự hiển thị */
  private async sources(id: number) {
    const b = await this.prisma.booking.findUniqueOrThrow({
      where: { id },
      select: {
        notes: true,
        signSubtitle: true,
        docTranslations: true,
        trips: { orderBy: { seq: 'asc' }, select: { id: true, status: true, pickupAddress: true, dropoffAddress: true, itinerary: true, surcharges: true } },
      },
    });
    const rows: { key: string; label: string; src: string }[] = [];
    const add = (key: string, label: string, src?: string | null) => src?.trim() && rows.push({ key, label, src: src.trim() });
    b.trips
      .filter((t) => t.status !== TripStatus.HUY)
      .forEach((t, i) => {
        const n = `Chuyến ${i + 1}`;
        add(`trip.${t.id}.pickupAddress`, `${n} – Điểm đón`, t.pickupAddress);
        add(`trip.${t.id}.dropoffAddress`, `${n} – Điểm trả`, t.dropoffAddress);
        add(`trip.${t.id}.itinerary`, `${n} – Lịch trình`, t.itinerary);
        const sc = (Array.isArray(t.surcharges) ? t.surcharges : []) as { name?: string }[];
        sc.forEach((s, k) => add(`trip.${t.id}.surcharge.${k}`, `${n} – Phụ thu`, s?.name));
      });
    add('notes', 'Ghi chú cho khách', b.notes);
    add('signSubtitle', 'Bảng đón – dòng phụ', b.signSubtitle);
    return { rows, saved: (b.docTranslations ?? {}) as Translations };
  }

  @Get()
  async list(@Param('id', ParseIntPipe) id: number, @Query('lang') lang: string) {
    if (!LANGS.includes(lang as TargetLang)) throw new BadRequestException('Ngôn ngữ không hợp lệ');
    const { rows, saved } = await this.sources(id);
    const map = saved[lang as TargetLang] ?? {};
    return rows.map((r) => {
      const e = map[r.key];
      return { ...r, text: e?.text ?? '', stale: !!e && e.src !== r.src };
    });
  }

  /** Lưu bản dịch nhân viên đã xem / sửa (gắn với câu gốc hiện tại) */
  @Put()
  @Roles(Role.ADMIN, Role.DIEU_HANH, Role.KINH_DOANH)
  async save(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveTranslationsDto, @CurrentUser() user: AuthUser) {
    await assertCanEditBooking(this.prisma, id, user);
    const { rows, saved } = await this.sources(id);
    const map: Record<string, Entry> = { ...(saved[dto.lang] ?? {}) };
    for (const e of dto.entries) {
      const row = rows.find((r) => r.key === e.key);
      if (!row) continue;
      if (e.text.trim()) map[e.key] = { src: row.src, text: e.text.trim() };
      else delete map[e.key];
    }
    await this.store(id, saved, dto.lang, map, rows);
    return this.list(id, dto.lang);
  }

  /** Dịch tự động toàn bộ nội dung sang một ngôn ngữ và lưu lại */
  @Post('auto')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.DIEU_HANH, Role.KINH_DOANH)
  async auto(@Param('id', ParseIntPipe) id: number, @Body() dto: AutoTranslateDto, @CurrentUser() user: AuthUser) {
    await assertCanEditBooking(this.prisma, id, user);
    const { rows, saved } = await this.sources(id);
    if (!rows.length) throw new BadRequestException('Booking chưa có nội dung tiếng Việt cần dịch');
    const map: Record<string, Entry> = { ...(saved[dto.lang] ?? {}) };
    const todo = dto.force ? rows : rows.filter((r) => map[r.key]?.src !== r.src || !map[r.key]?.text);
    if (todo.length) {
      const out = await this.translator.translate(
        todo.map((r) => r.src),
        dto.lang,
      );
      todo.forEach((r, i) => out[i]?.trim() && (map[r.key] = { src: r.src, text: out[i].trim() }));
    }
    await this.store(id, saved, dto.lang, map, rows);
    return this.list(id, dto.lang);
  }

  /** Ghi lại, bỏ các khóa không còn tồn tại (chuyến đã xóa…) */
  private async store(id: number, saved: Translations, lang: TargetLang, map: Record<string, Entry>, rows: { key: string }[]) {
    const keep = new Set(rows.map((r) => r.key));
    const clean = Object.fromEntries(Object.entries(map).filter(([k]) => keep.has(k)));
    await this.prisma.booking.update({ where: { id }, data: { docTranslations: { ...saved, [lang]: clean } as Prisma.InputJsonValue } });
  }
}
