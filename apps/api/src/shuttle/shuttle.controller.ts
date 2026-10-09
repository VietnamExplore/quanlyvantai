import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, OFFICE_ROLES, Roles, type AuthUser } from '../auth/auth.decorators';
import { AssignRunDto, CreateRunDto, RunProgressDto, RunQueryDto, ShuttleRouteDto, UpdateRunDto } from './shuttle.dto';
import { ShuttleService } from './shuttle.service';

const DISPATCHERS = [Role.ADMIN, Role.DIEU_HANH];

/** Xe ghép (shuttle bus): tuyến, giờ chạy, chuyến ghép, điều xe cả chuyến */
@Controller('shuttle')
@Roles(...OFFICE_ROLES)
export class ShuttleController {
  constructor(private readonly shuttle: ShuttleService) {}

  /** Tuyến đang dùng (nhập booking); ?all=1 gồm cả tuyến ngừng (trang danh mục) */
  @Get('routes')
  routes(@Query('all') all?: string) {
    return this.shuttle.routes(all === '1');
  }

  @Post('routes')
  @Roles(...DISPATCHERS)
  createRoute(@Body() dto: ShuttleRouteDto) {
    return this.shuttle.createRoute(dto);
  }

  @Put('routes/:id')
  @Roles(...DISPATCHERS)
  updateRoute(@Param('id', ParseIntPipe) id: number, @Body() dto: ShuttleRouteDto) {
    return this.shuttle.updateRoute(id, dto);
  }

  @Delete('routes/:id')
  @Roles(...DISPATCHERS)
  removeRoute(@Param('id', ParseIntPipe) id: number) {
    return this.shuttle.removeRoute(id);
  }

  /** Chuyến trong ngày / khoảng ngày (tự tạo chuyến theo lịch cố định) */
  @Get('runs')
  runs(@Query() q: RunQueryDto) {
    return this.shuttle.listRuns(q);
  }

  @Get('runs/:id')
  run(@Param('id', ParseIntPipe) id: number) {
    return this.shuttle.getRun(id);
  }

  @Post('runs')
  @Roles(...DISPATCHERS)
  createRun(@Body() dto: CreateRunDto) {
    return this.shuttle.createRun(dto);
  }

  @Patch('runs/:id')
  @Roles(...DISPATCHERS)
  updateRun(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRunDto) {
    return this.shuttle.updateRun(id, dto);
  }

  @Post('runs/:id/assign')
  @HttpCode(200)
  @Roles(...DISPATCHERS)
  assign(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignRunDto, @CurrentUser() user: AuthUser) {
    return this.shuttle.assign(id, dto, user);
  }

  @Post('runs/:id/unassign')
  @HttpCode(200)
  @Roles(...DISPATCHERS)
  unassign(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.shuttle.unassign(id, user);
  }

  @Post('runs/:id/progress')
  @HttpCode(200)
  @Roles(...DISPATCHERS)
  progress(@Param('id', ParseIntPipe) id: number, @Body() dto: RunProgressDto, @CurrentUser() user: AuthUser) {
    return this.shuttle.progress(id, dto, user);
  }
}
