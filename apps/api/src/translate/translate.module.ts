import { Module } from '@nestjs/common';
import { TranslateController } from './translate.controller';
import { TranslateService } from './translate.service';
import { UiTranslateService } from './ui-translate.service';

@Module({
  controllers: [TranslateController],
  providers: [TranslateService, UiTranslateService],
  exports: [TranslateService],
})
export class TranslateModule {}
