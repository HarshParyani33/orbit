import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { BusinessHoursService } from './business-hours.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser, RequestUser } from '../auth/current-user.decorator';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import {
  createOrganizationSchema,
  addMemberSchema,
  updateBusinessHoursSchema,
  CreateOrganizationInput,
  AddMemberInput,
  UpdateBusinessHoursInput,
} from '@orbit/validation';
import { ApiResponse, TenantContext, Role } from '@orbit/shared';

@Controller('api/organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(
    @Inject(OrganizationsService) private readonly orgService: OrganizationsService,
    @Inject(BusinessHoursService) private readonly businessHoursService: BusinessHoursService
  ) {}

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

  @Get(':id/business-hours')
  @UseGuards(TenantGuard)
  async getBusinessHours(
    @Param('id') orgId: string,
    @CurrentTenant() tenant: TenantContext
  ): Promise<ApiResponse> {
    if (orgId !== tenant.orgId) {
      throw new ForbiddenException('Route parameter does not match verified tenant context');
    }
    const schedule = await this.businessHoursService.getBusinessHours(tenant.orgId);
    return {
      success: true,
      data: schedule,
    };
  }

  @Put(':id/business-hours')
  @UseGuards(TenantGuard)
  async updateBusinessHours(
    @Param('id') orgId: string,
    @CurrentTenant() tenant: TenantContext,
    @Body() body: UpdateBusinessHoursInput
  ): Promise<ApiResponse> {
    if (orgId !== tenant.orgId) {
      throw new ForbiddenException('Route parameter does not match verified tenant context');
    }
    if (tenant.role !== Role.OWNER && tenant.role !== Role.ADMIN) {
      throw new ForbiddenException('Only organization owners and admins can configure business hours');
    }
    const validated = updateBusinessHoursSchema.parse(body);
    const updated = await this.businessHoursService.updateBusinessHours(tenant.orgId, validated);
    return {
      success: true,
      data: updated,
    };
  }

  @Get(':id/business-hours/status')
  @UseGuards(TenantGuard)
  async getBusinessHoursStatus(
    @Param('id') orgId: string,
    @CurrentTenant() tenant: TenantContext
  ): Promise<ApiResponse> {
    if (orgId !== tenant.orgId) {
      throw new ForbiddenException('Route parameter does not match verified tenant context');
    }
    const schedule = await this.businessHoursService.getBusinessHours(tenant.orgId);
    const status = this.businessHoursService.isWithinBusinessHours(schedule);
    return {
      success: true,
      data: {
        ...status,
        timezone: schedule.timezone,
        enabled: schedule.enabled,
        outOfHoursMessage: schedule.outOfHoursMessage,
      },
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
