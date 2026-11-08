import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Inject,
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

interface LockedSessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  is_revoked: boolean;
  expires_at: Date;
  user_status: string;
  user_email: string;
  user_name: string;
  user_created_at: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenService) private readonly tokenService: TokenService
  ) {}

  /**
   * User Registration wrapped in an atomic database transaction.
   * Creates user, default organization, OWNER membership, and initial session atomically.
   */
  async register(input: RegisterInput): Promise<{
    response: AuthTokenResponse;
    accessToken: string;
    refreshToken: string;
  }> {
    const email = input.email.toLowerCase().trim();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email },
      });

      if (existing) {
        throw new ConflictException('An account with this email address already exists');
      }

      const passwordHash = await argon2.hash(input.password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
      });

      const user = await tx.user.create({
        data: {
          name: input.name.trim(),
          email,
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

      const org = await tx.organization.create({
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

      await tx.userSession.create({
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
    });
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
   * Atomic Refresh Token Rotation with Row Locking (FOR UPDATE) & Concurrency Theft Detection.
   * Guarantees that concurrent requests cannot double-spend a refresh token.
   * If an already-rotated or expired token is presented, all active sessions in the family are revoked.
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

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Acquire row-level lock on the session row
      const rows = await tx.$queryRaw<LockedSessionRow[]>`
        SELECT 
          s.id, 
          s.user_id, 
          s.token_hash, 
          s.family_id, 
          s.is_revoked, 
          s.expires_at,
          u.status AS user_status,
          u.email AS user_email,
          u.name AS user_name,
          u.created_at AS user_created_at
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ${tokenHash}
        FOR UPDATE OF s
      `;

      if (!rows || rows.length === 0) {
        return { error: 'INVALID_SESSION' as const };
      }

      const session = rows[0];

      // 2. SUSPENDED ACCOUNT CHECK:
      // If user account is not active, revoke all sessions and reject immediately
      if (session.user_status !== 'ACTIVE') {
        await tx.userSession.updateMany({
          where: { userId: session.user_id },
          data: { isRevoked: true },
        });
        return { error: 'ACCOUNT_SUSPENDED' as const };
      }

      // 3. THEFT / REUSE DETECTION:
      // If the session has already been revoked or is expired, revoke the entire family!
      // We perform the revocation within the transaction and commit it, then throw after commit.
      if (session.is_revoked || new Date(session.expires_at).getTime() < Date.now()) {
        await tx.userSession.updateMany({
          where: { familyId: session.family_id },
          data: { isRevoked: true },
        });
        return { error: 'THEFT_DETECTED' as const };
      }

      // 4. Mark current session as revoked (consumed by this rotation)
      await tx.userSession.update({
        where: { id: session.id },
        data: { isRevoked: true },
      });

      // 5. Issue new token pair under the same session family
      const newAccessToken = this.tokenService.generateAccessToken({
        sub: session.user_id,
        email: session.user_email,
        name: session.user_name,
      });

      const newRawRefreshToken = this.tokenService.generateRefreshToken();
      const newTokenHash = this.tokenService.hashToken(newRawRefreshToken);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await tx.userSession.create({
        data: {
          userId: session.user_id,
          tokenHash: newTokenHash,
          familyId: session.family_id,
          expiresAt,
        },
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRawRefreshToken,
        user: {
          id: session.user_id,
          email: session.user_email,
          name: session.user_name,
          status: session.user_status as UserStatus,
          createdAt: new Date(session.user_created_at).toISOString(),
        },
      };
    });

    if ('error' in result) {
      if (result.error === 'INVALID_SESSION') {
        throw new UnauthorizedException('Invalid refresh session');
      }
      if (result.error === 'THEFT_DETECTED') {
        throw new UnauthorizedException(
          'Security alert: Attempted reuse of rotated refresh token. All active sessions have been revoked.'
        );
      }
      if (result.error === 'ACCOUNT_SUSPENDED') {
        throw new UnauthorizedException('Account is suspended or deactivated');
      }
    }

    return result;
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

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is suspended or deactivated');
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

  /**
   * Suspend user account and revoke all active sessions immediately
   */
  async suspendUser(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: 'SUSPENDED' },
      });
      await tx.userSession.updateMany({
        where: { userId },
        data: { isRevoked: true },
      });
    });
  }
}
