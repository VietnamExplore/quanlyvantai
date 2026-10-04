import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsIn, IsString, MaxLength } from 'class-validator';
import { OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { TranslateService, type TargetLang } from './translate.service';

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
  constructor(private readonly translator: TranslateService) {}

  @Post()
  @HttpCode(200)
  async translate(@Body() dto: TranslateDto) {
    return { translations: await this.translator.translate(dto.texts, dto.target) };
  }
}
