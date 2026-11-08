import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser, RequestUser } from '../auth/current-user.decorator';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import {
  createOrganizationSchema,
  addMemberSchema,
  CreateOrganizationInput,
  AddMemberInput,
} from '@orbit/validation';
import { ApiResponse, TenantContext, Role } from '@orbit/shared';

@Controller('api/organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(@Inject(OrganizationsService) private readonly orgService: OrganizationsService) {}

  @Get()
  async listUserOrganizations(@CurrentUser() user: RequestUser): Promise<ApiResponse> {
    const orgs = await this.orgService.getUserOrganizations(user.id);
    return {
      success: true,
      data: orgs,
    };
  }

  @Post()
  async createOrganization(
    @CurrentUser() user: RequestUser,
    @Body() body: CreateOrganizationInput
  ): Promise<ApiResponse> {
    const validated = createOrganizationSchema.parse(body);
    const org = await this.orgService.createOrganization(user.id, validated);
    return {
      success: true,
      data: org,
    };
  }

  @Get(':id')
  @UseGuards(TenantGuard)
  async getOrganization(
    @Param('id') orgId: string,
    @CurrentTenant() tenant: TenantContext
  ): Promise<ApiResponse> {
    if (orgId !== tenant.orgId) {
      throw new ForbiddenException('Route parameter does not match verified tenant context');
    }
    const org = await this.orgService.getOrganization(tenant.orgId);
    return {
      success: true,
      data: org,
    };
  }

  @Post(':id/members')
  @UseGuards(TenantGuard)
  @HttpCode(HttpStatus.OK)
  async addMember(
    @Param('id') orgId: string,
    @CurrentUser() user: RequestUser,
    @CurrentTenant() tenant: TenantContext,
    @Body() body: AddMemberInput
  ): Promise<ApiResponse> {
    if (orgId !== tenant.orgId) {
      throw new ForbiddenException('Route parameter does not match verified tenant context');
    }
    if (tenant.role !== Role.OWNER && tenant.role !== Role.ADMIN) {
      throw new ForbiddenException('Only organization owners and admins can invite new members');
    }
    const validated = addMemberSchema.parse(body);
    const member = await this.orgService.addMember(user.id, tenant.orgId, validated);
    return {
      success: true,
      data: member,
    };
  }
}
