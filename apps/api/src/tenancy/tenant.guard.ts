import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, TenantContext } from '@orbit/shared';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required to access tenant resources');
    }

    // Extract requested organization ID from header, query, or body
    const rawOrgId =
      request.headers['x-organization-id'] ||
      request.query?.orgId ||
      request.body?.organizationId;

    let targetOrgId = typeof rawOrgId === 'string' ? rawOrgId.trim() : undefined;

    // If no org specified, select the user's primary active membership
    if (!targetOrgId) {
      const defaultMembership = await this.prisma.organizationMembership.findFirst({
        where: {
          userId: user.id,
          status: 'ACTIVE',
          organization: { status: 'ACTIVE' },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!defaultMembership) {
        throw new ForbiddenException('User does not belong to any active organization');
      }

      targetOrgId = defaultMembership.organizationId;
    }

    // Verify active membership in the target organization
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: user.id,
        organizationId: targetOrgId,
        status: 'ACTIVE',
        organization: { status: 'ACTIVE' },
      },
      include: {
        organization: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: You are not an active member of the requested organization'
      );
    }

    // Attach trusted tenant context to request
    const tenantContext: TenantContext = {
      userId: user.id,
      orgId: membership.organizationId,
      role: membership.role as Role,
      email: user.email,
    };

    request.tenantContext = tenantContext;
    return true;
  }
}
