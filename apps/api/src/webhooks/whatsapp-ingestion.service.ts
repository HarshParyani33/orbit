import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import { RealtimeService } from '../realtime/realtime.service';
import { AutomationsService } from '../automations/automations.service';
import { IWhatsAppAdapter, MockWhatsAppAdapter } from '@orbit/integrations';

export interface ProcessedWhatsAppMessage {
  conversationId: string;
  messageId: string;
  customerId: string;
  isNewCustomer: boolean;
  isNewConversation: boolean;
  statusChanged: boolean;
}

@Injectable()
export class WhatsAppIngestionService {
  private readonly logger = new Logger(WhatsAppIngestionService.name);
  private whatsAppAdapter: IWhatsAppAdapter = new MockWhatsAppAdapter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantRunner: TenantTransactionRunner,
    @Optional() private readonly realtimeService?: RealtimeService,
    @Optional() private readonly automationsService?: AutomationsService
  ) {}

  setWhatsAppAdapter(adapter: IWhatsAppAdapter) {
    this.whatsAppAdapter = adapter;
  }

  getWhatsAppAdapter(): IWhatsAppAdapter {
    return this.whatsAppAdapter;
  }

  /**
   * Ingests parsed WhatsApp webhook payload:
   * 1. Resolves/creates verified customer channel identity.
   * 2. Finds or creates conversation thread and re-opens if snoozed.
   * 3. Appends customer message to thread.
   * 4. Dispatches real-time WebSocket events and triggers automation rules.
   */
  async ingestInboundMessage(
    organizationId: string,
    channelId: string,
    payload: any
  ): Promise<ProcessedWhatsAppMessage[]> {
    const changes = payload?.entry?.[0]?.changes?.[0]?.value;
    const messages = changes?.messages || [];
    const contacts = changes?.contacts || [];

    const results: ProcessedWhatsAppMessage[] = [];

    for (const msg of messages) {
      const fromPhoneNumber = String(msg.from || '').trim();
      const wamid = String(msg.id || '').trim();
      const messageText = msg.text?.body || (msg.type ? `[${msg.type} message]` : '[Unsupported Message]');
      const contactProfile = contacts.find((c: any) => String(c.wa_id) === fromPhoneNumber);
      const profileName = contactProfile?.profile?.name || fromPhoneNumber;

      if (!fromPhoneNumber) {
        continue;
      }

      // Execute atomic tenant transaction with PostgreSQL RLS
      const processed = await this.tenantRunner.runWithTenant(organizationId, async (tx) => {
        // 1. Identity Resolution & Linking
        let identity = await tx.customerChannelIdentity.findUnique({
          where: {
            uq_channel_identities_channel_ext: {
              channelId,
              externalId: fromPhoneNumber,
            },
          },
        });

        let customerId: string;
        let isNewCustomer = false;

        if (identity) {
          customerId = identity.customerId;
        } else {
          // Check if customer already exists by phone in this organization
          let customer = await tx.customer.findFirst({
            where: {
              organizationId,
              phone: fromPhoneNumber,
              mergedIntoId: null,
            },
          });

          if (!customer) {
            customer = await tx.customer.create({
              data: {
                organizationId,
                name: profileName,
                phone: fromPhoneNumber,
                metadata: { tags: ['whatsapp'] },
              },
            });
            isNewCustomer = true;
          }

          customerId = customer.id;

          identity = await tx.customerChannelIdentity.create({
            data: {
              organizationId,
              customerId,
              channelId,
              provider: 'META_WHATSAPP',
              externalId: fromPhoneNumber,
              verified: true,
              metadata: { profileName },
            },
          });
        }

        // 2. Conversation Resolution & Thread Continuity
        let conversation = await tx.conversation.findFirst({
          where: {
            organizationId,
            channelId,
            customerId,
            status: { in: ['OPEN', 'SNOOZED'] },
          },
        });

        let isNewConversation = false;
        let statusChanged = false;

        if (conversation) {
          if (conversation.status === 'SNOOZED') {
            conversation = await tx.conversation.update({
              where: {
                uq_conversations_id_org: {
                  id: conversation.id,
                  organizationId,
                },
              },
              data: {
                status: 'OPEN',
                updatedAt: new Date(),
              },
            });
            statusChanged = true;
          }
        } else {
          conversation = await tx.conversation.create({
            data: {
              organizationId,
              channelId,
              customerId,
              title: `WhatsApp: ${profileName}`,
              status: 'OPEN',
            },
          });
          isNewConversation = true;
          statusChanged = true;
        }

        // 3. Message Ingestion
        const message = await tx.message.create({
          data: {
            organizationId,
            conversationId: conversation.id,
            senderType: 'CUSTOMER',
            content: messageText,
          },
        });

        await tx.conversation.update({
          where: {
            uq_conversations_id_org: {
              id: conversation.id,
              organizationId,
            },
          },
          data: { updatedAt: new Date() },
        });

        return {
          conversation,
          message,
          customerId,
          isNewCustomer,
          isNewConversation,
          statusChanged,
        };
      });

      // 4. Post-Commit Real-Time Notifications
      if (this.realtimeService) {
        if (processed.isNewConversation) {
          this.realtimeService.emitConversationCreated(organizationId, processed.conversation);
        } else if (processed.statusChanged) {
          this.realtimeService.emitConversationStatusChanged(
            organizationId,
            processed.conversation.id,
            'OPEN'
          );
        }
        this.realtimeService.emitMessageCreated(
          organizationId,
          processed.conversation.id,
          processed.message
        );
      }

      // 5. Post-Commit Automation Triggers
      if (this.automationsService) {
        if (processed.isNewConversation) {
          await this.automationsService.evaluateRules(organizationId, 'CONVERSATION_CREATED', {
            conversationId: processed.conversation.id,
            status: 'OPEN',
          });
        }
        await this.automationsService.evaluateRules(organizationId, 'MESSAGE_RECEIVED', {
          conversationId: processed.conversation.id,
          messageContent: processed.message.content,
        });
      }

      results.push({
        conversationId: processed.conversation.id,
        messageId: processed.message.id,
        customerId: processed.customerId,
        isNewCustomer: processed.isNewCustomer,
        isNewConversation: processed.isNewConversation,
        statusChanged: processed.statusChanged,
      });
    }

    return results;
  }
}
