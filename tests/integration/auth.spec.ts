import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { TokenService } from '../../apps/api/src/auth/token.service';
import { AuthService } from '../../apps/api/src/auth/auth.service';
import { OrganizationsService } from '../../apps/api/src/organizations/organizations.service';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@orbit/shared';

describe('Authentication, Session Security & Organization Membership Tests', () => {
  let prisma: PrismaService;
  let tokenService: TokenService;
  let authService: AuthService;
  let orgService: OrganizationsService;

  const testEmail = `test_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  let registeredUserId: string;
  let registeredOrgId: string;
  let initialRefreshToken: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const jwtService = new JwtService({
      secret: process.env.JWT_SECRET || 'dev_jwt_secret_key_minimum_32_characters_for_security_testing',
    });
    tokenService = new TokenService(jwtService);
    authService = new AuthService(prisma, tokenService);
    orgService = new OrganizationsService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Registration & Password Security', () => {
    it('successfully registers new user, hashes password with Argon2id, and creates default organization', async () => {
      const result = await authService.register({
        name: 'Integration Tester',
        email: testEmail,
        password: testPassword,
        organizationName: 'Integration Org',
      });

      expect(result.response.user.email).toBe(testEmail);
      expect(result.response.organizations).toHaveLength(1);
      expect(result.response.organizations[0].role).toBe(Role.OWNER);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();

      registeredUserId = result.response.user.id;
      registeredOrgId = result.response.organizations[0].id;
      initialRefreshToken = result.refreshToken;

      // Verify in DB that raw password is NOT stored (Argon2id verification)
      const userRecord = await prisma.user.findUniqueOrThrow({ where: { id: registeredUserId } });
      expect(userRecord.passwordHash).not.toBe(testPassword);
      expect(userRecord.passwordHash).toMatch(/^\$argon2id\$/);

      // Verify session created in DB
      const session = await prisma.userSession.findFirst({ where: { userId: registeredUserId } });
      expect(session).toBeDefined();
      expect(session?.isRevoked).toBe(false);
    });

    it('rejects duplicate registration with identical email (409 Conflict)', async () => {
      await expect(
        authService.register({
          name: 'Imposter',
          email: testEmail,
          password: testPassword,
        })
      ).rejects.toThrow(/already exists/i);
    });
  });

  describe('2. Login & Credential Verification', () => {
    it('authenticates valid credentials and returns active session', async () => {
      const result = await authService.login({
        email: testEmail,
        password: testPassword,
      });

      expect(result.response.user.id).toBe(registeredUserId);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('rejects invalid password with 401 Unauthorized', async () => {
      await expect(
        authService.login({
          email: testEmail,
          password: 'WrongPassword999!',
        })
      ).rejects.toThrow(/invalid email or password/i);
    });

    it('rejects non-existent email with 401 Unauthorized', async () => {
      await expect(
        authService.login({
          email: 'does_not_exist@example.com',
          password: testPassword,
        })
      ).rejects.toThrow(/invalid email or password/i);
    });
  });

  describe('3. Refresh Token Rotation & Theft Reuse Detection', () => {
    let secondGenerationToken: string;

    it('rotates refresh token: consumes current token and issues new valid pair', async () => {
      const refreshResult = await authService.refresh(initialRefreshToken);

      expect(refreshResult.accessToken).toBeDefined();
      expect(refreshResult.refreshToken).toBeDefined();
      expect(refreshResult.refreshToken).not.toBe(initialRefreshToken);

      secondGenerationToken = refreshResult.refreshToken;

      // Verify original session is marked revoked (consumed)
      const initialTokenHash = tokenService.hashToken(initialRefreshToken);
      const consumedSession = await prisma.userSession.findFirst({ where: { tokenHash: initialTokenHash } });
      expect(consumedSession?.isRevoked).toBe(true);

      // Verify new session is active
      const secondTokenHash = tokenService.hashToken(secondGenerationToken);
      const activeSession = await prisma.userSession.findFirst({ where: { tokenHash: secondTokenHash } });
      expect(activeSession?.isRevoked).toBe(false);
    });

    it('THEFT REUSE DETECTION: presenting already-consumed refresh token triggers emergency family revocation', async () => {
      // Attacker replays initialRefreshToken (which was already rotated)
      await expect(
        authService.refresh(initialRefreshToken)
      ).rejects.toThrow(/security alert.*all active sessions have been revoked/i);

      // Verify that even the legitimate active session (secondGenerationToken) was revoked by theft detection!
      const secondTokenHash = tokenService.hashToken(secondGenerationToken);
      const revokedSession = await prisma.userSession.findFirst({ where: { tokenHash: secondTokenHash } });
      expect(revokedSession?.isRevoked).toBe(true);
    });
  });

  describe('4. Session Revocation & Logout', () => {
    it('revokes session upon logout', async () => {
      // Issue a fresh login
      const loginRes = await authService.login({
        email: testEmail,
        password: testPassword,
      });

      const tokenToLogout = loginRes.refreshToken;
      await authService.logout(tokenToLogout);

      // Verify session is marked revoked
      const tokenHash = tokenService.hashToken(tokenToLogout);
      const session = await prisma.userSession.findFirst({ where: { tokenHash } });
      expect(session?.isRevoked).toBe(true);
    });
  });

  describe('5. Organization Membership & Tenant Authorization', () => {
    it('verifies user cannot access organizations they do not belong to', async () => {
      // Fetch Beta Labs org (which registeredUser does not belong to)
      const betaOrg = await prisma.organization.findUniqueOrThrow({ where: { slug: 'beta' } });

      const membership = await prisma.organizationMembership.findFirst({
        where: {
          userId: registeredUserId,
          organizationId: betaOrg.id,
          status: 'ACTIVE',
        },
      });

      // Proof of membership boundary:
      expect(membership).toBeNull();
    });

    it('allows organization owner to add member and verify role', async () => {
      const inviteeEmail = `invitee_${Date.now()}@example.com`;
      const invitee = await prisma.user.create({
        data: {
          name: 'Invited Colleague',
          email: inviteeEmail,
          passwordHash: 'dummy_hash',
          status: 'ACTIVE',
        },
      });

      const newMembership = await orgService.addMember(registeredUserId, registeredOrgId, {
        email: inviteeEmail,
        role: 'MEMBER',
      });

      expect(newMembership.organizationId).toBe(registeredOrgId);
      expect(newMembership.userId).toBe(invitee.id);
      expect(newMembership.role).toBe('MEMBER');
      expect(newMembership.status).toBe('ACTIVE');
    });

    it('rejects adding member if requester is not OWNER or ADMIN', async () => {
      const nonAdminEmail = `non_admin_${Date.now()}@example.com`;
      const nonAdmin = await prisma.user.create({
        data: {
          name: 'Regular Member',
          email: nonAdminEmail,
          passwordHash: 'dummy_hash',
          status: 'ACTIVE',
        },
      });

      // Add as regular MEMBER
      await prisma.organizationMembership.create({
        data: {
          organizationId: registeredOrgId,
          userId: nonAdmin.id,
          role: 'MEMBER',
          status: 'ACTIVE',
        },
      });

      // Attempting to add member as regular MEMBER throws Forbidden
      await expect(
        orgService.addMember(nonAdmin.id, registeredOrgId, {
          email: 'another@example.com',
          role: 'MEMBER',
        })
      ).rejects.toThrow(/only organization owners and admins/i);
    });
  });
});
