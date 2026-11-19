import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { OutboundWebhooksService } from './outbound-webhooks.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext, ApiResponse, Role } from '@orbit/shared';

@Controller('api/developer')
@UseGuards(JwtAuthGuard, TenantGuard)
export class DeveloperController {
  constructor(
    @Inject(ApiKeysService) private readonly apiKeysService: ApiKeysService,
    @Inject(OutboundWebhooksService) private readonly webhooksService: OutboundWebhooksService
  ) {}

  private enforceAdmin(tenant: TenantContext) {
    if (tenant.role !== Role.OWNER && tenant.role !== Role.ADMIN) {
      throw new ForbiddenException('Only organization owners and admins can manage developer credentials');
    }
  }

  @Get('keys')
  async listKeys(@CurrentTenant() tenant: TenantContext): Promise<ApiResponse> {
    this.enforceAdmin(tenant);
    const keys = await this.apiKeysService.listApiKeys(tenant.orgId);
    return {
      success: true,
      data: keys,
    };
  }

  @Post('keys')
  async createKey(
    @CurrentTenant() tenant: TenantContext,
    @Body('name') name: string,
    @Body('scopes') scopes?: string[]
  ): Promise<ApiResponse> {
    this.enforceAdmin(tenant);
    const key = await this.apiKeysService.generateApiKey(tenant.orgId, name, scopes);
    return {
      success: true,
      data: key,
    };
  }

  @Delete('keys/:id')
  async revokeKey(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') keyId: string
  ): Promise<ApiResponse> {
    this.enforceAdmin(tenant);
    const result = await this.apiKeysService.revokeApiKey(tenant.orgId, keyId);
    return {
      success: true,
      data: result,
    };
  }

  @Get('webhooks')
  async listWebhooks(@CurrentTenant() tenant: TenantContext): Promise<ApiResponse> {
    this.enforceAdmin(tenant);
    const subs = await this.webhooksService.listSubscriptions(tenant.orgId);
    return {
      success: true,
      data: subs,
    };
  }

  @Post('webhooks')
  async subscribeWebhook(
    @CurrentTenant() tenant: TenantContext,
    @Body('targetUrl') targetUrl: string,
    @Body('events') events?: string[]
  ): Promise<ApiResponse> {
    this.enforceAdmin(tenant);
    const sub = await this.webhooksService.subscribe(tenant.orgId, targetUrl, events);
    return {
      success: true,
      data: sub,
    };
  }

  @Delete('webhooks/:id')
  async deleteWebhook(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<ApiResponse> {
    this.enforceAdmin(tenant);
    await this.webhooksService.deleteSubscription(tenant.orgId, id);
    return {
      success: true,
      data: { success: true },
    };
  }
}
