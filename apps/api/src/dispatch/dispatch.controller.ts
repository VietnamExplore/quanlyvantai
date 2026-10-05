import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { AssignDto, CheckDto, DispatchQueryDto, PartnerCostDto, TripStatusDto } from './dispatch.dto';
import { DispatchService } from './dispatch.service';

const DISPATCHERS = [Role.ADMIN, Role.DIEU_HANH];

@Controller('dispatch')
@Roles(...OFFICE_ROLES)
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get('schedule')
  schedule(@Query('from') from?: string, @Query('to') to?: string) {
    return this.dispatch.schedule(from, to);
  }

  @Get('trips')
  trips(@Query() query: DispatchQueryDto) {
    return this.dispatch.listTrips(query);
  }

  @Get('trips/:id')
  trip(@Param('id', ParseIntPipe) id: number) {
    return this.dispatch.getTrip(id);
  }

  @Get('trips/:id/options')
  @Roles(...DISPATCHERS)
  options(@Param('id', ParseIntPipe) id: number) {
    return this.dispatch.options(id);
  }

  @Post('trips/:id/check')
  @HttpCode(200)
  @Roles(...DISPATCHERS)
  check(@Param('id', ParseIntPipe) id: number, @Body() dto: CheckDto) {
    return this.dispatch.check(id, dto.vehicleId, dto.driverId);
  }

  @Post('trips/:id/assign')
  @HttpCode(200)
  @Roles(...DISPATCHERS)
  assign(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignDto, @CurrentUser() user: AuthUser) {
    return this.dispatch.assign(id, dto, user);
  }

  /** Điều chỉnh giá nhà xe (đón trễ, không đón khách, phát sinh…): được cả khi chuyến / booking đã hoàn thành */
  @Post('trips/:id/partner-cost')
  @HttpCode(200)
  @Roles(...DISPATCHERS)
  partnerCost(@Param('id', ParseIntPipe) id: number, @Body() dto: PartnerCostDto, @CurrentUser() user: AuthUser) {
    return this.dispatch.adjustPartnerCost(id, dto, user);
  }

  @Post('trips/:id/unassign')
  @HttpCode(200)
  @Roles(...DISPATCHERS)
  unassign(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.dispatch.unassign(id, user);
  }

  @Post('trips/:id/status')
  @HttpCode(200)
  @Roles(...DISPATCHERS)
  status(@Param('id', ParseIntPipe) id: number, @Body() dto: TripStatusDto, @CurrentUser() user: AuthUser) {
    return this.dispatch.updateStatus(id, dto, user);
  }
}
