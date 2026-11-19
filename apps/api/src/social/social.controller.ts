import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { SocialService } from './social.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext } from '@orbit/shared';

@Controller('api/social')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SocialController {
  constructor(
    @Inject(SocialService)
    private readonly socialService: SocialService
  ) {}

  @Get('comments')
  async getComments(
    @CurrentTenant() tenant: TenantContext,
    @Query('status') status?: string,
    @Query('sentiment') sentiment?: string
  ) {
    const comments = await this.socialService.getComments(tenant.orgId, {
      status,
      sentiment,
    });
    return { success: true, data: comments };
  }

  @Post('comments/:id/reply')
  async postReply(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') commentId: string,
    @Body() body: { content: string }
  ) {
    if (!body.content || !body.content.trim()) {
      throw new BadRequestException('Reply content is required');
    }
    const updated = await this.socialService.postPublicReply(
      tenant.orgId,
      commentId,
      body.content,
      'HUMAN'
    );
    return { success: true, data: updated };
  }

  @Post('comments/:id/initiate-dm')
  async initiateDm(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') commentId: string,
    @Body() body: { initialMessage?: string }
  ) {
    const result = await this.socialService.initiateDm(
      tenant.orgId,
      commentId,
      body.initialMessage || 'Hi there! We saw your comment on Instagram and wanted to follow up with you directly.'
    );
    return { success: true, data: result };
  }

  @Post('comments/:id/moderate')
  async moderateComment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') commentId: string,
    @Body() body: { action: 'HIDE' | 'UNHIDE' | 'DELETE' }
  ) {
    if (!body.action || !['HIDE', 'UNHIDE', 'DELETE'].includes(body.action)) {
      throw new BadRequestException('Action must be HIDE, UNHIDE, or DELETE');
    }
    const updated = await this.socialService.moderateComment(tenant.orgId, commentId, body.action);
    return { success: true, data: updated };
  }
}
