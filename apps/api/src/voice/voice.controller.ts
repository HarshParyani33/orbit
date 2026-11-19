import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Header,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { VoiceService } from './voice.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext } from '@orbit/shared';

@Controller('api/voice')
export class VoiceController {
  constructor(
    @Inject(VoiceService)
    private readonly voiceService: VoiceService
  ) {}

  @Get('calls')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async getCalls(@CurrentTenant() tenant: TenantContext) {
    const calls = await this.voiceService.getCallSessions(tenant.orgId);
    return { success: true, data: calls };
  }

  @Post('calls/dial')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async dialCall(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { toPhoneNumber: string; agentPersonaName?: string; greetingMessage?: string }
  ) {
    if (!body.toPhoneNumber) {
      throw new BadRequestException('toPhoneNumber is required');
    }
    const session = await this.voiceService.initiateOutboundCall(tenant.orgId, body);
    return { success: true, data: session };
  }

  @Post('calls/:callId/transfer')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async transferCall(
    @CurrentTenant() tenant: TenantContext,
    @Param('callId') callId: string
  ) {
    const result = await this.voiceService.requestHumanTransfer(tenant.orgId, callId);
    return { success: true, data: result };
  }

  @Post('calls/:callId/hangup')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async hangupCall(
    @CurrentTenant() tenant: TenantContext,
    @Param('callId') callId: string
  ) {
    const session = await this.voiceService.hangupCall(tenant.orgId, callId);
    return { success: true, data: session };
  }

  @Post('webhooks/incoming')
  @Header('Content-Type', 'text/xml')
  handleIncomingVoiceWebhook() {
    return this.voiceService.generateTwimlResponse();
  }
}
