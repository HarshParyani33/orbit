import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';
import {
  RegisterInput,
  LoginInput,
} from '@orbit/validation';
import {
  AuthTokenResponse,
  Role,
  OrgStatus,
  UserStatus,
} from '@orbit/shared';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService
  ) {}

  /**
   * User Registration with Argon2id password hashing and automatic default organization
   */
  async register(input: RegisterInput): Promise<{
    response: AuthTokenResponse;
    accessToken: string;
    refreshToken: string;
  }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
    });

    if (existing) {
      throw new ConflictException('An account with this email address already exists');
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
    });

    const user = await this.prisma.user.create({
      data: {
        name: input.name.trim(),
        email: input.email.toLowerCase().trim(),
        passwordHash,
        status: 'ACTIVE',
      },
    });

    // Create default organization if requested, or based on user name
    const orgName = input.organizationName?.trim() || `${user.name}'s Workspace`;
    const baseSlug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'workspace';
    const slug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;

    const org = await this.prisma.organization.create({
      data: {
        name: orgName,
        slug,
        status: 'ACTIVE',
        memberships: {
          create: {
            userId: user.id,
            role: 'OWNER',
            status: 'ACTIVE',
          },
        },
      },
    });

    // Issue tokens
    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    const rawRefreshToken = this.tokenService.generateRefreshToken();
    const tokenHash = this.tokenService.hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      response: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          status: user.status as UserStatus,
          createdAt: user.createdAt.toISOString(),
        },
        organizations: [
          {
            id: org.id,
            name: org.name,
            slug: org.slug,
            status: org.status as OrgStatus,
            role: Role.OWNER,
          },
        ],
        activeOrgId: org.id,
      },
    };
  }

  /**
   * User Login with Argon2id password verification and session issuance
   */
  async login(input: LoginInput): Promise<{
    response: AuthTokenResponse;
    accessToken: string;
    refreshToken: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { organization: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is suspended or deactivated');
    }

    const isMatch = await argon2.verify(user.passwordHash, input.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate tokens
    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    const rawRefreshToken = this.tokenService.generateRefreshToken();
    const tokenHash = this.tokenService.hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const organizations = user.memberships
      .filter((m) => m.organization.status === 'ACTIVE')
      .map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        status: m.organization.status as OrgStatus,
        role: m.role as Role,
      }));

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      response: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          status: user.status as UserStatus,
          createdAt: user.createdAt.toISOString(),
        },
        organizations,
        activeOrgId: organizations[0]?.id,
      },
    };
  }

  /**
   * Refresh Token Rotation with Reuse / Theft Detection
   */
  async refresh(rawRefreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthTokenResponse['user'];
  }> {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      throw new UnauthorizedException('Refresh token is required');
    }

    const tokenHash = this.tokenService.hashToken(rawRefreshToken);

    const session = await this.prisma.userSession.findFirst({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    // THEFT / REUSE DETECTION:
    // If a session has already been revoked or expired, an attacker may be replaying an old token.
    // In accordance with security architecture, revoke all sessions for this family/user immediately!
    if (session.isRevoked || session.expiresAt < new Date()) {
      await this.prisma.userSession.updateMany({
        where: { familyId: session.familyId },
        data: { isRevoked: true },
      });
      throw new UnauthorizedException(
        'Security alert: Attempted reuse of rotated refresh token. All active sessions have been revoked.'
      );
    }

    // Mark current session revoked (consumed by this rotation)
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { isRevoked: true },
    });

    // Issue new token pair under the same session family
    const newAccessToken = this.tokenService.generateAccessToken({
      sub: session.user.id,
      email: session.user.email,
      name: session.user.name,
    });

    const newRawRefreshToken = this.tokenService.generateRefreshToken();
    const newTokenHash = this.tokenService.hashToken(newRawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.userSession.create({
      data: {
        userId: session.user.id,
        tokenHash: newTokenHash,
        familyId: session.familyId,
        expiresAt,
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        status: session.user.status as UserStatus,
        createdAt: session.user.createdAt.toISOString(),
      },
    };
  }

  /**
   * Session Revocation & Logout
   */
  async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) return;

    const tokenHash = this.tokenService.hashToken(rawRefreshToken);
    await this.prisma.userSession.updateMany({
      where: { tokenHash },
      data: { isRevoked: true },
    });
  }

  /**
   * Get Current Authenticated Profile
   */
  async getProfile(userId: string): Promise<AuthTokenResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { organization: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const organizations = user.memberships
      .filter((m) => m.organization.status === 'ACTIVE')
      .map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        status: m.organization.status as OrgStatus,
        role: m.role as Role,
      }));

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status as UserStatus,
        createdAt: user.createdAt.toISOString(),
      },
      organizations,
      activeOrgId: organizations[0]?.id,
    };
  }
}
