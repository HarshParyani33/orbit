import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '@orbit/shared';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantContext;
  }
);
