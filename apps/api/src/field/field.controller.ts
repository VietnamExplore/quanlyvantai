import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { AuthUser, CurrentUser, OFFICE_ROLES, Roles } from '../auth/auth.decorators';
import { AddPassengersDto, CreateIncidentDto, CreateVehicleCheckDto, DriverPassengerDto, HandleIncidentDto, SignoffDto } from './field.dto';
import { fieldUpload, FieldService } from './field.service';

const driverOf = (user: AuthUser) => {
  if (!user.driverId) throw new ForbiddenException('Tài khoản chưa được liên kết với hồ sơ lái xe. Liên hệ văn phòng.');
  return user.driverId;
};
const num = (v?: string) => (v ? Number(v) || undefined : undefined);

/** App lái xe: ký nhận điện tử, báo sự cố, nhận / trả xe */
@Controller('driver')
@Roles(Role.LAI_XE)
export class DriverFieldController {
  constructor(private readonly field: FieldService) {}

  @Post('trips/:id/signoff')
  @HttpCode(200)
  signoff(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SignoffDto) {
    return this.field.signoff(driverOf(user), user.id, id, dto);
  }

  /** Bổ sung hành khách khi đón (booking nhập chưa đủ): danh sách kèm hợp đồng, lệnh điều xe, lệnh vận chuyển cập nhật theo */
  @Post('trips/:id/passengers')
  @HttpCode(200)
  addPassengers(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AddPassengersDto) {
    return this.field.addPassengers(driverOf(user), user.id, id, dto);
  }

  @Post('passengers/:id')
  @HttpCode(200)
  updatePassenger(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: DriverPassengerDto) {
    return this.field.updatePassenger(driverOf(user), id, dto);
  }

  @Post('passengers/:id/delete')
  @HttpCode(200)
  removePassenger(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.field.removePassenger(driverOf(user), id);
  }

  @Get('incidents')
  incidents(@CurrentUser() user: AuthUser, @Query('tripId') tripId?: string) {
    return this.field.driverIncidents(driverOf(user), num(tripId));
  }

  @Post('incidents')
  createIncident(@CurrentUser() user: AuthUser, @Body() dto: CreateIncidentDto) {
    return this.field.createIncident(driverOf(user), user.id, dto);
  }

  @Post('incidents/:id/photos')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', fieldUpload))
  incidentPhoto(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Chưa chọn ảnh');
    return this.field.addIncidentPhoto(driverOf(user), id, file);
  }

  @Get('vehicle-checks')
  checks(@CurrentUser() user: AuthUser) {
    return this.field.driverChecks(driverOf(user));
  }

  @Post('vehicle-checks')
  createCheck(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleCheckDto) {
    return this.field.createCheck(driverOf(user), user.id, dto);
  }

  @Post('vehicle-checks/:id/photos')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', fieldUpload))
  checkPhoto(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Chưa chọn ảnh');
    return this.field.addCheckPhoto(driverOf(user), id, file);
  }

  @Post('vehicle-checks/:id/alcohol-photo')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', fieldUpload))
  alcoholPhoto(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Chưa chọn ảnh');
    return this.field.setAlcoholPhoto(driverOf(user), id, file);
  }

  @Get('field-photos/:name')
  photo(@CurrentUser() user: AuthUser, @Param('name') name: string, @Res() res: Response) {
    return this.field.sendPhoto(res, name, driverOf(user));
  }
}

/** Văn phòng: theo dõi sự cố, nhận / trả xe */
@Controller('field')
@Roles(...OFFICE_ROLES)
export class FieldController {
  constructor(private readonly field: FieldService) {}

  @Get('incidents')
  incidents(@Query() q: { status?: string; from?: string; to?: string; driverId?: string; vehicleId?: string; tripId?: string }) {
    return this.field.listIncidents({ ...q, driverId: num(q.driverId), vehicleId: num(q.vehicleId), tripId: num(q.tripId) });
  }

  @Get('incidents/open-count')
  async openCount() {
    return { count: await this.field.openIncidentCount() };
  }

  @Patch('incidents/:id')
  @Roles(Role.ADMIN, Role.DIEU_HANH)
  handle(@Param('id', ParseIntPipe) id: number, @Body() dto: HandleIncidentDto, @CurrentUser() user: AuthUser) {
    return this.field.handleIncident(id, dto, user.id);
  }

  @Get('vehicle-checks')
  checks(@Query() q: { from?: string; to?: string; driverId?: string; vehicleId?: string; defects?: string; alcohol?: string }) {
    return this.field.listChecks({ from: q.from, to: q.to, driverId: num(q.driverId), vehicleId: num(q.vehicleId), defects: q.defects === '1', alcohol: q.alcohol === '1' });
  }

  @Get('photos/:name')
  photo(@Param('name') name: string, @Res() res: Response) {
    return this.field.sendPhoto(res, name, null);
  }
}
