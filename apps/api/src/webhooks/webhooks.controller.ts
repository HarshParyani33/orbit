import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { getConfig } from '@orbit/config';
import { IngressDatabaseService } from './ingress-database.service';
import { WebhookOutboxService } from './webhook-outbox.service';
import { WhatsAppIngestionService } from './whatsapp-ingestion.service';
import { InstagramIngestionService } from './instagram-ingestion.service';
import { StripeIngestionService } from './stripe-ingestion.service';
import { MetaSignatureGuard } from './guards/meta-signature.guard';
import { StripeSignatureGuard } from './guards/stripe-signature.guard';
import { Optional, Inject } from '@nestjs/common';
import * as crypto from 'crypto';

@Controller('api/webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    @Inject(IngressDatabaseService) private readonly ingressDb: IngressDatabaseService,
    @Inject(WebhookOutboxService) private readonly outboxService: WebhookOutboxService,
    @Optional() @Inject(WhatsAppIngestionService) private readonly whatsAppIngestion?: WhatsAppIngestionService,
    @Optional() @Inject(InstagramIngestionService) private readonly instagramIngestion?: InstagramIngestionService,
    @Optional() @Inject(StripeIngestionService) private readonly stripeIngestion?: StripeIngestionService
  ) {}

  /**
   * Meta WhatsApp Cloud API Webhook Subscription Verification (Challenge Handshake).
   * Responds with the hub.challenge integer/string if hub.verify_token matches.
   */
  @Get('whatsapp')
  verifyWhatsAppWebhook(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string
  ): string {
    return this.handleMetaChallengeHandshake(mode, verifyToken, challenge);
  }

  /**
   * Meta Instagram Messaging Webhook Subscription Verification (Challenge Handshake).
   */
  @Get('instagram')
  verifyInstagramWebhook(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string
  ): string {
    return this.handleMetaChallengeHandshake(mode, verifyToken, challenge);
  }

  /**
   * Inbound WhatsApp Cloud API Webhook Ingress.
   * Guarded by HMAC-SHA256 signature verification.
   * Resolves tenant routing using orbit_ingress role and persists to transactional outbox.
   */
  @Post('whatsapp')
  @UseGuards(MetaSignatureGuard)
  @HttpCode(HttpStatus.OK)
  async handleWhatsAppWebhook(@Body() payload: any): Promise<{ status: string; received: boolean }> {
    // 1. Extract external account identifier (WhatsApp Phone Number ID)
    const phoneNumberId =
      payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ||
      payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number;

    if (!phoneNumberId) {
      this.logger.warn('Inbound WhatsApp webhook missing phone_number_id metadata');
      throw new BadRequestException('Missing WhatsApp phone_number_id in webhook payload');
    }

    // 2. Resolve Channel & Organization routing via orbit_ingress role
    const routing = await this.ingressDb.resolveChannelRouting('META_WHATSAPP', String(phoneNumberId));

    if (!routing || routing.status !== 'ACTIVE') {
      this.logger.warn(
        `No active channel routing resolved for WhatsApp phone_number_id=${phoneNumberId}`
      );
      throw new NotFoundException('No active channel found for WhatsApp phone_number_id');
    }

    const { channel_id: channelId, organization_id: organizationId } = routing;

    // 3. Extract messages and status items
    const messages = payload?.entry?.[0]?.changes?.[0]?.value?.messages || [];
    const statuses = payload?.entry?.[0]?.changes?.[0]?.value?.statuses || [];

    if (messages.length > 0) {
      let hasNewMessages = false;
      for (const msg of messages) {
        const idempotencyKey = msg.id || `wamid_${crypto.randomUUID()}`;
        const { event, isDuplicate } = await this.outboxService.recordEvent(
          organizationId,
          channelId,
          'META_WHATSAPP',
          idempotencyKey,
          { ...payload, currentMessage: msg }
        );
        // Immediate dispatch acknowledgement
        await this.outboxService.markDispatched(organizationId, event.id, event.dispatchToken);
        if (!isDuplicate) {
          hasNewMessages = true;
        }
      }

      // Ingest into Customer CRM & Conversation thread if new messages and ingestion service available
      if (hasNewMessages && this.whatsAppIngestion) {
        await this.whatsAppIngestion.ingestInboundMessage(organizationId, channelId, payload);
      }
    } else if (statuses.length > 0) {
      for (const status of statuses) {
        const idempotencyKey = `${status.id || 'status'}_${status.status || 'unknown'}`;
        const { event } = await this.outboxService.recordEvent(
          organizationId,
          channelId,
          'META_WHATSAPP',
          idempotencyKey,
          { ...payload, currentStatus: status }
        );
        await this.outboxService.markDispatched(organizationId, event.id, event.dispatchToken);
      }
    } else {
      // General non-message webhook event (e.g. system notification)
      const idempotencyKey = `wh_${crypto.randomUUID()}`;
      const { event } = await this.outboxService.recordEvent(
        organizationId,
        channelId,
        'META_WHATSAPP',
        idempotencyKey,
        payload
      );
      await this.outboxService.markDispatched(organizationId, event.id, event.dispatchToken);
    }

    return { status: 'success', received: true };
  }

  /**
   * Inbound Instagram Messaging Webhook Ingress.
   * Guarded by HMAC-SHA256 signature verification.
   */
  @Post('instagram')
  @UseGuards(MetaSignatureGuard)
  @HttpCode(HttpStatus.OK)
  async handleInstagramWebhook(@Body() payload: any): Promise<{ status: string; received: boolean }> {
    // 1. Extract external account identifier (Instagram Account ID / Page ID)
    const accountId =
      payload?.entry?.[0]?.id ||
      payload?.entry?.[0]?.messaging?.[0]?.recipient?.id;

    if (!accountId) {
      this.logger.warn('Inbound Instagram webhook missing account ID');
      throw new BadRequestException('Missing Instagram account ID in webhook payload');
    }

    // 2. Resolve Channel & Organization routing via orbit_ingress role
    const routing = await this.ingressDb.resolveChannelRouting('META_INSTAGRAM', String(accountId));

    if (!routing || routing.status !== 'ACTIVE') {
      this.logger.warn(`No active channel routing resolved for Instagram accountId=${accountId}`);
      throw new NotFoundException('No active channel found for Instagram account ID');
    }

    const { channel_id: channelId, organization_id: organizationId } = routing;

    // 3. Extract messaging entries
    const messagingEntries = payload?.entry?.[0]?.messaging || [];

    if (messagingEntries.length > 0) {
      let hasNewMessages = false;
      for (const entry of messagingEntries) {
        const idempotencyKey = entry.message?.mid || `mid_${crypto.randomUUID()}`;
        const { event, isDuplicate } = await this.outboxService.recordEvent(
          organizationId,
          channelId,
          'META_INSTAGRAM',
          idempotencyKey,
          { ...payload, currentMessaging: entry }
        );
        await this.outboxService.markDispatched(organizationId, event.id, event.dispatchToken);
        if (!isDuplicate) {
          hasNewMessages = true;
        }
      }

      // Ingest into Customer CRM & Conversation thread if new messages and ingestion service available
      if (hasNewMessages && this.instagramIngestion) {
        await this.instagramIngestion.ingestInboundMessage(organizationId, channelId, payload);
      }
    } else {
      const idempotencyKey = `ig_${crypto.randomUUID()}`;
      const { event } = await this.outboxService.recordEvent(
        organizationId,
        channelId,
        'META_INSTAGRAM',
        idempotencyKey,
        payload
      );
      await this.outboxService.markDispatched(organizationId, event.id, event.dispatchToken);
    }

    return { status: 'success', received: true };
  }

  /**
   * Stripe Webhook Ingestion Endpoint.
   * Cryptographically authenticated via StripeSignatureGuard.
   */
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StripeSignatureGuard)
  async handleStripeWebhook(@Body() payload: any) {
    if (!this.stripeIngestion) {
      this.logger.warn('StripeIngestionService is unconfigured');
      return { status: 'skipped', received: true };
    }

    const result = await this.stripeIngestion.handleStripeEvent(payload);
    return { status: 'success', ...result };
  }

  /**
   * Common handler for Meta's GET challenge handshake.
   */
  private handleMetaChallengeHandshake(
    mode?: string,
    verifyToken?: string,
    challenge?: string
  ): string {
    const config = getConfig();
    const expectedToken = config.META_WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && verifyToken && verifyToken === expectedToken) {
      this.logger.log('Meta webhook challenge handshake verified successfully');
      return challenge || '';
    }

    this.logger.warn('Meta webhook challenge handshake failed: invalid verify_token or mode');
    throw new ForbiddenException('Invalid webhook verification token');
  }
}
