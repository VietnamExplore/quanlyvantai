import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { AuthUser, CurrentUser, OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { GpsService } from './gps.service';

class GpsPointDto {
  @IsNumber() lat: number;
  @IsNumber() lng: number;
  @IsOptional() @IsNumber() speed?: number | null;
  @IsOptional() @IsNumber() heading?: number | null;
  @IsOptional() @IsNumber() accuracy?: number | null;
  /** Thời điểm (mili giây) */
  @IsNumber() at: number;
}

class GpsBatchDto {
  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => GpsPointDto) points: GpsPointDto[];
}

class SeenDto {
  @IsArray() @IsInt({ each: true }) ids: number[];
}

const num = (v?: string) => (v ? Number(v) || undefined : undefined);

/** App lái xe gửi vị trí khi chuyến đang chạy */
@Controller('driver')
@Roles(Role.LAI_XE)
export class DriverGpsController {
  constructor(private readonly gps: GpsService) {}

  @Post('gps')
  @HttpCode(200)
  ingest(@CurrentUser() user: AuthUser, @Body() dto: GpsBatchDto) {
    if (!user.driverId) throw new ForbiddenException('Tài khoản chưa liên kết hồ sơ lái xe');
    return this.gps.ingest(user.driverId, dto.points);
  }
}

/** Văn phòng: giám sát hành trình */
@Controller('gps')
@Roles(...OFFICE_ROLES)
export class GpsController {
  constructor(private readonly gps: GpsService) {}

  @Get('live')
  live(@Query('hours') hours?: string) {
    return this.gps.live(Math.min(72, num(hours) ?? 12));
  }

  @Get('track')
  track(@Query() q: { tripId?: string; driverId?: string; vehicleId?: string; date?: string }) {
    return this.gps.track({ tripId: num(q.tripId), driverId: num(q.driverId), vehicleId: num(q.vehicleId), date: q.date });
  }

  @Get('alerts')
  alerts(@Query('days') days?: string, @Query('unseen') unseen?: string) {
    return this.gps.alerts({ days: Math.min(90, num(days) ?? 7), unseen: unseen === '1' });
  }

  @Get('alerts/unseen-count')
  async unseen() {
    return { count: await this.gps.unseenCount() };
  }

  @Post('alerts/seen')
  @HttpCode(200)
  seen(@Body() dto: SeenDto, @CurrentUser() user: AuthUser) {
    return this.gps.markSeen(dto.ids, user.fullName);
  }
}
