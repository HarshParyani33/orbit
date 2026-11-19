import {
  Injectable,
  Inject,
  Optional,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import { RealtimeService } from '../realtime/realtime.service';
import { AutomationsService } from '../automations/automations.service';
import {
  IWhatsAppAdapter,
  MockWhatsAppAdapter,
  IInstagramAdapter,
  MockInstagramAdapter,
} from '@orbit/integrations';
import {
  CreateConversationInput,
  ListConversationsQuery,
  CreateMessageInput,
} from '@orbit/validation';

@Injectable()
export class ConversationsService {
  private whatsAppAdapter: IWhatsAppAdapter = new MockWhatsAppAdapter();
  private instagramAdapter: IInstagramAdapter = new MockInstagramAdapter();

  constructor(
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner,
    @Optional()
    @Inject(RealtimeService)
    private readonly realtimeService?: RealtimeService,
    @Optional()
    @Inject(AutomationsService)
    private readonly automationsService?: AutomationsService
  ) { }

  setWhatsAppAdapter(adapter: IWhatsAppAdapter) {
    this.whatsAppAdapter = adapter;
  }

  getWhatsAppAdapter(): IWhatsAppAdapter {
    return this.whatsAppAdapter;
  }

  setInstagramAdapter(adapter: IInstagramAdapter) {
    this.instagramAdapter = adapter;
  }

  getInstagramAdapter(): IInstagramAdapter {
    return this.instagramAdapter;
  }

  async listConversations(organizationId: string, query: ListConversationsQuery) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const where: any = {
        organizationId,
      };

      if (query.status) {
        where.status = query.status;
      }

      if (query.channelId) {
        where.channelId = query.channelId;
      }

      if (query.customerId) {
        where.customerId = query.customerId;
      }

      const conversations = await tx.conversation.findMany({
        where,
        take: query.limit,
        skip: query.cursor ? 1 : 0,
        cursor: query.cursor ? { id: query.cursor } : undefined,
        orderBy: { updatedAt: 'desc' },
        include: {
          channel: {
            select: {
              id: true,
              name: true,
              provider: true,
            },
          },
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      return conversations.map((c) => ({
        ...c,
        lastMessage: c.messages[0] || null,
      }));
    });
  }

  async getConversation(organizationId: string, conversationId: string) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: {
          id: conversationId,
          organizationId,
        },
        include: {
          channel: {
            select: {
              id: true,
              name: true,
              provider: true,
            },
          },
          customer: {
            include: {
              channelIdentities: {
                select: {
                  id: true,
                  provider: true,
                  externalId: true,
                  verified: true,
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
            include: {
              attachments: {
                where: { deletedAt: null },
              },
            },
          },
        },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      return conversation;
    });
  }

  async createConversation(organizationId: string, data: CreateConversationInput) {
    const result = await this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      // Verify channel exists and belongs to this organization
      const channel = await tx.channel.findFirst({
        where: {
          id: data.channelId,
          organizationId,
          deletedAt: null,
        },
      });

      if (!channel) {
        throw new BadRequestException('Channel not found or does not belong to active organization');
      }

      if (data.customerId) {
        const customer = await tx.customer.findFirst({
          where: {
            id: data.customerId,
            organizationId,
            mergedIntoId: null,
          },
        });
        if (!customer) {
          throw new BadRequestException('Customer not found or does not belong to active organization');
        }
      }

      const conversation = await tx.conversation.create({
        data: {
          organizationId,
          channelId: data.channelId,
          customerId: data.customerId || null,
          status: 'OPEN',
          title: data.title || null,
        },
        include: {
          channel: {
            select: {
              id: true,
              name: true,
              provider: true,
            },
          },
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      let initialMsg = null;
      if (data.initialMessage) {
        initialMsg = await tx.message.create({
          data: {
            organizationId,
            conversationId: conversation.id,
            senderType: 'CUSTOMER',
            content: data.initialMessage,
          },
        });
      }

      return {
        ...conversation,
        messages: initialMsg ? [initialMsg] : [],
        lastMessage: initialMsg,
      };
    });

    this.realtimeService?.emitConversationCreated(organizationId, result);
    if (this.automationsService) {
      await this.automationsService.evaluateRules(organizationId, 'CONVERSATION_CREATED', {
        conversationId: result.id,
        status: result.status,
      });
    }
    return result;
  }

  async updateConversationStatus(
    organizationId: string,
    conversationId: string,
    status: string
  ) {
    const updated = await this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const existing = await tx.conversation.findFirst({
        where: { id: conversationId, organizationId },
      });

      if (!existing) {
        throw new NotFoundException('Conversation not found');
      }

      return tx.conversation.update({
        where: {
          uq_conversations_id_org: {
            id: conversationId,
            organizationId,
          },
        },
        data: {
          status,
          updatedAt: new Date(),
        },
        include: {
          channel: {
            select: {
              id: true,
              name: true,
              provider: true,
            },
          },
        },
      });
    });

    this.realtimeService?.emitConversationStatusChanged(organizationId, conversationId, status);
    if (this.automationsService && status === 'RESOLVED') {
      await this.automationsService.evaluateRules(organizationId, 'CONVERSATION_RESOLVED', {
        conversationId,
        status: 'RESOLVED',
      });
    }
    return updated;
  }

  async listMessages(organizationId: string, conversationId: string) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, organizationId },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      return tx.message.findMany({
        where: {
          conversationId,
          organizationId,
        },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  async createMessage(
    organizationId: string,
    conversationId: string,
    data: CreateMessageInput
  ) {
    const message = await this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, organizationId },
        include: { channel: true, customer: true },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      if (data.senderType === 'AGENT' && conversation.channel?.provider === 'META_WHATSAPP') {
        const toPhone = conversation.customer?.phone;
        if (toPhone) {
          await this.whatsAppAdapter.sendMessage({
            phoneNumberId: (conversation.channel.config as any)?.phoneNumberId || 'default',
            to: toPhone,
            text: data.content,
          });
        }
      } else if (data.senderType === 'AGENT' && conversation.channel?.provider === 'META_INSTAGRAM') {
        const igsid = (conversation.customer?.metadata as any)?.igsid;
        if (igsid) {
          await this.instagramAdapter.sendMessage({
            accountId: (conversation.channel.config as any)?.accountId || 'default',
            recipientIgsid: igsid,
            text: data.content,
          });
        }
      }

      const message = await tx.message.create({
        data: {
          organizationId,
          conversationId,
          senderType: data.senderType,
          content: data.content,
        },
      });

      // Update conversation updatedAt and re-open if incoming customer message
      const nextStatus =
        conversation.status === 'RESOLVED' && data.senderType === 'CUSTOMER'
          ? 'OPEN'
          : conversation.status;

      await tx.conversation.update({
        where: {
          uq_conversations_id_org: {
            id: conversationId,
            organizationId,
          },
        },
        data: {
          status: nextStatus,
          updatedAt: new Date(),
        },
      });

      return message;
    });

    this.realtimeService?.emitMessageCreated(organizationId, conversationId, message);
    if (this.automationsService && data.senderType === 'CUSTOMER') {
      await this.automationsService.evaluateRules(organizationId, 'MESSAGE_RECEIVED', {
        conversationId,
        messageContent: data.content,
      });
    }
    return message;
  }
}

