import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/app.config';
import { AuthService } from '../../apps/api/src/auth/auth.service';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { AttachmentsService } from '../../apps/api/src/attachments/attachments.service';
import { ConversationsService } from '../../apps/api/src/conversations/conversations.service';
import { ChannelsService } from '../../apps/api/src/channels/channels.service';
import { TenantTransactionRunner } from '../../apps/api/src/tenancy/tenant-transaction-runner';
import { DiskStorageProvider } from '@orbit/integrations';

describe('Milestone 3 Slice 3.4 — Message Media Attachments & Multi-Tenant Storage Tests', () => {
  let app: INestApplication;
  let baseUrl: string;
  let authService: AuthService;
  let prisma: PrismaService;
  let attachmentsService: AttachmentsService;
  let conversationsService: ConversationsService;
  let channelsService: ChannelsService;
  let tenantRunner: TenantTransactionRunner;

  // Tenant A Credentials
  let tenantAToken: string;
  let tenantAOrgId: string;
  let tenantAChannelId: string;
  let tenantAConversationId: string;
  let tenantAMessageId: string;

  // Tenant B Credentials
  let tenantBToken: string;
  let tenantBOrgId: string;

  const testTempDir = path.join(process.cwd(), 'tmp', `test-storage-${Date.now()}`);

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);

    baseUrl = await app.getUrl();
    authService = app.get(AuthService);
    prisma = app.get(PrismaService);
    attachmentsService = app.get(AttachmentsService);
    conversationsService = app.get(ConversationsService);
    channelsService = app.get(ChannelsService);
    tenantRunner = app.get(TenantTransactionRunner);

    // Setup custom isolated test storage provider
    const testStorageProvider = new DiskStorageProvider(testTempDir);
    attachmentsService.setStorageProvider(testStorageProvider);

    // 1. Register Tenant A
    const tenantAEmail = `media_tenant_a_${Date.now()}@example.com`;
    const regA = await authService.register({
      name: 'Media Tenant A',
      email: tenantAEmail,
      password: 'Password123!',
      organizationName: `Media Org A ${Date.now()}`,
    });
    tenantAToken = regA.accessToken;
    tenantAOrgId = regA.response.organizations[0].id;

    // Create channel, conversation, and message for Tenant A
    const chA = await channelsService.createChannel(tenantAOrgId, {
      name: 'Acme Media Support',
      provider: 'WEB_CHAT',
    });
    tenantAChannelId = chA.id;

    const convA = await conversationsService.createConversation(tenantAOrgId, {
      channelId: tenantAChannelId,
      title: 'Customer Inquiry with Media',
      initialMessage: 'Here is the screenshot of my issue.',
    });
    tenantAConversationId = convA.id;
    tenantAMessageId = convA.messages[0].id;

    // 2. Register Tenant B
    const tenantBEmail = `media_tenant_b_${Date.now()}@example.com`;
    const regB = await authService.register({
      name: 'Media Tenant B',
      email: tenantBEmail,
      password: 'Password123!',
      organizationName: `Media Org B ${Date.now()}`,
    });
    tenantBToken = regB.accessToken;
    tenantBOrgId = regB.response.organizations[0].id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();

    // Clean up test temp storage directory
    try {
      if (fs.existsSync(testTempDir)) {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore directory cleanup errors
    }
  });

  // ============================================================================
  // SECTION 1: Disk Storage Provider Core & Security Invariants
  // ============================================================================
  describe('1. DiskStorageProvider Security & Path Traversal Guards', () => {
    it('successfully uploads, reads, checks existence, and deletes a buffer', async () => {
      const provider = new DiskStorageProvider(testTempDir);
      const testKey = 'test-org/conv-1/sample.txt';
      const testBuffer = Buffer.from('Hello Project Orbit Media Storage!');

      const uploadResult = await provider.upload(testKey, testBuffer, 'text/plain');
      expect(uploadResult.key).toBe(testKey);
      expect(uploadResult.size).toBe(testBuffer.length);

      const existsBefore = await provider.exists(testKey);
      expect(existsBefore).toBe(true);

      const downloadResult = await provider.download(testKey);
      expect(downloadResult.buffer.toString('utf8')).toBe('Hello Project Orbit Media Storage!');

      await provider.delete(testKey);
      const existsAfter = await provider.exists(testKey);
      expect(existsAfter).toBe(false);
    });

    it('rejects path traversal attacks attempting to escape storage base directory with ..', async () => {
      const provider = new DiskStorageProvider(testTempDir);
      const maliciousKey = '../../etc/passwd';
      const buffer = Buffer.from('exploit');

      await expect(provider.upload(maliciousKey, buffer, 'text/plain')).rejects.toThrow(
        /Path traversal detected/i
      );
    });

    it('rejects Windows-style backslash traversal attempts', async () => {
      const provider = new DiskStorageProvider(testTempDir);
      const maliciousKey = '..\\..\\windows\\system32\\config';
      const buffer = Buffer.from('exploit');

      await expect(provider.upload(maliciousKey, buffer, 'text/plain')).rejects.toThrow(
        /Path traversal detected/i
      );
    });

    it('rejects storage keys containing null bytes', async () => {
      const provider = new DiskStorageProvider(testTempDir);
      const maliciousKey = 'normal/path/file.png\0.exe';
      const buffer = Buffer.from('exploit');

      await expect(provider.upload(maliciousKey, buffer, 'text/plain')).rejects.toThrow(
        /null bytes/i
      );
    });
  });

  // ============================================================================
  // SECTION 2: Filename Sanitization & Input Validation
  // ============================================================================
  describe('2. Filename Sanitization & Upload Policy Validation', () => {
    it('sanitizes malicious filenames to safe basenames without slashes or traversal sequences', () => {
      expect(attachmentsService.sanitizeFileName('../../../secrets.pdf')).toBe('secrets.pdf');
      expect(attachmentsService.sanitizeFileName('C:\\Windows\\system32\\hosts.txt')).toBe('hosts.txt');
      expect(attachmentsService.sanitizeFileName('dangerous\0file.png')).toBe('dangerousfile.png');
      expect(attachmentsService.sanitizeFileName('...')).toMatch(/^attachment_/);
    });

    it('rejects disallowed or dangerous file MIME types (e.g. executable .exe, html, sh)', async () => {
      const dangerousFile = {
        originalname: 'malware.exe',
        mimetype: 'application/x-msdownload',
        size: 1024,
        buffer: Buffer.from('MZ000000000'),
      };

      await expect(
        attachmentsService.uploadAttachment(
          tenantAOrgId,
          tenantAConversationId,
          tenantAMessageId,
          dangerousFile
        )
      ).rejects.toThrow(/Unsupported file type/i);
    });

    it('rejects files exceeding the 10MB maximum size limit', async () => {
      const oversizedFile = {
        originalname: 'huge_document.pdf',
        mimetype: 'application/pdf',
        size: 11 * 1024 * 1024, // 11MB
        buffer: Buffer.alloc(11 * 1024 * 1024),
      };

      await expect(
        attachmentsService.uploadAttachment(
          tenantAOrgId,
          tenantAConversationId,
          tenantAMessageId,
          oversizedFile
        )
      ).rejects.toThrow(/exceeds maximum allowed limit/i);
    });
  });

  // ============================================================================
  // SECTION 3: HTTP Multipart Upload & Attachment Lifecycle
  // ============================================================================
  describe('3. HTTP Multipart Upload & Media Attachment Lifecycle', () => {
    let uploadedAttachmentId: string;
    const testImagePayload = Buffer.from('PNG_FAKE_IMAGE_DATA_1234567890');

    it('uploads valid image attachment via HTTP multipart form-data', async () => {
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
      const filename = 'screenshot.png';

      const bodyParts = [
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`,
        `Content-Type: image/png\r\n\r\n`,
        testImagePayload.toString('latin1'),
        `\r\n--${boundary}--\r\n`,
      ];
      const multipartBody = Buffer.from(bodyParts.join(''), 'latin1');

      const response = await fetch(
        `${baseUrl}/api/conversations/${tenantAConversationId}/messages/${tenantAMessageId}/attachments`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tenantAToken}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: multipartBody,
        }
      );

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBeDefined();
      expect(json.data.fileName).toBe('screenshot.png');
      expect(json.data.fileType).toBe('image/png');
      expect(json.data.fileSize).toBe(testImagePayload.length);
      expect(json.data.organizationId).toBe(tenantAOrgId);
      expect(json.data.messageId).toBe(tenantAMessageId);

      uploadedAttachmentId = json.data.id;
    });

    it('lists attachments for the message including newly uploaded attachment', async () => {
      const response = await fetch(
        `${baseUrl}/api/conversations/${tenantAConversationId}/messages/${tenantAMessageId}/attachments`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tenantAToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(1);

      const found = json.data.find((a: any) => a.id === uploadedAttachmentId);
      expect(found).toBeDefined();
      expect(found.fileName).toBe('screenshot.png');
    });

    it('downloads the attachment file with exact buffer and content headers', async () => {
      const response = await fetch(
        `${baseUrl}/api/conversations/${tenantAConversationId}/messages/${tenantAMessageId}/attachments/${uploadedAttachmentId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tenantAToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(response.headers.get('content-disposition')).toContain('screenshot.png');

      const arrayBuffer = await response.arrayBuffer();
      const downloadedBuffer = Buffer.from(arrayBuffer);
      expect(downloadedBuffer.equals(testImagePayload)).toBe(true);
    });

    it('includes attachments automatically when fetching conversation with getConversation', async () => {
      const conv = await conversationsService.getConversation(
        tenantAOrgId,
        tenantAConversationId
      );

      const msg = conv.messages.find((m: any) => m.id === tenantAMessageId);
      expect(msg).toBeDefined();
      expect((msg as any).attachments).toBeDefined();
      expect((msg as any).attachments.length).toBeGreaterThanOrEqual(1);
      expect((msg as any).attachments[0].id).toBe(uploadedAttachmentId);
    });
  });

  // ============================================================================
  // SECTION 4: Soft-Deletion Lifecycle
  // ============================================================================
  describe('4. Soft-Deletion Lifecycle', () => {
    let toDeleteAttachmentId: string;

    beforeAll(async () => {
      // Upload a temporary attachment to delete
      const att = await attachmentsService.uploadAttachment(
        tenantAOrgId,
        tenantAConversationId,
        tenantAMessageId,
        {
          originalname: 'to_delete.pdf',
          mimetype: 'application/pdf',
          size: 100,
          buffer: Buffer.from('temporary pdf content'),
        }
      );
      toDeleteAttachmentId = att.id;
    });

    it('soft-deletes attachment via DELETE endpoint', async () => {
      const response = await fetch(
        `${baseUrl}/api/conversations/${tenantAConversationId}/messages/${tenantAMessageId}/attachments/${toDeleteAttachmentId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${tenantAToken}`,
            'X-Requested-With': 'XMLHttpRequest',
          },
        }
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.deleted).toBe(true);
    });

    it('excludes soft-deleted attachments from listAttachments and download endpoint', async () => {
      const listRes = await fetch(
        `${baseUrl}/api/conversations/${tenantAConversationId}/messages/${tenantAMessageId}/attachments`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tenantAToken}`,
          },
        }
      );

      const listJson = await listRes.json();
      const found = listJson.data.find((a: any) => a.id === toDeleteAttachmentId);
      expect(found).toBeUndefined();

      // Download attempt returns 404
      const downloadRes = await fetch(
        `${baseUrl}/api/conversations/${tenantAConversationId}/messages/${tenantAMessageId}/attachments/${toDeleteAttachmentId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tenantAToken}`,
          },
        }
      );
      expect(downloadRes.status).toBe(404);
    });
  });

  // ============================================================================
  // SECTION 5: Multi-Tenant Row-Level Security (RLS) Isolation
  // ============================================================================
  describe('5. Multi-Tenant Row-Level Security (RLS) Isolation', () => {
    it('Tenant B cannot upload an attachment to Tenant A message (returns 404)', async () => {
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
      const multipartBody = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\nHello\r\n--${boundary}--\r\n`
      );

      const response = await fetch(
        `${baseUrl}/api/conversations/${tenantAConversationId}/messages/${tenantAMessageId}/attachments`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tenantBToken}`, // Tenant B credentials!
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: multipartBody,
        }
      );

      expect(response.status).toBe(404);
    });

    it('Tenant B cannot list Tenant A attachments (returns 404)', async () => {
      const response = await fetch(
        `${baseUrl}/api/conversations/${tenantAConversationId}/messages/${tenantAMessageId}/attachments`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tenantBToken}`, // Tenant B credentials!
          },
        }
      );

      expect(response.status).toBe(404);
    });

    it('Direct database query with Tenant B session context returns 0 rows for Tenant A attachments', async () => {
      const attachments = await tenantRunner.runWithTenant(tenantBOrgId, async (tx) => {
        return tx.messageAttachment.findMany({
          where: { organizationId: tenantAOrgId },
        });
      });

      // PostgreSQL RLS filters out rows from other tenants
      expect(attachments).toHaveLength(0);
    });
  });
});
