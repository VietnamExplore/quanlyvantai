import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AdvancesModule } from './advances/advances.module';
import { AuditModule } from './audit/audit.module';
import { PartnerPortalModule } from './partner-portal/partner-portal.module';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { BookingsModule } from './bookings/bookings.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { DriverAppModule } from './driver-app/driver-app.module';
import { PushModule } from './push/push.module';
import { ServicesModule } from './services/services.module';
import { CustomerSourcesModule } from './customer-sources/customer-sources.module';
import { CustomerTypesModule } from './customer-types/customer-types.module';
import { ContractsModule } from './contracts/contracts.module';
import { FieldModule } from './field/field.module';
import { TranslateModule } from './translate/translate.module';
import { FinanceModule } from './finance/finance.module';
import { PricingModule } from './pricing/pricing.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { CustomersModule } from './customers/customers.module';
import { DriversModule } from './drivers/drivers.module';
import { LocationsModule } from './locations/locations.module';
import { PartnersModule } from './partners/partners.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { VehicleTypesModule } from './vehicle-types/vehicle-types.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { SystemModule } from './system/system.module';
import { ShuttleModule } from './shuttle/shuttle.module';
import { WebsiteModule } from './website/website.module';
import { TollsModule } from './tolls/tolls.module';
import { AppReleaseModule } from './app-release/app-release.module';
import { OtaModule } from './ota/ota.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: Number(config.get('JWT_EXPIRES_IN_SECONDS', 604800)) },
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    VehicleTypesModule,
    VehiclesModule,
    SystemModule,
    ShuttleModule,
    WebsiteModule,
    TollsModule,
    AppReleaseModule,
    OtaModule,
    DriversModule,
    PartnersModule,
    CustomersModule,
    LocationsModule,
    AlertsModule,
    AdvancesModule,
    AuditModule,
    PartnerPortalModule,
    PricingModule,
    SettingsModule,
    BookingsModule,
    ReportsModule,
    DispatchModule,
    PushModule,
    DriverAppModule,
    ServicesModule,
    CustomerSourcesModule,
    CustomerTypesModule,
    ContractsModule,
    FieldModule,
    TranslateModule,
    FinanceModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
