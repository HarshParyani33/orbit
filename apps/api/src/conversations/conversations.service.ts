import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import {
  CreateConversationInput,
  ListConversationsQuery,
  CreateMessageInput,
} from '@orbit/validation';

@Injectable()
export class ConversationsService {
  constructor(
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner
  ) {}

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
          messages: {
            orderBy: { createdAt: 'asc' },
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
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
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

      const conversation = await tx.conversation.create({
        data: {
          organizationId,
          channelId: data.channelId,
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
  }

  async updateConversationStatus(
    organizationId: string,
    conversationId: string,
    status: 'OPEN' | 'RESOLVED' | 'SNOOZED'
  ) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
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
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, organizationId },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
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
  }
}
