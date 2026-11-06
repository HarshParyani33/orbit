import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOrganizationInput,
  AddMemberInput,
} from '@orbit/validation';
import { Role, OrgStatus } from '@orbit/shared';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrganization(userId: string, input: CreateOrganizationInput) {
    const baseSlug = (input.slug || input.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32);

    const existingSlug = await this.prisma.organization.findUnique({
      where: { slug: baseSlug },
    });

    const slug = existingSlug
      ? `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`
      : baseSlug;

    const organization = await this.prisma.organization.create({
      data: {
        name: input.name.trim(),
        slug,
        status: 'ACTIVE',
        memberships: {
          create: {
            userId,
            role: 'OWNER',
            status: 'ACTIVE',
          },
        },
      },
      include: {
        memberships: true,
      },
    });

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status as OrgStatus,
      role: Role.OWNER,
    };
  }

  async getUserOrganizations(userId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        organization: { status: 'ACTIVE' },
      },
      include: {
        organization: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      status: m.organization.status as OrgStatus,
      role: m.role as Role,
      joinedAt: m.createdAt.toISOString(),
    }));
  }

  async getOrganization(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        channels: {
          select: { id: true, name: true, provider: true, status: true },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return org;
  }

  async addMember(currentUserId: string, orgId: string, input: AddMemberInput) {
    // 1. Verify current user has permission (OWNER or ADMIN)
    const currentMembership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId: orgId,
        userId: currentUserId,
        status: 'ACTIVE',
      },
    });

    if (!currentMembership || (currentMembership.role !== 'OWNER' && currentMembership.role !== 'ADMIN')) {
      throw new ForbiddenException('Only organization owners and admins can invite new members');
    }

    // 2. Find target user
    const targetUser = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
    });

    if (!targetUser) {
      throw new NotFoundException('User with specified email address does not exist');
    }

    // 3. Check for existing membership
    const existingMembership = await this.prisma.organizationMembership.findUnique({
      where: {
        uq_membership_org_user: {
          organizationId: orgId,
          userId: targetUser.id,
        },
      },
    });

    if (existingMembership) {
      if (existingMembership.status === 'ACTIVE') {
        throw new ConflictException('User is already an active member of this organization');
      }

      // Re-activate
      return this.prisma.organizationMembership.update({
        where: { id: existingMembership.id },
        data: { status: 'ACTIVE', role: input.role },
      });
    }

    // 4. Create membership
    return this.prisma.organizationMembership.create({
      data: {
        organizationId: orgId,
        userId: targetUser.id,
        role: input.role,
        status: 'ACTIVE',
      },
    });
  }
}
