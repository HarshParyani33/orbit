import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/app.config';
import { AuthService } from '../../apps/api/src/auth/auth.service';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';

describe('HTTP-Level CORS & CSRF Real Pipeline Integration Tests', () => {
  let app: INestApplication;
  let baseUrl: string;
  let authService: AuthService;
  let prisma: PrismaService;

  const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
  const unauthorizedOrigin = 'https://malicious-attacker.com';

  let validAccessToken: string;
  let validRefreshToken: string;
  let testOrgId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);

    baseUrl = await app.getUrl();
    authService = app.get(AuthService);
    prisma = app.get(PrismaService);

    // Register a test user and obtain legitimate credentials
    const testEmail = `http_test_${Date.now()}@example.com`;
    const regResult = await authService.register({
      name: 'HTTP Pipeline Tester',
      email: testEmail,
      password: 'Password123!',
      organizationName: 'HTTP Test Org',
    });

    validAccessToken = regResult.accessToken;
    validRefreshToken = regResult.refreshToken;
    testOrgId = regResult.response.organizations[0].id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ============================================================================
  // 1. HTTP Preflight (OPTIONS) & CORS Configuration Verification
  // ============================================================================
  describe('1. HTTP Preflight (OPTIONS) & CORS Verification', () => {
    it('allowed origin OPTIONS preflight requesting X-Requested-With succeeds with credentialed CORS headers', async () => {
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'OPTIONS',
        headers: {
          Origin: allowedOrigin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type, x-requested-with',
        },
      });

      // Browser preflights typically return 204 No Content or 200 OK
      expect([200, 204]).toContain(response.status);

      // Verify that CORS middleware permits the allowed origin with credentials
      const allowOrigin = response.headers.get('access-control-allow-origin');
      const allowCredentials = response.headers.get('access-control-allow-credentials');
      const allowHeaders = response.headers.get('access-control-allow-headers') || '';

      expect(allowOrigin).toBe(allowedOrigin);
      expect(allowCredentials).toBe('true');
      expect(allowHeaders.toLowerCase()).toContain('x-requested-with');
    });

    it('unauthorized origin OPTIONS preflight does NOT receive credentialed CORS authorization', async () => {
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'OPTIONS',
        headers: {
          Origin: unauthorizedOrigin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type, x-requested-with',
        },
      });

      // Important: Express CORS middleware does not output Access-Control-Allow-Origin matching the unauthorized origin
      const allowOrigin = response.headers.get('access-control-allow-origin');
      expect(allowOrigin).not.toBe(unauthorizedOrigin);
    });
  });

  // ============================================================================
  // 2. Real HTTP Pipeline CSRF & Mutation Tests
  // ============================================================================
  describe('2. Real HTTP Pipeline CSRF & Mutation Tests', () => {
    it('allowed frontend origin, valid auth cookie, valid custom header succeeds through real pipeline', async () => {
      // Issue a fresh login to get an active refresh token
      const login = await authService.login({
        email: (await prisma.user.findFirst({ where: { memberships: { some: { organizationId: testOrgId } } } }))!.email,
        password: 'Password123!',
      });

      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Origin: allowedOrigin,
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: `refresh_token=${login.refreshToken}`,
          'Content-Type': 'application/json',
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.user).toBeDefined();
    });

    it('unauthorized origin with auth cookie is blocked by CsrfGuard with HTTP 403 Forbidden', async () => {
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Origin: unauthorizedOrigin,
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: `refresh_token=${validRefreshToken}`,
          'Content-Type': 'application/json',
        },
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.message).toMatch(/cross-site request forgery.*blocked.*origin.*not authorized/i);
    });

    it('Sec-Fetch-Site: cross-site on cookie-authenticated mutation is rejected with HTTP 403 Forbidden', async () => {
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Sec-Fetch-Site': 'cross-site',
          Cookie: `refresh_token=${validRefreshToken}`,
          'Content-Type': 'application/json',
        },
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.message).toMatch(/sec-fetch-site is cross-site/i);
    });

    it('missing security context on cookie-authenticated mutation is rejected with HTTP 403 Forbidden', async () => {
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          // No Origin, no Referer, no Sec-Fetch-Site, no custom header
          Cookie: `refresh_token=${validRefreshToken}`,
          'Content-Type': 'application/json',
        },
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.message).toMatch(/missing security context/i);
    });

    it('same-origin legitimate mutation via Sec-Fetch-Site: same-origin is accepted by CsrfGuard', async () => {
      const login = await authService.login({
        email: (await prisma.user.findFirst({ where: { memberships: { some: { organizationId: testOrgId } } } }))!.email,
        password: 'Password123!',
      });

      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Sec-Fetch-Site': 'same-origin',
          Cookie: `refresh_token=${login.refreshToken}`,
          'Content-Type': 'application/json',
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
    });

    it('bearer-token request without ambient auth cookies preserves intended behavior (CsrfGuard bypassed)', async () => {
      // Direct programmatic Bearer request to /api/channels (no cookies attached)
      const response = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validAccessToken}`,
          'X-Organization-Id': testOrgId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'HTTP Test Channel',
          provider: 'WEB_CHAT',
        }),
      });

      // Does NOT fail with CSRF 403; passes through to controller and creates channel
      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('HTTP Test Channel');
    });
  });
});
