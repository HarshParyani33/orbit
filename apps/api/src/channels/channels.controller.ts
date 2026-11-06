import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ChannelsService } from './channels.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext, ApiResponse } from '@orbit/shared';

@Controller('api/channels')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  async list(@CurrentTenant() tenant: TenantContext): Promise<ApiResponse> {
    const channels = await this.channelsService.listChannels(tenant.orgId);
    return {
      success: true,
      data: channels,
    };
  }

  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { name: string; provider: string; config?: Prisma.InputJsonObject }
  ): Promise<ApiResponse> {
    const channel = await this.channelsService.createChannel(tenant.orgId, body);
    return {
      success: true,
      data: channel,
    };
  }
}
