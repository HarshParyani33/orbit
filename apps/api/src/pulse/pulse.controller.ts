import { Controller, Post, Body, UseGuards, Inject, BadRequestException } from '@nestjs/common';
import { PulseService } from './pulse.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext } from '@orbit/shared';

@Controller('api/pulse')
@UseGuards(JwtAuthGuard, TenantGuard)
export class PulseController {
  constructor(
    @Inject(PulseService)
    private readonly pulseService: PulseService
  ) {}

  @Post('query')
  async querySupportData(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { prompt: string }
  ) {
    if (!body.prompt || !body.prompt.trim()) {
      throw new BadRequestException('Prompt cannot be empty');
    }
    const response = await this.pulseService.querySupportData(tenant.orgId, body.prompt);
    return { success: true, data: response };
  }

  @Post('analyze-csv')
  async analyzeCsv(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { csvContent: string; filename?: string; prompt?: string }
  ) {
    if (!body.csvContent || !body.csvContent.trim()) {
      throw new BadRequestException('csvContent is required');
    }
    const response = await this.pulseService.analyzeUploadedCsv(
      tenant.orgId,
      body.csvContent,
      body.filename || 'uploaded_data.csv',
      body.prompt
    );
    return { success: true, data: response };
  }
}
