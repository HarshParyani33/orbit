import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext, ApiResponse } from '@orbit/shared';

@Controller('api/conversations')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AttachmentsController {
  constructor(
    @Inject(AttachmentsService)
    private readonly attachmentsService: AttachmentsService
  ) {}

  @Post(':conversationId/messages/:messageId/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @CurrentTenant() tenant: TenantContext,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @UploadedFile() file?: any
  ): Promise<ApiResponse> {
    if (!file) {
      throw new BadRequestException('A file is required in multipart field "file"');
    }

    const attachment = await this.attachmentsService.uploadAttachment(
      tenant.orgId,
      conversationId,
      messageId,
      {
        originalname: file.originalname || 'attachment',
        mimetype: file.mimetype || 'application/octet-stream',
        size: file.size || file.buffer?.length || 0,
        buffer: file.buffer,
      }
    );

    return {
      success: true,
      data: attachment,
    };
  }

  @Get(':conversationId/messages/:messageId/attachments')
  async listAttachments(
    @CurrentTenant() tenant: TenantContext,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string
  ): Promise<ApiResponse> {
    const attachments = await this.attachmentsService.listAttachments(
      tenant.orgId,
      conversationId,
      messageId
    );

    return {
      success: true,
      data: attachments,
    };
  }

  @Get(':conversationId/messages/:messageId/attachments/:attachmentId')
  async downloadAttachment(
    @CurrentTenant() tenant: TenantContext,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response
  ): Promise<void> {
    const { attachment, buffer } = await this.attachmentsService.downloadAttachment(
      tenant.orgId,
      conversationId,
      messageId,
      attachmentId
    );

    res.setHeader('Content-Type', attachment.fileType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(attachment.fileName)}"`
    );
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  @Delete(':conversationId/messages/:messageId/attachments/:attachmentId')
  async deleteAttachment(
    @CurrentTenant() tenant: TenantContext,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string
  ): Promise<ApiResponse> {
    await this.attachmentsService.deleteAttachment(
      tenant.orgId,
      conversationId,
      messageId,
      attachmentId
    );

    return {
      success: true,
      data: { deleted: true },
    };
  }
}
