import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { AutomationsService } from './automations.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext } from '@orbit/shared';
import {
  createAutomationRuleSchema,
  CreateAutomationRuleInput,
} from '@orbit/validation';

@Controller('api/automations')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AutomationsController {
  constructor(
    @Inject(AutomationsService)
    private readonly automationsService: AutomationsService
  ) {}

  @Get('rules')
  async listRules(@CurrentTenant() tenant: TenantContext) {
    const rules = await this.automationsService.listRules(tenant.orgId);
    return { success: true, data: rules };
  }

  @Post('rules')
  async createRule(
    @CurrentTenant() tenant: TenantContext,
    @Body() rawBody: unknown
  ) {
    const parsed = createAutomationRuleSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid automation rule payload',
        details: parsed.error.flatten(),
      });
    }

    const rule = await this.automationsService.createRule(tenant.orgId, parsed.data);
    return { success: true, data: rule };
  }

  @Get('audits')
  async listAudits(
    @CurrentTenant() tenant: TenantContext,
    @Query('conversationId') conversationId?: string
  ) {
    const audits = await this.automationsService.listAudits(tenant.orgId, conversationId);
    return { success: true, data: audits };
  }
}
