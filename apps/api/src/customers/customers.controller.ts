import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext, ApiResponse } from '@orbit/shared';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
  linkChannelIdentitySchema,
  mergeCustomersSchema,
} from '@orbit/validation';

@Controller('api/customers')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CustomersController {
  constructor(
    @Inject(CustomersService)
    private readonly customersService: CustomersService
  ) {}

  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: unknown
  ): Promise<ApiResponse> {
    const parsed = listCustomersQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid customer query parameters',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const customers = await this.customersService.listCustomers(tenant.orgId, parsed.data);
    return {
      success: true,
      data: customers,
    };
  }

  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown
  ): Promise<ApiResponse> {
    const parsed = createCustomerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid customer input',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const customer = await this.customersService.createCustomer(tenant.orgId, parsed.data);
    return {
      success: true,
      data: customer,
    };
  }

  @Get(':id')
  async get(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') customerId: string
  ): Promise<ApiResponse> {
    const customer = await this.customersService.getCustomer(tenant.orgId, customerId);
    return {
      success: true,
      data: customer,
    };
  }

  @Patch(':id')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') customerId: string,
    @Body() body: unknown
  ): Promise<ApiResponse> {
    const parsed = updateCustomerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid update input',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const customer = await this.customersService.updateCustomer(
      tenant.orgId,
      customerId,
      parsed.data
    );
    return {
      success: true,
      data: customer,
    };
  }

  @Post(':id/identities')
  async linkIdentity(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') customerId: string,
    @Body() body: unknown
  ): Promise<ApiResponse> {
    const parsed = linkChannelIdentitySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid channel identity input',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const identity = await this.customersService.linkChannelIdentity(
      tenant.orgId,
      customerId,
      parsed.data
    );
    return {
      success: true,
      data: identity,
    };
  }

  @Post(':id/merge')
  async merge(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') sourceCustomerId: string,
    @Body() body: unknown,
    @Req() req: any
  ): Promise<ApiResponse> {
    const parsed = mergeCustomersSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid merge parameters',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const userId = req.user?.sub || null;
    const result = await this.customersService.mergeCustomers(
      tenant.orgId,
      sourceCustomerId,
      parsed.data.targetCustomerId,
      userId,
      parsed.data.reason
    );

    return {
      success: true,
      data: result,
    };
  }

  @Get(':id/conversations')
  async getConversations(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') customerId: string
  ): Promise<ApiResponse> {
    const conversations = await this.customersService.getCustomerConversations(
      tenant.orgId,
      customerId
    );
    return {
      success: true,
      data: conversations,
    };
  }
}
