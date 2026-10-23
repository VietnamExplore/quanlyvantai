import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';

class WebPushKeysDto {
  @IsString() @IsNotEmpty() @MaxLength(200) p256dh: string;
  @IsString() @IsNotEmpty() @MaxLength(100) auth: string;
}

/** Đăng ký nhận thông báo của trình duyệt (PushSubscription.toJSON()) – app lái xe bản web và web văn phòng / nhà xe */
export class WebPushSubscribeDto {
  @IsUrl({ protocols: ['https'], require_tld: true }, { message: 'Địa chỉ nhận thông báo không hợp lệ' }) @MaxLength(1000) endpoint: string;
  @ValidateNested() @Type(() => WebPushKeysDto) keys: WebPushKeysDto;
}
