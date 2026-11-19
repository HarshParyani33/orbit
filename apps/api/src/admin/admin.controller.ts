import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { ApiResponse } from '@orbit/shared';

@Controller('api/admin')
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get('tenants')
  async listTenants(): Promise<ApiResponse> {
    const tenants = await this.adminService.listTenants();
    return {
      success: true,
      data: tenants,
    };
  }

  @Post('tenants/:id/status')
  @HttpCode(HttpStatus.OK)
  async setTenantStatus(
    @Param('id') id: string,
    @Body() body: { status: 'ACTIVE' | 'SUSPENDED'; operatorEmail?: string },
    @Headers('x-operator-email') operatorHeader?: string
  ): Promise<ApiResponse> {
    const operator = body.operatorEmail || operatorHeader || 'harsh@orbit.internal';
    const result = await this.adminService.setTenantStatus(id, body.status, operator);
    return {
      success: true,
      data: result,
    };
  }

  @Post('impersonate')
  @HttpCode(HttpStatus.OK)
  async impersonateTenant(
    @Body() body: { tenantId: string; reason: string; ticketId?: string; operatorEmail?: string },
    @Headers('x-operator-email') operatorHeader?: string
  ): Promise<ApiResponse> {
    const operator = body.operatorEmail || operatorHeader || 'harsh@orbit.internal';
    const session = await this.adminService.createImpersonationSession({
      tenantId: body.tenantId,
      reason: body.reason,
      ticketId: body.ticketId,
      operatorEmail: operator,
    });
    return {
      success: true,
      data: session,
    };
  }

  @Get('gateway/circuit-breakers')
  getCircuitBreakers(): ApiResponse {
    const breakers = this.adminService.getCircuitBreakers();
    return {
      success: true,
      data: breakers,
    };
  }

  @Post('gateway/circuit-breakers/:provider/trip')
  @HttpCode(HttpStatus.OK)
  tripCircuitBreaker(
    @Param('provider') provider: 'OPENAI' | 'GROQ' | 'OPENROUTER',
    @Body() body: { trip: boolean; operatorEmail?: string },
    @Headers('x-operator-email') operatorHeader?: string
  ): ApiResponse {
    const operator = body.operatorEmail || operatorHeader || 'harsh@orbit.internal';
    const result = this.adminService.tripCircuitBreaker(
      provider.toUpperCase() as any,
      body.trip,
      operator
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get('margins')
  async getGrossMargins(): Promise<ApiResponse> {
    const margins = await this.adminService.getGrossMargins();
    return {
      success: true,
      data: margins,
    };
  }

  @Get('audit-logs')
  getAuditLogs(): ApiResponse {
    const logs = this.adminService.getAuditLogs();
    return {
      success: true,
      data: logs,
    };
  }
}
