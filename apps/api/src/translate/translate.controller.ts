import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, Post } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsIn, IsString, MaxLength } from 'class-validator';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { TranslateService, type TargetLang } from './translate.service';
import { UiTranslateService } from './ui-translate.service';

const UI_LANGS = ['en', 'ko', 'zh', 'ja'];

class UiTranslateDto {
  @IsArray()
  @ArrayMaxSize(200, { message: 'Tối đa 200 câu mỗi lần dịch' })
  @IsString({ each: true })
  @MaxLength(2000, { each: true, message: 'Mỗi câu tối đa 2000 ký tự' })
  texts: string[];
}

class TranslateDto {
  @IsArray()
  @ArrayMaxSize(60, { message: 'Tối đa 60 đoạn mỗi lần dịch' })
  @IsString({ each: true })
  @MaxLength(5000, { each: true, message: 'Mỗi đoạn tối đa 5000 ký tự' })
  texts: string[];

  @IsIn(['en', 'ko', 'zh', 'ja'], { message: 'Ngôn ngữ đích không hợp lệ' })
  target: TargetLang;
}

/** Dịch tự động tiếng Việt → Anh / Hàn / Trung / Nhật cho giấy tờ gửi khách */
@Controller('translate')
@Roles(...OFFICE_ROLES)
export class TranslateController {
  constructor(
    private readonly translator: TranslateService,
    private readonly ui: UiTranslateService,
  ) {}

  @Post()
  @HttpCode(200)
  async translate(@Body() dto: TranslateDto) {
    return { translations: await this.translator.translate(dto.texts, dto.target) };
  }

  // ───── Dịch giao diện phần mềm (mọi người dùng văn phòng) ─────

  /** Toàn bộ bản dịch giao diện đã lưu của một ngôn ngữ */
  @Get('ui/:lang')
  uiDictionary(@Param('lang', new ParseEnumPipe(UI_LANGS)) lang: TargetLang) {
    return this.ui.dictionary(lang);
  }

  /** Dịch các câu còn thiếu (đã có thì trả ngay từ bản lưu) */
  @Post('ui/:lang')
  @HttpCode(200)
  uiTranslate(@Param('lang', new ParseEnumPipe(UI_LANGS)) lang: TargetLang, @Body() dto: UiTranslateDto) {
    return this.ui.translate(lang, dto.texts);
  }
}
