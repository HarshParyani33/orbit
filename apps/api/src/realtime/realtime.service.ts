import { Injectable, Inject, Logger } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(
    @Inject(RealtimeGateway)
    private readonly gateway: RealtimeGateway
  ) {}

  emitConversationCreated(organizationId: string, conversation: any): void {
    if (!this.gateway?.server) return;
    try {
      this.gateway.server.to(`tenant:${organizationId}`).emit('conversation:created', {
        conversation,
      });
      this.logger.log(`[Realtime] Emitted conversation:created to tenant:${organizationId}`);
    } catch (err: any) {
      this.logger.error(`[Realtime] Error emitting conversation:created: ${err.message}`);
    }
  }

  emitConversationStatusChanged(
    organizationId: string,
    conversationId: string,
    status: string
  ): void {
    if (!this.gateway?.server) return;
    try {
      // Notify both the tenant room (for inbox lists) and the specific conversation room
      const payload = { conversationId, status };
      this.gateway.server.to(`tenant:${organizationId}`).emit('conversation:status_changed', payload);
      this.gateway.server.to(`conv:${conversationId}`).emit('conversation:status_changed', payload);
      this.logger.log(`[Realtime] Emitted conversation:status_changed to tenant:${organizationId} and conv:${conversationId}`);
    } catch (err: any) {
      this.logger.error(`[Realtime] Error emitting conversation:status_changed: ${err.message}`);
    }
  }

  emitMessageCreated(
    organizationId: string,
    conversationId: string,
    message: any
  ): void {
    if (!this.gateway?.server) return;
    try {
      // 1. Emit full message to readers in the conversation room
      this.gateway.server.to(`conv:${conversationId}`).emit('message:created', {
        conversationId,
        message,
      });

      // 2. Emit update notice to tenant room so list cards update last message & timestamp
      this.gateway.server.to(`tenant:${organizationId}`).emit('conversation:updated', {
        conversationId,
        lastMessage: message,
        updatedAt: message.createdAt || new Date().toISOString(),
      });
      this.logger.debug(`[Realtime] Emitted message:created to conv:${conversationId} and updated to tenant:${organizationId}`);
    } catch (err: any) {
      this.logger.error(`[Realtime] Error emitting message:created: ${err.message}`);
    }
  }

  emitAttachmentCreated(
    organizationId: string,
    conversationId: string,
    messageId: string,
    attachment: any
  ): void {
    if (!this.gateway?.server) return;
    try {
      this.gateway.server.to(`conv:${conversationId}`).emit('attachment:created', {
        conversationId,
        messageId,
        attachment,
      });
      this.logger.debug(`[Realtime] Emitted attachment:created to conv:${conversationId}`);
    } catch (err: any) {
      this.logger.error(`[Realtime] Error emitting attachment:created: ${err.message}`);
    }
  }
}
