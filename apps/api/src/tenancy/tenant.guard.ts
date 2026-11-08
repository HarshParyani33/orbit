import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, TenantContext } from '@orbit/shared';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required to access tenant resources');
    }

    // 1. Identify if a route parameter specifies an organization ID
    let routeOrgId: string | undefined;
    if (request.params) {
      if (typeof request.params.orgId === 'string' && request.params.orgId.trim()) {
        routeOrgId = request.params.orgId.trim();
      } else if (typeof request.params.organizationId === 'string' && request.params.organizationId.trim()) {
        routeOrgId = request.params.organizationId.trim();
      } else if (
        typeof request.params.id === 'string' &&
        request.params.id.trim() &&
        (request.baseUrl?.includes('organizations') ||
          request.url?.includes('/organizations') ||
          request.route?.path?.includes('organizations'))
      ) {
        routeOrgId = request.params.id.trim();
      }
    }

    // 2. Identify header, query, or body tenant specifier
    const rawHeaderOrgId =
      request.headers['x-organization-id'] ||
      request.query?.orgId ||
      request.body?.organizationId;
    const headerOrgId = typeof rawHeaderOrgId === 'string' && rawHeaderOrgId.trim() ? rawHeaderOrgId.trim() : undefined;

    // 3. IDOR / Mismatch Prevention: Route parameter takes precedence and MUST match header if both provided
    if (routeOrgId && headerOrgId && routeOrgId !== headerOrgId) {
      throw new ForbiddenException(
        'Mismatched organization context: route parameter does not match X-Organization-ID header'
      );
    }

    let targetOrgId = routeOrgId || headerOrgId;

    // 4. If no explicit organization target, resolve user's primary active membership
    if (!targetOrgId) {
      const defaultMembership = await this.prisma.organizationMembership.findFirst({
        where: {
          userId: user.id,
          status: 'ACTIVE',
          organization: { status: 'ACTIVE' },
          user: { status: 'ACTIVE' },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!defaultMembership) {
        // Distinguish suspended user from non-member
        const userRecord = await this.prisma.user.findUnique({
          where: { id: user.id },
          select: { status: true },
        });

        if (userRecord?.status !== 'ACTIVE') {
          throw new ForbiddenException('User account is suspended or deactivated');
        }

        throw new ForbiddenException('User does not belong to any active organization');
      }

      targetOrgId = defaultMembership.organizationId;
    }

    // 5. Verify active membership and status in target organization
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: user.id,
        organizationId: targetOrgId,
      },
      include: {
        organization: true,
        user: {
          select: { status: true },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: You are not an active member of the requested organization'
      );
    }

    // Enforce suspended user account check
    if (membership.user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is suspended or deactivated');
    }

    // Enforce suspended organization check
    if (membership.organization.status !== 'ACTIVE') {
      throw new ForbiddenException('Organization is suspended or inactive');
    }

    // Enforce active membership status
    if (membership.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Access denied: You are not an active member of the requested organization'
      );
    }

    // 6. Attach trusted tenant context to request
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
