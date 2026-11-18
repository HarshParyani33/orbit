import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext, ApiResponse } from '@orbit/shared';
import {
  createConversationSchema,
  updateConversationStatusSchema,
  listConversationsQuerySchema,
  createMessageSchema,
  CreateConversationInput,
  UpdateConversationStatusInput,
  CreateMessageInput,
} from '@orbit/validation';

@Controller('api/conversations')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ConversationsController {
  constructor(
    @Inject(ConversationsService)
    private readonly conversationsService: ConversationsService
  ) {}

  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: Record<string, unknown>
  ): Promise<ApiResponse> {
    const parsed = listConversationsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: parsed.error.flatten(),
      });
    }

    const conversations = await this.conversationsService.listConversations(
      tenant.orgId,
      parsed.data
    );
    return {
      success: true,
      data: conversations,
    };
  }

  @Get(':id')
  async get(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') conversationId: string
  ): Promise<ApiResponse> {
    const conversation = await this.conversationsService.getConversation(
      tenant.orgId,
      conversationId
    );
    return {
      success: true,
      data: conversation,
    };
  }

  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown
  ): Promise<ApiResponse> {
    const parsed = createConversationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid conversation input',
        details: parsed.error.flatten(),
      });
    }

    const conversation = await this.conversationsService.createConversation(
      tenant.orgId,
      parsed.data as CreateConversationInput
    );
    return {
      success: true,
      data: conversation,
    };
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') conversationId: string,
    @Body() body: unknown
  ): Promise<ApiResponse> {
    const parsed = updateConversationStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid status update',
        details: parsed.error.flatten(),
      });
    }

    const updated = await this.conversationsService.updateConversationStatus(
      tenant.orgId,
      conversationId,
      (parsed.data as UpdateConversationStatusInput).status
    );
    return {
      success: true,
      data: updated,
    };
  }

  @Get(':id/messages')
  async listMessages(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') conversationId: string
  ): Promise<ApiResponse> {
    const messages = await this.conversationsService.listMessages(
      tenant.orgId,
      conversationId
    );
    return {
      success: true,
      data: messages,
    };
  }

  @Post(':id/messages')
  async createMessage(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') conversationId: string,
    @Body() body: unknown
  ): Promise<ApiResponse> {
    const parsed = createMessageSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid message input',
        details: parsed.error.flatten(),
      });
    }

    const message = await this.conversationsService.createMessage(
      tenant.orgId,
      conversationId,
      parsed.data as CreateMessageInput
    );
    return {
      success: true,
      data: message,
    };
  }
}
