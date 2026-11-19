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
import { RateLimiterService } from './auth/rate-limiter.service';
import { RateLimitGuard } from './auth/rate-limit.guard';
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
import { WidgetService } from './widget/widget.service';
import { WidgetController } from './widget/widget.controller';
import { WidgetGuard } from './widget/widget.guard';
import { AutomationsService } from './automations/automations.service';
import { AutomationsController } from './automations/automations.controller';
import { AnalyticsService } from './analytics/analytics.service';
import { AnalyticsController } from './analytics/analytics.controller';
import { RealtimeModule } from './realtime/realtime.module';
import { WebhooksController } from './webhooks/webhooks.controller';
import { IngressDatabaseService } from './webhooks/ingress-database.service';
import { WebhookOutboxService } from './webhooks/webhook-outbox.service';
import { WhatsAppIngestionService } from './webhooks/whatsapp-ingestion.service';
import { InstagramIngestionService } from './webhooks/instagram-ingestion.service';
import { MetaSignatureGuard } from './webhooks/guards/meta-signature.guard';
import { AttachmentsService } from './attachments/attachments.service';
import { AttachmentsController } from './attachments/attachments.controller';
import { BillingService } from './billing/billing.service';
import { BillingController } from './billing/billing.controller';
import { KnowledgeService } from './knowledge/knowledge.service';
import { KnowledgeController } from './knowledge/knowledge.controller';
import { StripeIngestionService } from './webhooks/stripe-ingestion.service';
import { StripeSignatureGuard } from './webhooks/guards/stripe-signature.guard';

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
    WidgetController,
    AutomationsController,
    AnalyticsController,
    WebhooksController,
    AttachmentsController,
    BillingController,
    KnowledgeController,
  ],
  providers: [
    PrismaService,
    TokenService,
    AuthService,
    RateLimiterService,
    RateLimitGuard,
    JwtAuthGuard,
    WidgetGuard,
    MetaSignatureGuard,
    StripeSignatureGuard,
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
    WidgetService,
    AutomationsService,
    AnalyticsService,
    IngressDatabaseService,
    WebhookOutboxService,
    WhatsAppIngestionService,
    InstagramIngestionService,
    AttachmentsService,
    BillingService,
    StripeIngestionService,
    KnowledgeService,
  ],
  exports: [
    PrismaService,
    TokenService,
    AuthService,
    RateLimiterService,
    RateLimitGuard,
    TenantTransactionRunner,
    TenantGuard,
    CsrfGuard,
    ConversationsService,
    CustomersService,
    AiService,
    WidgetService,
    AutomationsService,
    AnalyticsService,
    IngressDatabaseService,
    WebhookOutboxService,
    WhatsAppIngestionService,
    InstagramIngestionService,
    AttachmentsService,
    BillingService,
    StripeIngestionService,
    KnowledgeService,
  ],
})
export class AppModule { }
