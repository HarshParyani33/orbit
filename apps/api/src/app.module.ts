import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { getConfig } from '@orbit/config';
import { PrismaService } from './prisma/prisma.service';
import { TokenService } from './auth/token.service';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { JwtAuthGuard } from './auth/auth.guard';
import { CsrfGuard } from './auth/csrf.guard';
import { TenantTransactionRunner } from './tenancy/tenant-transaction-runner';
import { TenantGuard } from './tenancy/tenant.guard';
import { OrganizationsService } from './organizations/organizations.service';
import { OrganizationsController } from './organizations/organizations.controller';
import { ChannelsService } from './channels/channels.service';
import { ChannelsController } from './channels/channels.controller';
import { ConversationsService } from './conversations/conversations.service';
import { ConversationsController } from './conversations/conversations.controller';
import { CustomersService } from './customers/customers.service';
import { CustomersController } from './customers/customers.controller';
import { AiService } from './ai/ai.service';
import { AiController } from './ai/ai.controller';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const config = getConfig();
        return {
          secret: config.JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        };
      },
    }),
    RealtimeModule,
  ],
  controllers: [
    AuthController,
    OrganizationsController,
    ChannelsController,
    ConversationsController,
    CustomersController,
    AiController,
  ],
  providers: [
    PrismaService,
    TokenService,
    AuthService,
    JwtAuthGuard,
    CsrfGuard,
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    TenantTransactionRunner,
    TenantGuard,
    OrganizationsService,
    ChannelsService,
    ConversationsService,
    CustomersService,
    AiService,
  ],
  exports: [
    PrismaService,
    TokenService,
    AuthService,
    TenantTransactionRunner,
    TenantGuard,
    CsrfGuard,
    ConversationsService,
    CustomersService,
    AiService,
  ],
})
export class AppModule { }
