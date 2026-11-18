import {
  Injectable,
  Inject,
  Optional,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as path from 'path';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import { RealtimeService } from '../realtime/realtime.service';
import {
  IStorageProvider,
  DiskStorageProvider,
} from '@orbit/integrations';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
} from '@orbit/validation';

export interface UploadFileInput {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private storageProvider: IStorageProvider;

  constructor(
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner,
    @Optional()
    @Inject(RealtimeService)
    private readonly realtimeService?: RealtimeService
  ) {
    this.storageProvider = new DiskStorageProvider();
  }

  setStorageProvider(provider: IStorageProvider): void {
    this.storageProvider = provider;
  }

  getStorageProvider(): IStorageProvider {
    return this.storageProvider;
  }

  /**
   * Sanitize an incoming filename to strip directory traversal sequences,
   * null bytes, and non-printable control characters.
   */
  sanitizeFileName(fileName: string): string {
    if (!fileName || typeof fileName !== 'string') {
      return `attachment_${Date.now()}`;
    }

    // Strip path components
    let clean = path.basename(fileName);

    // Remove null bytes, slashes, control chars, and directory traversal tokens
    clean = clean.replace(/[\0\r\n\t]/g, '');
    clean = clean.replace(/[/\\]/g, '_');
    clean = clean.replace(/\.{2,}/g, '.');

    // Remove leading/trailing periods or spaces
    clean = clean.trim().replace(/^\.+|\.+$/g, '');

    if (!clean || clean.length === 0) {
      clean = `attachment_${Date.now()}`;
    }

    // Truncate to maximum safe length
    if (clean.length > 200) {
      const ext = path.extname(clean);
      clean = clean.slice(0, 200 - ext.length) + ext;
    }

    return clean;
  }

  /**
   * Upload an attachment for a given message within tenant RLS boundary.
   */
  async uploadAttachment(
    organizationId: string,
    conversationId: string,
    messageId: string,
    file: UploadFileInput
  ) {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('A non-empty file must be provided');
    }

    // Validate MIME type
    if (!(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type '${file.mimetype}'. Allowed types: ${ALLOWED_ATTACHMENT_MIME_TYPES.join(', ')}`
      );
    }

    // Validate file size limit
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES || file.buffer.length > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new BadRequestException(
        `File size exceeds maximum allowed limit of ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB`
      );
    }

    const safeFileName = this.sanitizeFileName(file.originalname);
    const attachmentId = crypto.randomUUID();
    const storageKey = `attachments/${organizationId}/${messageId}/${attachmentId}_${safeFileName}`;

    // Upload to storage provider
    await this.storageProvider.upload(storageKey, file.buffer, file.mimetype);

    // Persist attachment record inside tenant RLS transaction
    const attachment = await this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      // 1. Verify conversation belongs to tenant
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, organizationId },
      });
      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      // 2. Verify message belongs to conversation and tenant
      const message = await tx.message.findFirst({
        where: { id: messageId, conversationId, organizationId },
      });
      if (!message) {
        throw new NotFoundException('Message not found');
      }

      // 3. Create attachment record
      return tx.messageAttachment.create({
        data: {
          id: attachmentId,
          organizationId,
          messageId,
          fileName: safeFileName,
          fileType: file.mimetype,
          fileSize: file.size,
          storageKey,
          storageProvider: 'LOCAL',
        },
      });
    });

    this.realtimeService?.emitAttachmentCreated(
      organizationId,
      conversationId,
      messageId,
      attachment
    );

    return attachment;
  }

  /**
   * List non-deleted attachments for a given message.
   */
  async listAttachments(
    organizationId: string,
    conversationId: string,
    messageId: string
  ) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      // Verify message and conversation exist within tenant
      const message = await tx.message.findFirst({
        where: { id: messageId, conversationId, organizationId },
      });
      if (!message) {
        throw new NotFoundException('Message not found');
      }

      return tx.messageAttachment.findMany({
        where: {
          organizationId,
          messageId,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  /**
   * Retrieve and download an attachment buffer within tenant RLS boundary.
   */
  async downloadAttachment(
    organizationId: string,
    conversationId: string,
    messageId: string,
    attachmentId: string
  ) {
    const attachment = await this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const record = await tx.messageAttachment.findFirst({
        where: {
          id: attachmentId,
          organizationId,
          messageId,
          deletedAt: null,
        },
      });
      if (!record) {
        throw new NotFoundException('Attachment not found');
      }
      return record;
    });

    const fileData = await this.storageProvider.download(attachment.storageKey);
    return {
      attachment,
      buffer: fileData.buffer,
    };
  }

  /**
   * Soft-delete an attachment within tenant RLS boundary.
   */
  async deleteAttachment(
    organizationId: string,
    conversationId: string,
    messageId: string,
    attachmentId: string
  ) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const existing = await tx.messageAttachment.findFirst({
        where: {
          id: attachmentId,
          organizationId,
          messageId,
          deletedAt: null,
        },
      });
      if (!existing) {
        throw new NotFoundException('Attachment not found');
      }

      return tx.messageAttachment.update({
        where: {
          uq_message_attachments_id_org: {
            id: attachmentId,
            organizationId,
          },
        },
        data: {
          deletedAt: new Date(),
        },
      });
    });
  }
}
