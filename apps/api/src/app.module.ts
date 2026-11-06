import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma/prisma.service';
import { TokenService } from './auth/token.service';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { JwtAuthGuard } from './auth/auth.guard';
import { TenantTransactionRunner } from './tenancy/tenant-transaction-runner';
import { TenantGuard } from './tenancy/tenant.guard';
import { OrganizationsService } from './organizations/organizations.service';
import { OrganizationsController } from './organizations/organizations.controller';
import { ChannelsService } from './channels/channels.service';
import { ChannelsController } from './channels/channels.controller';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev_jwt_secret_key_minimum_32_characters_for_security_testing',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [
    AuthController,
    OrganizationsController,
    ChannelsController,
  ],
  providers: [
    PrismaService,
    TokenService,
    AuthService,
    JwtAuthGuard,
    TenantTransactionRunner,
    TenantGuard,
    OrganizationsService,
    ChannelsService,
  ],
  exports: [
    PrismaService,
    TokenService,
    AuthService,
    TenantTransactionRunner,
    TenantGuard,
  ],
})
export class AppModule {}
