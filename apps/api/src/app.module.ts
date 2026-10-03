import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { BookingsModule } from './bookings/bookings.module';
import { DispatchModule } from './dispatch/dispatch.module';
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
    DriversModule,
    PartnersModule,
    CustomersModule,
    LocationsModule,
    AlertsModule,
    PricingModule,
    SettingsModule,
    BookingsModule,
    ReportsModule,
    DispatchModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
