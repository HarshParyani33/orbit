import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext, ApiResponse } from '@orbit/shared';
import {
  createAiConfigSchema,
} from '@orbit/validation';

@Controller('api/ai')
@UseGuards(JwtAuthGuard, TenantGuard, RateLimitGuard)
export class AiController {
  constructor(@Inject(AiService) private readonly aiService: AiService) {}

  @Get('config')
  async getActiveConfig(@CurrentTenant() tenant: TenantContext): Promise<ApiResponse> {
    const config = await this.aiService.getActiveConfiguration(tenant.orgId);
    return {
      success: true,
      data: config,
    };
  }

  @Get('config/history')
  async listConfigs(@CurrentTenant() tenant: TenantContext): Promise<ApiResponse> {
    const configs = await this.aiService.listConfigurations(tenant.orgId);
    return {
      success: true,
      data: configs,
    };
  }

  @Post('config')
  async createConfig(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown
  ): Promise<ApiResponse> {
    const parsed = createAiConfigSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid AI configuration input',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const config = await this.aiService.createConfiguration(tenant.orgId, parsed.data);
    return {
      success: true,
      data: config,
    };
  }

  @Post('config/:id/activate')
  async activateConfig(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') configId: string,
    @Req() req: any
  ): Promise<ApiResponse> {
    const userId = req.user?.sub || null;
    const config = await this.aiService.activateConfiguration(
      tenant.orgId,
      configId,
      userId
    );
    return {
      success: true,
      data: config,
    };
  }

  @Post('conversations/:id/suggest')
  @RateLimit({ maxRequests: 60, windowMs: 60000, keyPrefix: 'ai_sug', keyBy: 'org' })
  async generateSuggestion(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') conversationId: string
  ): Promise<ApiResponse> {
    const result = await this.aiService.generateSuggestion(tenant.orgId, conversationId);
    return {
      success: true,
      data: result,
    };
  }
}
