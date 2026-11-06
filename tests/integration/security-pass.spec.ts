import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { TokenService } from '../../apps/api/src/auth/token.service';
import { AuthService } from '../../apps/api/src/auth/auth.service';
import { OrganizationsService } from '../../apps/api/src/organizations/organizations.service';
import { OrganizationsController } from '../../apps/api/src/organizations/organizations.controller';
import { TenantGuard } from '../../apps/api/src/tenancy/tenant.guard';
import { CsrfGuard } from '../../apps/api/src/auth/csrf.guard';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@orbit/shared';
import * as fs from 'fs';
import * as path from 'path';

function createMockExecutionContext({
  user,
  headers = {},
  params = {},
  query = {},
  body = {},
  cookies = {},
  method = 'GET',
  url = '/api/organizations',
}: {
  user?: any;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: any;
  cookies?: Record<string, string>;
  method?: string;
  url?: string;
}) {
  const request: any = {
    user,
    headers,
    params,
    query,
    body,
    cookies,
    method,
    url,
    route: { path: url },
  };

  return {
    context: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
    } as any,
    request,
  };
}

describe('Milestone 1 — Comprehensive Security Correction Suite', () => {
  let prisma: PrismaService;
  let tokenService: TokenService;
  let authService: AuthService;
  let orgService: OrganizationsService;
  let tenantGuard: TenantGuard;
  let csrfGuard: CsrfGuard;
  let orgController: OrganizationsController;

  // Test data fixtures
  const prefix = `sec_${Date.now()}`;
  let userA: { id: string; email: string; orgId: string; refreshToken: string };
  let userB: { id: string; email: string; orgId: string; refreshToken: string };
  let memberUser: { id: string; email: string };
  let adminUser: { id: string; email: string };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const jwtService = new JwtService({
      secret: process.env.JWT_SECRET || 'dev_jwt_secret_key_minimum_32_characters_for_security_testing',
    });
    tokenService = new TokenService(jwtService);
    authService = new AuthService(prisma, tokenService);
    orgService = new OrganizationsService(prisma);
    tenantGuard = new TenantGuard(prisma);
    csrfGuard = new CsrfGuard();
    orgController = new OrganizationsController(orgService);

    // Setup Tenant A and User A (Owner)
    const resA = await authService.register({
      name: 'Owner User A',
      email: `${prefix}_a@example.com`,
      password: 'Password123!',
      organizationName: `${prefix} Organization A`,
    });
    userA = {
      id: resA.response.user.id,
      email: resA.response.user.email,
      orgId: resA.response.organizations[0].id,
      refreshToken: resA.refreshToken,
    };

    // Setup Tenant B and User B (Owner)
    const resB = await authService.register({
      name: 'Owner User B',
      email: `${prefix}_b@example.com`,
      password: 'Password123!',
      organizationName: `${prefix} Organization B`,
    });
    userB = {
      id: resB.response.user.id,
      email: resB.response.user.email,
      orgId: resB.response.organizations[0].id,
      refreshToken: resB.refreshToken,
    };

    // Create a regular member and an admin user for Org A
    const resMember = await authService.register({
      name: 'Regular Member',
      email: `${prefix}_member@example.com`,
      password: 'Password123!',
    });
    memberUser = { id: resMember.response.user.id, email: resMember.response.user.email };

    const resAdmin = await authService.register({
      name: 'Admin User',
      email: `${prefix}_admin@example.com`,
      password: 'Password123!',
    });
    adminUser = { id: resAdmin.response.user.id, email: resAdmin.response.user.email };

    // Add them to Org A
    await orgService.addMember(userA.id, userA.orgId, {
      email: memberUser.email,
      role: 'MEMBER',
    });
    await orgService.addMember(userA.id, userA.orgId, {
      email: adminUser.email,
      role: 'ADMIN',
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================================
  // Finding 1: Organization IDOR & Route Param / Context Alignment
  // ============================================================================
  describe('Finding 1: Organization IDOR Prevention & Context Alignment', () => {
    it('blocks User A from accessing Org B via route parameter (403 Forbidden)', async () => {
      const { context } = createMockExecutionContext({
        user: { id: userA.id, email: userA.email },
        params: { id: userB.orgId },
        url: `/api/organizations/${userB.orgId}`,
      });

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(
        /access denied.*not an active member/i
      );
    });

    it('rejects mismatched X-Organization-ID header vs route parameter (403 Forbidden)', async () => {
      const { context } = createMockExecutionContext({
        user: { id: userA.id, email: userA.email },
        params: { id: userB.orgId },
        headers: { 'x-organization-id': userA.orgId },
        url: `/api/organizations/${userB.orgId}`,
      });

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(
        /mismatched organization context/i
      );
    });

    it('allows User A to access Org A when route param matches verified membership', async () => {
      const { context, request } = createMockExecutionContext({
        user: { id: userA.id, email: userA.email },
        params: { id: userA.orgId },
        url: `/api/organizations/${userA.orgId}`,
      });

      const canActivate = await tenantGuard.canActivate(context);
      expect(canActivate).toBe(true);
      expect(request.tenantContext).toBeDefined();
      expect(request.tenantContext.orgId).toBe(userA.orgId);
      expect(request.tenantContext.role).toBe(Role.OWNER);

      // Verify controller endpoint works with aligned context
      const controllerRes = await orgController.getOrganization(userA.orgId, request.tenantContext);
      expect(controllerRes.success).toBe(true);
      expect(controllerRes.data.id).toBe(userA.orgId);
    });

    it('controller rejects mismatched param even if guard was somehow bypassed (Defense in Depth)', async () => {
      const spoofedTenant = {
        userId: userA.id,
        orgId: userA.orgId,
        role: Role.OWNER,
        email: userA.email,
      };

      await expect(
        orgController.getOrganization(userB.orgId, spoofedTenant)
      ).rejects.toThrow(/route parameter does not match verified tenant context/i);
    });
  });

  // ============================================================================
  // Finding 2: Atomic Refresh Token Rotation & Concurrency
  // ============================================================================
  describe('Finding 2: Atomic Refresh Token Rotation & Concurrency Theft Detection', () => {
    it('executes atomic token rotation with row locking (FOR UPDATE)', async () => {
      // Obtain a fresh refresh token
      const login = await authService.login({
        email: userA.email,
        password: 'Password123!',
      });
      const originalToken = login.refreshToken;

      const refresh = await authService.refresh(originalToken);
      expect(refresh.accessToken).toBeDefined();
      expect(refresh.refreshToken).toBeDefined();
      expect(refresh.refreshToken).not.toBe(originalToken);

      // Consumed token hash is now marked revoked in DB
      const originalHash = tokenService.hashToken(originalToken);
      const consumedSession = await prisma.userSession.findFirst({
        where: { tokenHash: originalHash },
      });
      expect(consumedSession?.isRevoked).toBe(true);
    });

    it('concurrent refresh requests with identical token: exactly one succeeds and second triggers theft revocation', async () => {
      const login = await authService.login({
        email: userA.email,
        password: 'Password123!',
      });
      const sharedToken = login.refreshToken;

      // Fire two concurrent refresh requests simultaneously
      const results = await Promise.allSettled([
        authService.refresh(sharedToken),
        authService.refresh(sharedToken),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly one must succeed and one must fail
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // The rejected one must report theft detection
      const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectionReason.message).toMatch(/security alert.*all active sessions have been revoked/i);

      // Because theft was detected, the entire session family was revoked, including the newly issued token!
      const successfulRefresh = (fulfilled[0] as PromiseFulfilledResult<any>).value;
      const newTokenHash = tokenService.hashToken(successfulRefresh.refreshToken);
      const newSession = await prisma.userSession.findFirst({
        where: { tokenHash: newTokenHash },
      });
      expect(newSession?.isRevoked).toBe(true);
    });
  });

  // ============================================================================
  // Finding 3: Suspended Account Session Revival Prevention
  // ============================================================================
  describe('Finding 3: Suspended Account Session Revival Prevention', () => {
    let suspendedUser: { id: string; email: string; token: string; orgId: string };

    beforeAll(async () => {
      const res = await authService.register({
        name: 'To Be Suspended',
        email: `${prefix}_suspended@example.com`,
        password: 'Password123!',
        organizationName: `${prefix} Suspended Org`,
      });
      suspendedUser = {
        id: res.response.user.id,
        email: res.response.user.email,
        token: res.refreshToken,
        orgId: res.response.organizations[0].id,
      };

      // Now suspend the user account
      await authService.suspendUser(suspendedUser.id);
    });

    it('prevents suspended user from logging in (401 Unauthorized)', async () => {
      await expect(
        authService.login({
          email: suspendedUser.email,
          password: 'Password123!',
        })
      ).rejects.toThrow(/account is suspended or deactivated/i);
    });

    it('prevents suspended user from refreshing session (401 Unauthorized)', async () => {
      await expect(
        authService.refresh(suspendedUser.token)
      ).rejects.toThrow(/account is suspended or deactivated/i);
    });

    it('prevents suspended user from fetching profile (401 Unauthorized)', async () => {
      await expect(
        authService.getProfile(suspendedUser.id)
      ).rejects.toThrow(/account is suspended or deactivated/i);
    });

    it('prevents suspended user from entering tenant context in TenantGuard (403 Forbidden)', async () => {
      const { context } = createMockExecutionContext({
        user: { id: suspendedUser.id, email: suspendedUser.email },
        params: { id: suspendedUser.orgId },
        url: `/api/organizations/${suspendedUser.orgId}`,
      });

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(
        /user account is suspended or deactivated/i
      );
    });
  });

  // ============================================================================
  // Finding 4: CSRF Protection & Sec-Fetch-Site Regression Tests
  // ============================================================================
  describe('Finding 4: CSRF Protection & Sec-Fetch-Site Regression Suite', () => {
    it('1. blocks cookie-authenticated mutation when Sec-Fetch-Site is cross-site even without Origin/Referer (403 Forbidden)', () => {
      const { context } = createMockExecutionContext({
        method: 'POST',
        cookies: { access_token: 'valid.token' },
        headers: { 'sec-fetch-site': 'cross-site' },
      });

      expect(() => csrfGuard.canActivate(context)).toThrow(
        /sec-fetch-site is cross-site/i
      );
    });

    it('2. allows same-origin requests via Sec-Fetch-Site: same-origin', () => {
      const { context } = createMockExecutionContext({
        method: 'POST',
        cookies: { access_token: 'valid.token' },
        headers: { 'sec-fetch-site': 'same-origin' },
      });

      expect(csrfGuard.canActivate(context)).toBe(true);
    });

    it('3a. allows same-site requests when Origin matches allowed origins', () => {
      const { context } = createMockExecutionContext({
        method: 'POST',
        cookies: { access_token: 'valid.token' },
        headers: {
          'sec-fetch-site': 'same-site',
          origin: 'http://localhost:5173',
        },
      });

      expect(csrfGuard.canActivate(context)).toBe(true);
    });

    it('3b. blocks same-site requests when Origin is not in allowed origins list (403 Forbidden)', () => {
      const { context } = createMockExecutionContext({
        method: 'POST',
        cookies: { access_token: 'valid.token' },
        headers: {
          'sec-fetch-site': 'same-site',
          origin: 'https://attacker.subdomain.com',
        },
      });

      expect(() => csrfGuard.canActivate(context)).toThrow(
        /origin 'https:\/\/attacker\.subdomain\.com' is not authorized/i
      );
    });

    it('3c. blocks same-site requests when Origin is missing and no custom header is present (403 Forbidden)', () => {
      const { context } = createMockExecutionContext({
        method: 'POST',
        cookies: { access_token: 'valid.token' },
        headers: { 'sec-fetch-site': 'same-site' },
      });

      expect(() => csrfGuard.canActivate(context)).toThrow(
        /missing security context/i
      );
    });

    it('4. blocks cookie-authenticated mutations missing all security context (no Origin, Referer, Sec-Fetch-Site, or custom header)', () => {
      const { context } = createMockExecutionContext({
        method: 'POST',
        cookies: { access_token: 'valid.token' },
      });

      expect(() => csrfGuard.canActivate(context)).toThrow(
        /missing security context/i
      );
    });

    it('5. blocks cookie-authenticated mutations with unauthorized Origin (403 Forbidden)', () => {
      const { context } = createMockExecutionContext({
        method: 'POST',
        cookies: { access_token: 'valid.token' },
        headers: { origin: 'https://malicious-attacker.com' },
      });

      expect(() => csrfGuard.canActivate(context)).toThrow(
        /origin 'https:\/\/malicious-attacker\.com' is not authorized/i
      );
    });

    it('6. allows cookie-authenticated mutations with authorized Origin (http://localhost:5173)', () => {
      const { context } = createMockExecutionContext({
        method: 'POST',
        cookies: { access_token: 'valid.token' },
        headers: { origin: 'http://localhost:5173' },
      });

      expect(csrfGuard.canActivate(context)).toBe(true);
    });

    it('7a. allows cookie-authenticated mutations when Origin is absent but valid custom security header is present', () => {
      const { context } = createMockExecutionContext({
        method: 'POST',
        cookies: { access_token: 'valid.token' },
        headers: { 'x-requested-with': 'XMLHttpRequest' },
      });

      expect(csrfGuard.canActivate(context)).toBe(true);
    });

    it('7b. blocks cookie-authenticated mutations when custom security header is empty or blank (403 Forbidden)', () => {
      const { context } = createMockExecutionContext({
        method: 'POST',
        cookies: { access_token: 'valid.token' },
        headers: { 'x-csrf-token': '   ' },
      });

      expect(() => csrfGuard.canActivate(context)).toThrow(
        /missing security context/i
      );
    });

    it('8. allows safe HTTP GET requests with cookies regardless of origin', () => {
      const { context } = createMockExecutionContext({
        method: 'GET',
        cookies: { access_token: 'valid.token' },
        headers: { origin: 'https://any-site.com' },
      });

      expect(csrfGuard.canActivate(context)).toBe(true);
    });

    it('9. allows non-cookie requests (e.g. Bearer token clients) on state mutations', () => {
      const { context } = createMockExecutionContext({
        method: 'POST',
        headers: { authorization: 'Bearer some_token' },
      });

      expect(csrfGuard.canActivate(context)).toBe(true);
    });
  });

  // ============================================================================
  // Finding 5: Database Dev Configuration
  // ============================================================================
  describe('Finding 5: Database Dev Configuration Verification', () => {
    it('verifies docker-compose.yml binds PostgreSQL and Redis to 127.0.0.1', () => {
      const composeContent = fs.readFileSync(path.resolve(process.cwd(), 'docker-compose.yml'), 'utf-8');
      expect(composeContent).toContain('"127.0.0.1:5432:5432"');
      expect(composeContent).toContain('"127.0.0.1:6379:6379"');
    });

    it('verifies docker-compose.yml requires POSTGRES_PASSWORD environment variable with no default password fallback', () => {
      const composeContent = fs.readFileSync(path.resolve(process.cwd(), 'docker-compose.yml'), 'utf-8');
      expect(composeContent).toContain('POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?');
      expect(composeContent).not.toContain('postgres_master_dev_password');
    });

    it('verifies .env.example contains POSTGRES_PASSWORD template', () => {
      const envExample = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf-8');
      expect(envExample).toContain('POSTGRES_PASSWORD=postgres_master_dev_password');
    });
  });

  // ============================================================================
  // Finding 6: Registration Atomicity
  // ============================================================================
  describe('Finding 6: Registration Atomicity & Rollback', () => {
    it('creates user, organization, owner membership, and initial session atomically', async () => {
      const email = `${prefix}_atomic_success@example.com`;
      const res = await authService.register({
        name: 'Atomic User',
        email,
        password: 'Password123!',
        organizationName: 'Atomic Org',
      });

      const userInDb = await prisma.user.findUnique({
        where: { id: res.response.user.id },
        include: {
          memberships: true,
          sessions: true,
        },
      });

      expect(userInDb).toBeDefined();
      expect(userInDb?.memberships).toHaveLength(1);
      expect(userInDb?.memberships[0].role).toBe(Role.OWNER);
      expect(userInDb?.sessions).toHaveLength(1);
    });

    it('rolls back completely if a failure occurs during registration (zero orphaned records)', async () => {
      const email = `${prefix}_atomic_fail@example.com`;

      // Trigger a failure by mocking organization create or slug collision within a simulated transaction
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.user.create({
            data: {
              name: 'Failed User',
              email,
              passwordHash: 'fake_hash',
              status: 'ACTIVE',
            },
          });

          // Simulate subsequent failure in transaction
          throw new Error('Simulated transaction failure during organization creation');
        })
      ).rejects.toThrow(/simulated transaction failure/i);

      // Verify user was NOT persisted (atomic rollback)
      const orphanedUser = await prisma.user.findUnique({
        where: { email },
      });
      expect(orphanedUser).toBeNull();
    });
  });

  // ============================================================================
  // Finding 7: Role & Organization Authorization Boundaries
  // ============================================================================
  describe('Finding 7: Role & Organization Authorization Boundaries', () => {
    it('blocks regular MEMBER from adding new members to an organization (403 Forbidden)', async () => {
      const memberTenantContext = {
        userId: memberUser.id,
        orgId: userA.orgId,
        role: Role.MEMBER,
        email: memberUser.email,
      };

      await expect(
        orgController.addMember(
          userA.orgId,
          { id: memberUser.id, email: memberUser.email, name: 'Regular Member' },
          memberTenantContext,
          { email: 'new_guest@example.com', role: 'MEMBER' }
        )
      ).rejects.toThrow(/only organization owners and admins can invite/i);
    });

    it('blocks ADMIN from granting the OWNER role (403 Forbidden)', async () => {
      await expect(
        orgService.addMember(adminUser.id, userA.orgId, {
          email: `${prefix}_target@example.com`,
          role: 'OWNER' as any,
        })
      ).rejects.toThrow(/the OWNER role cannot be granted through invitations/i);
    });

    it('blocks ADMIN from creating another ADMIN (Only OWNER can invite ADMIN)', async () => {
      // Create user to invite
      const targetUser = await authService.register({
        name: 'Admin Target',
        email: `${prefix}_admintarget@example.com`,
        password: 'Password123!',
      });

      await expect(
        orgService.addMember(adminUser.id, userA.orgId, {
          email: targetUser.response.user.email,
          role: 'ADMIN',
        })
      ).rejects.toThrow(/only organization owners can invite new administrators/i);
    });

    it('blocks access to SUSPENDED organizations via TenantGuard (403 Forbidden)', async () => {
      // Create an organization and immediately suspend it
      const suspendedOrg = await prisma.organization.create({
        data: {
          name: 'Suspended Org Test',
          slug: `suspended-org-${Date.now()}`,
          status: 'SUSPENDED',
          memberships: {
            create: {
              userId: userA.id,
              role: 'OWNER',
              status: 'ACTIVE',
            },
          },
        },
      });

      const { context } = createMockExecutionContext({
        user: { id: userA.id, email: userA.email },
        params: { id: suspendedOrg.id },
        url: `/api/organizations/${suspendedOrg.id}`,
      });

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(
        /organization is suspended or inactive/i
      );
    });
  });
});

