import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, BrowserContext } from 'playwright';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/app.config';
import { AuthService } from '../../apps/api/src/auth/auth.service';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';

declare const window: any;
declare const OrbitClient: any;

describe('Project Orbit — Real Multi-Tab Browser Cross-Tab Verification', () => {
  let app: INestApplication;
  let baseUrl: string;
  let authService: AuthService;
  let prisma: PrismaService;

  let browser: Browser;
  let bundlePath: string;

  const chromeExecutable =
    process.env.CHROME_BIN ||
    (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');

  beforeAll(async () => {
    // 1. Programmatically bundle apps/web/src/api/client.ts into standalone browser IIFE
    bundlePath = path.resolve(__dirname, 'orbit-client-bundle.js');
    await esbuild.build({
      entryPoints: [path.resolve(process.cwd(), 'apps/web/src/api/client.ts')],
      bundle: true,
      format: 'iife',
      globalName: 'OrbitClient',
      outfile: bundlePath,
    });

    // 2. Start the real NestJS API server on an ephemeral port
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);

    // Serve test harness page and bundled client directly from the test server
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.get('/test.html', (_req: any, res: any) => {
      res.setHeader('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html>
        <html>
          <head><title>Orbit Real Browser Cross-Tab Test</title></head>
          <body>
            <h1>Project Orbit Real Multi-Tab Verification</h1>
            <script src="/orbit-client-bundle.js"></script>
          </body>
        </html>`);
    });
    expressApp.get('/orbit-client-bundle.js', (_req: any, res: any) => {
      res.sendFile(bundlePath);
    });

    await app.listen(0, '127.0.0.1');
    const port = (app.getHttpServer().address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;
    authService = app.get(AuthService);
    prisma = app.get(PrismaService);

    // 3. Launch real headless Chromium browser
    browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
    });
  }, 30000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (app) {
      await app.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  }, 30000);

  it('Scenario 1: Real Browser Multi-Tab Refresh with Web Locks API serializes execution to exactly ONE network refresh', async () => {
    // Create isolated browser context representing one logged-in browser profile with shared cookies
    const context: BrowserContext = await browser.newContext();

    const testEmail = `browser_m1_${Date.now()}@example.com`;

    // Open Tab 1 and Tab 2 in the same browser context
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto(`${baseUrl}/test.html`);
    await page2.goto(`${baseUrl}/test.html`);

    // Register test user directly from Tab 1 (sets ambient HTTP-only auth cookies in browser context)
    const regResult = await page1.evaluate(
      async ({ email }) => {
        return await OrbitClient.apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Browser User 1',
            email,
            password: 'Password123!',
            organizationName: 'Browser Test Org 1',
          }),
        });
      },
      { email: testEmail }
    );
    expect(regResult).toBeDefined();

    // Set active organization in both tabs
    const orgId = regResult.organizations[0].id;
    await page1.evaluate((id: string) => OrbitClient.setActiveOrgId(id), orgId);
    await page2.evaluate((id: string) => OrbitClient.setActiveOrgId(id), orgId);

    // Verify initial protected request works in Tab 1
    const initialOrgs = await page1.evaluate(() => OrbitClient.apiRequest('/api/organizations'));
    expect(Array.isArray(initialOrgs)).toBe(true);
    expect(initialOrgs.length).toBeGreaterThan(0);

    // Simulate access token expiration by clearing access_token cookie while preserving refresh_token cookie
    const cookies = await context.cookies();
    const refreshTokenCookie = cookies.find((c) => c.name === 'refresh_token');
    expect(refreshTokenCookie).toBeDefined();

    await context.clearCookies({ name: 'access_token' });

    // Track network calls to /api/auth/refresh across both tabs
    let refreshNetworkCalls = 0;
    const countRefresh = (req: any) => {
      if (req.url().includes('/api/auth/refresh') && req.method() === 'POST') {
        refreshNetworkCalls++;
      }
    };
    page1.on('request', countRefresh);
    page2.on('request', countRefresh);

    // SIMULTANEOUS PROTECTED REQUESTS ACROSS TWO INDEPENDENT TABS:
    // Both tabs dispatch /api/organizations simultaneously. Both receive 401 (missing/expired access token).
    // Both tabs trigger cross-tab refresh coordination.
    const [tab1Result, tab2Result] = await Promise.all([
      page1.evaluate(() => OrbitClient.apiRequest('/api/organizations')),
      page2.evaluate(() => OrbitClient.apiRequest('/api/organizations')),
    ]);

    expect(tab1Result).toEqual(initialOrgs);
    expect(tab2Result).toEqual(initialOrgs);

    // CRITICAL INVARIANT: In real multi-tab browser, exactly ONE network call to /api/auth/refresh was executed!
    expect(refreshNetworkCalls).toBe(1);

    // Verify database session family remains healthy: exactly 1 active rotated session, 1 consumed revoked session
    const activeSessions = await prisma.userSession.findMany({
      where: { userId: regResult.user.id, isRevoked: false },
    });
    expect(activeSessions.length).toBe(1);

    const revokedSessions = await prisma.userSession.findMany({
      where: { userId: regResult.user.id, isRevoked: true },
    });
    expect(revokedSessions.length).toBe(1);

    await context.close();
  }, 30000);

  it('Scenario 2: Real Browser Multi-Tab Refresh WITHOUT Web Locks (Tier-2 Fallback) serializes execution to exactly ONE network refresh', async () => {
    const context: BrowserContext = await browser.newContext();

    const testEmail = `browser_fallback_${Date.now()}@example.com`;

    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto(`${baseUrl}/test.html`);
    await page2.goto(`${baseUrl}/test.html`);

    // EXPLICITLY DISABLE Web Locks API in both pages to force Tier-2 Fallback (Two-Phase Election)
    await page1.evaluate(() => {
      delete (window.navigator as any).locks;
    });
    await page2.evaluate(() => {
      delete (window.navigator as any).locks;
    });

    // Register user in Page 1 (sets ambient HTTP-only auth cookies in browser context)
    const regResult = await page1.evaluate(
      async ({ email }) => {
        return await OrbitClient.apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Browser Fallback User',
            email,
            password: 'Password123!',
            organizationName: 'Fallback Test Org',
          }),
        });
      },
      { email: testEmail }
    );

    const orgId = regResult.organizations[0].id;
    await page1.evaluate((id: string) => OrbitClient.setActiveOrgId(id), orgId);
    await page2.evaluate((id: string) => OrbitClient.setActiveOrgId(id), orgId);

    // Expire access token by clearing cookie while retaining refresh_token cookie
    await context.clearCookies({ name: 'access_token' });

    let fallbackRefreshCalls = 0;
    const countFallbackRefresh = (req: any) => {
      if (req.url().includes('/api/auth/refresh') && req.method() === 'POST') {
        fallbackRefreshCalls++;
      }
    };
    page1.on('request', countFallbackRefresh);
    page2.on('request', countFallbackRefresh);

    // SIMULTANEOUS PROTECTED REQUESTS WITH WEB LOCKS DISABLED:
    // Exercises Tier-2 Two-Phase Election in localStorage across real Chrome browser processes
    const [tab1Result, tab2Result] = await Promise.all([
      page1.evaluate(() => OrbitClient.apiRequest('/api/organizations')),
      page2.evaluate(() => OrbitClient.apiRequest('/api/organizations')),
    ]);

    expect(Array.isArray(tab1Result)).toBe(true);
    expect(Array.isArray(tab2Result)).toBe(true);

    // CRITICAL INVARIANT: Fallback two-phase election serialized execution to exactly ONE network refresh!
    expect(fallbackRefreshCalls).toBe(1);

    // Verify session family is healthy in PostgreSQL
    const activeSessions = await prisma.userSession.findMany({
      where: { userId: regResult.user.id, isRevoked: false },
    });
    expect(activeSessions.length).toBe(1);

    const revokedSessions = await prisma.userSession.findMany({
      where: { userId: regResult.user.id, isRevoked: true },
    });
    expect(revokedSessions.length).toBe(1);

    await context.close();
  }, 30000);

  it('Scenario 3: Server Replay Detection Invariant in Real Browser — Replayed Old Token Revokes Session Family', async () => {
    const context: BrowserContext = await browser.newContext();

    const testEmail = `browser_theft_${Date.now()}@example.com`;
    const regResult = await authService.register({
      name: 'Theft Test User',
      email: testEmail,
      password: 'Password123!',
      organizationName: 'Theft Test Org',
    });

    const page = await context.newPage();
    await page.goto(`${baseUrl}/test.html`);

    // Initial refresh token
    const initialRefreshToken = regResult.refreshToken;

    // Rotate token legitimately once (consuming initialRefreshToken)
    const rotateResult = await authService.refresh(initialRefreshToken);
    expect(rotateResult.accessToken).toBeDefined();

    // Now attempt to replay the consumed initialRefreshToken directly from the browser page
    const replayResponse = await page.evaluate(
      async ({ token }) => {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({ refreshToken: token }),
        });
        return {
          status: res.status,
          body: await res.json().catch(() => ({})),
        };
      },
      { token: initialRefreshToken }
    );

    // Invariant: Server returns 401 Unauthorized with theft alert message
    expect(replayResponse.status).toBe(401);
    expect(replayResponse.body.message).toMatch(/Security alert: Attempted reuse of rotated refresh token/i);

    // Invariant: Server revoked ALL sessions in the family in PostgreSQL
    const activeSessionsAfterReplay = await prisma.userSession.findMany({
      where: { userId: regResult.response.user.id, isRevoked: false },
    });
    expect(activeSessionsAfterReplay.length).toBe(0);

    await context.close();
  }, 30000);
});
