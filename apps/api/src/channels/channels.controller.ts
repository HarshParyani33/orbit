import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext, ApiResponse } from '@orbit/shared';
import {
  createChannelSchema,
  updateChannelSchema,
  CreateChannelInput,
  UpdateChannelInput,
} from '@orbit/validation';

@Controller('api/channels')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ChannelsController {
  constructor(@Inject(ChannelsService) private readonly channelsService: ChannelsService) {}

  @Get()
  async list(@CurrentTenant() tenant: TenantContext): Promise<ApiResponse> {
    const channels = await this.channelsService.listChannels(tenant.orgId);
    return {
      success: true,
      data: channels,
    };
  }

  @Get(':id')
  async get(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') channelId: string
  ): Promise<ApiResponse> {
    const channel = await this.channelsService.getChannel(tenant.orgId, channelId);
    return {
      success: true,
      data: channel,
    };
  }

  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown
  ): Promise<ApiResponse> {
    const parsed = createChannelSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid channel input',
        details: parsed.error.flatten(),
      });
    }
    const channel = await this.channelsService.createChannel(tenant.orgId, parsed.data as CreateChannelInput);
    return {
      success: true,
      data: channel,
    };
  }

  @Patch(':id')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') channelId: string,
    @Body() body: unknown
  ): Promise<ApiResponse> {
    const parsed = updateChannelSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid channel update input',
        details: parsed.error.flatten(),
      });
    }
    const channel = await this.channelsService.updateChannel(
      tenant.orgId,
      channelId,
      parsed.data as UpdateChannelInput
    );
    return {
      success: true,
      data: channel,
    };
  }

  @Delete(':id')
  async delete(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') channelId: string
  ): Promise<ApiResponse> {
    await this.channelsService.deleteChannel(tenant.orgId, channelId);
    return {
      success: true,
      data: { message: 'Channel deleted successfully' },
    };
  }
}
