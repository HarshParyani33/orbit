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
  BadRequestException,
} from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext, ApiResponse } from '@orbit/shared';
import {
  CreateKnowledgeDocumentInput,
  ListKnowledgeDocumentsQuery,
  SearchKnowledgeInput,
  createKnowledgeDocumentSchema,
  listKnowledgeDocumentsQuerySchema,
  searchKnowledgeSchema,
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
    @Body() body: unknown,
  ): Promise<ApiResponse> {
    const parsed = createKnowledgeDocumentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid knowledge document input',
        details: parsed.error.flatten(),
      });
    }

    const doc = await this.knowledgeService.createDocument(tenant.orgId, parsed.data);
    return {
      success: true,
      data: doc,
    };
  }

  @Post('search')
  async searchKnowledge(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
  ): Promise<ApiResponse> {
    const parsed = searchKnowledgeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid search input',
        details: parsed.error.flatten(),
      });
    }

    const results = await this.knowledgeService.searchSimilarChunks(tenant.orgId, parsed.data);
    return {
      success: true,
      data: results,
    };
  }

  @Get('documents')
  async listDocuments(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: unknown,
  ): Promise<ApiResponse> {
    const parsed = listKnowledgeDocumentsQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid list query',
        details: parsed.error.flatten(),
      });
    }

    const result = await this.knowledgeService.listDocuments(tenant.orgId, parsed.data);
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
