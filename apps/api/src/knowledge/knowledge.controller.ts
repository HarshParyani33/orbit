import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  Inject,
  ParseUUIDPipe,
} from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext, ApiResponse } from '@orbit/shared';
import {
  CreateKnowledgeDocumentInput,
  ListKnowledgeDocumentsQuery,
} from '@orbit/validation';

@Controller('api/knowledge')
@UseGuards(JwtAuthGuard, TenantGuard)
export class KnowledgeController {
  constructor(
    @Inject(KnowledgeService)
    private readonly knowledgeService: KnowledgeService,
  ) {}

  @Post('documents')
  async createDocument(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: CreateKnowledgeDocumentInput,
  ): Promise<ApiResponse> {
    const doc = await this.knowledgeService.createDocument(tenant.orgId, body);
    return {
      success: true,
      data: doc,
    };
  }

  @Get('documents')
  async listDocuments(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListKnowledgeDocumentsQuery,
  ): Promise<ApiResponse> {
    const result = await this.knowledgeService.listDocuments(tenant.orgId, query);
    return {
      success: true,
      data: result,
    };
  }

  @Get('documents/:id')
  async getDocument(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiResponse> {
    const doc = await this.knowledgeService.getDocument(tenant.orgId, id);
    return {
      success: true,
      data: doc,
    };
  }

  @Delete('documents/:id')
  async deleteDocument(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiResponse> {
    const result = await this.knowledgeService.deleteDocument(tenant.orgId, id);
    return {
      success: true,
      data: result,
    };
  }
}
