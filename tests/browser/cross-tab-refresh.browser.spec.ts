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

function findSystemBrowser(): string | undefined {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  const candidatePaths = [
    // Windows Chrome & Edge
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    // Linux Chrome & Chromium
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    // macOS Chrome & Edge
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

describe('Project Orbit — Real Multi-Tab Browser Cross-Tab Verification', () => {
  let app: INestApplication;
  let baseUrl: string;
  let authService: AuthService;
  let prisma: PrismaService;

  let browser: Browser;
  let bundlePath: string;

  const browserPath = findSystemBrowser();

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
    const launchOptions: any = { headless: true };
    if (browserPath) {
      launchOptions.executablePath = browserPath;
    }

    try {
      browser = await chromium.launch(launchOptions);
    } catch (err: any) {
      throw new Error(
        `Failed to launch browser executable (${browserPath || 'default'}). Ensure Google Chrome or Chromium is installed or run 'npx playwright install chromium'. Details: ${err.message}`
      );
    }
  }, 45000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (app) {
      await app.close();
    }
    if (prisma) {
      try {
        await prisma.userSession.deleteMany({
          where: { user: { email: { contains: 'browser_' } } },
        });
        await prisma.organizationMembership.deleteMany({
          where: { user: { email: { contains: 'browser_' } } },
        });
        await prisma.organization.deleteMany({
          where: { slug: { contains: 'browser-' } },
        });
        await prisma.user.deleteMany({
          where: { email: { contains: 'browser_' } },
        });
      } catch { }
      await prisma.$disconnect();
    }
    if (bundlePath && fs.existsSync(bundlePath)) {
      try {
        fs.unlinkSync(bundlePath);
      } catch { }
    }
  }, 30000);

  it('Scenario 1: Real Browser Multi-Tab Refresh with Web Locks API serializes execution to exactly ONE network refresh', async () => {
    const context: BrowserContext = await browser.newContext();
    const testEmail = `browser_m1_${Date.now()}@example.com`;

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

    const orgId = regResult.organizations[0].id;
    await page1.evaluate((id: string) => OrbitClient.setActiveOrgId(id), orgId);
    await page2.evaluate((id: string) => OrbitClient.setActiveOrgId(id), orgId);

    // Initial protected request works
    const initialOrgs = await page1.evaluate(() => OrbitClient.apiRequest('/api/organizations'));
    expect(Array.isArray(initialOrgs)).toBe(true);
    expect(initialOrgs.length).toBeGreaterThan(0);

    // Expire access token by clearing access_token cookie while preserving refresh_token cookie
    await context.clearCookies({ name: 'access_token' });

    let refreshNetworkCalls = 0;
    const countRefresh = (req: any) => {
      if (req.url().includes('/api/auth/refresh') && req.method() === 'POST') {
        refreshNetworkCalls++;
      }
    };
    page1.on('request', countRefresh);
    page2.on('request', countRefresh);

    // SIMULTANEOUS PROTECTED REQUESTS ACROSS TWO INDEPENDENT TABS:
    const [tab1Result, tab2Result] = await Promise.all([
      page1.evaluate(() => OrbitClient.apiRequest('/api/organizations')),
      page2.evaluate(() => OrbitClient.apiRequest('/api/organizations')),
    ]);

    expect(tab1Result).toEqual(initialOrgs);
    expect(tab2Result).toEqual(initialOrgs);

    // CRITICAL: Exactly ONE network call to /api/auth/refresh was executed!
    expect(refreshNetworkCalls).toBe(1);

    // Verify session family is healthy: 1 active rotated session, 1 consumed revoked session
    const activeSessions = await prisma.userSession.findMany({
      where: { userId: regResult.user.id, isRevoked: false },
    });
    expect(activeSessions.length).toBe(1);

    await context.close();
  }, 30000);

  it('Scenario 2: Fail-Closed Safety in Real Browser when Web Locks API is unavailable', async () => {
    const context: BrowserContext = await browser.newContext();
    const testEmail = `browser_failclosed_${Date.now()}@example.com`;

    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto(`${baseUrl}/test.html`);
    await page2.goto(`${baseUrl}/test.html`);

    // Explicitly disable navigator.locks in both pages to simulate an unsupported context
    await page1.evaluate(() => {
      Object.defineProperty(window.Navigator.prototype, 'locks', {
        get: () => undefined,
        configurable: true,
      });
    });
    await page2.evaluate(() => {
      Object.defineProperty(window.Navigator.prototype, 'locks', {
        get: () => undefined,
        configurable: true,
      });
    });

    // Register user
    const regResult = await page1.evaluate(
      async ({ email }) => {
        return await OrbitClient.apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Fail Closed User',
            email,
            password: 'Password123!',
            organizationName: 'Fail Closed Org',
          }),
        });
      },
      { email: testEmail }
    );

    const orgId = regResult.organizations[0].id;
    await page1.evaluate((id: string) => OrbitClient.setActiveOrgId(id), orgId);
    await page2.evaluate((id: string) => OrbitClient.setActiveOrgId(id), orgId);

    // Clear access token
    await context.clearCookies({ name: 'access_token' });

    let refreshAttempts = 0;
    const countRefresh = (req: any) => {
      if (req.url().includes('/api/auth/refresh') && req.method() === 'POST') {
        refreshAttempts++;
      }
    };
    page1.on('request', countRefresh);
    page2.on('request', countRefresh);

    // Both pages attempt requests without Web Locks:
    // Invariant: Both must fail closed safely without making uncoordinated refresh calls
    const results = await Promise.allSettled([
      page1.evaluate(() => OrbitClient.apiRequest('/api/organizations')),
      page2.evaluate(() => OrbitClient.apiRequest('/api/organizations')),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');

    // Invariant: ZERO uncoordinated network refreshes occurred!
    expect(refreshAttempts).toBe(0);

    // Invariant: Session family in database was NOT destroyed by a token race
    const activeSessions = await prisma.userSession.findMany({
      where: { userId: regResult.user.id, isRevoked: false },
    });
    expect(activeSessions.length).toBe(1);

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

    const initialRefreshToken = regResult.refreshToken;

    // Rotate token legitimately once
    const rotateResult = await authService.refresh(initialRefreshToken);
    expect(rotateResult.accessToken).toBeDefined();

    // Now replay the consumed initialRefreshToken directly from the browser page
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

  it('Scenario 4: Multi-Trial Concurrent Stress Test — 10 Repeated Trials across 3 Simultaneous Tabs', async () => {
    const context: BrowserContext = await browser.newContext();
    const testEmail = `browser_stress_${Date.now()}@example.com`;

    const page1 = await context.newPage();
    const page2 = await context.newPage();
    const page3 = await context.newPage();

    await page1.goto(`${baseUrl}/test.html`);
    await page2.goto(`${baseUrl}/test.html`);
    await page3.goto(`${baseUrl}/test.html`);

    const regResult = await page1.evaluate(
      async ({ email }) => {
        return await OrbitClient.apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Stress Test User',
            email,
            password: 'Password123!',
            organizationName: 'Stress Test Org',
          }),
        });
      },
      { email: testEmail }
    );

    const orgId = regResult.organizations[0].id;
    const userId = regResult.user.id;
    await page1.evaluate(
      ({ id, uId }: any) => {
        OrbitClient.setActiveOrgId(id);
        OrbitClient.setActiveUserId(uId);
      },
      { id: orgId, uId: userId }
    );
    await page2.evaluate(
      ({ id, uId }: any) => {
        OrbitClient.setActiveOrgId(id);
        OrbitClient.setActiveUserId(uId);
      },
      { id: orgId, uId: userId }
    );
    await page3.evaluate(
      ({ id, uId }: any) => {
        OrbitClient.setActiveOrgId(id);
        OrbitClient.setActiveUserId(uId);
      },
      { id: orgId, uId: userId }
    );

    // Run 10 consecutive trials of simultaneous 3-tab 401 refresh cycles
    const totalTrials = 10;
    let totalRefreshCalls = 0;

    const countReq = (req: any) => {
      if (req.url().includes('/api/auth/refresh') && req.method() === 'POST') {
        totalRefreshCalls++;
      }
    };
    page1.on('request', countReq);
    page2.on('request', countReq);
    page3.on('request', countReq);

    for (let trial = 1; trial <= totalTrials; trial++) {
      // Pause between trials to ensure all asynchronous promise resolutions and CDP events complete
      await new Promise((r) => setTimeout(r, 300));

      // Clear access token before each trial to force 401
      await context.clearCookies({ name: 'access_token' });
      const beforeCount = totalRefreshCalls;

      // Dispatch simultaneous protected requests across all 3 tabs
      const [r1, r2, r3] = await Promise.all([
        page1.evaluate(() => OrbitClient.apiRequest('/api/organizations')),
        page2.evaluate(() => OrbitClient.apiRequest('/api/organizations')),
        page3.evaluate(() => OrbitClient.apiRequest('/api/organizations')),
      ]);

      expect(Array.isArray(r1)).toBe(true);
      expect(Array.isArray(r2)).toBe(true);
      expect(Array.isArray(r3)).toBe(true);

      // Invariant: In every trial, exactly ONE refresh call was made across all 3 tabs
      const trialRefreshCalls = totalRefreshCalls - beforeCount;
      expect(trialRefreshCalls).toBe(1);
    }

    // Total refresh calls across all 10 trials MUST equal exactly 10
    expect(totalRefreshCalls).toBe(totalTrials);

    // Verify session family is healthy: exactly 1 active session, 10 rotated sessions
    const activeSessions = await prisma.userSession.findMany({
      where: { userId: regResult.user.id, isRevoked: false },
    });
    expect(activeSessions.length).toBe(1);

    const revokedSessions = await prisma.userSession.findMany({
      where: { userId: regResult.user.id, isRevoked: true },
    });
    expect(revokedSessions.length).toBe(totalTrials);

    await context.close();
  }, 60000);

  it('Scenario 5: Tab Closure During Lock Acquisition cleanly releases lock to sibling tab', async () => {
    const context: BrowserContext = await browser.newContext();
    const testEmail = `browser_tabclose_${Date.now()}@example.com`;

    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto(`${baseUrl}/test.html`);
    await page2.goto(`${baseUrl}/test.html`);

    const regResult = await page1.evaluate(
      async ({ email }) => {
        return await OrbitClient.apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Tab Close User',
            email,
            password: 'Password123!',
            organizationName: 'Tab Close Org',
          }),
        });
      },
      { email: testEmail }
    );

    const orgId = regResult.organizations[0].id;
    await page1.evaluate((id: string) => OrbitClient.setActiveOrgId(id), orgId);
    await page2.evaluate((id: string) => OrbitClient.setActiveOrgId(id), orgId);

    // Clear access token
    await context.clearCookies({ name: 'access_token' });

    // Page 1 acquires lock and then abruptly closes before finishing
    await page1.evaluate(async () => {
      // Hold lock artificially
      (window as any).lockHolder = navigator.locks.request('orbit_auth_refresh_lock', async () => {
        await new Promise((r) => setTimeout(r, 10000));
      });
    });

    // Page 2 initiates request while lock is held by Page 1
    const page2Promise = page2.evaluate(() => OrbitClient.apiRequest('/api/organizations'));

    // Abruptly close Page 1 (simulating crashed or closed tab)
    await page1.close();

    // Invariant: Browser engine automatically releases lock on page closure; Page 2 acquires lock and recovers!
    const page2Result = await page2Promise;
    expect(Array.isArray(page2Result)).toBe(true);

    await context.close();
  }, 30000);

  it('Scenario 6: Real Browser Cross-Tab Account Switch Invariant — Stale tab does not reuse new user credentials', async () => {
    const context: BrowserContext = await browser.newContext();
    const emailA = `browser_userA_${Date.now()}@example.com`;
    const emailB = `browser_userB_${Date.now()}@example.com`;

    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto(`${baseUrl}/test.html`);
    await page2.goto(`${baseUrl}/test.html`);

    // Tab 1 registers and logs in as User A
    const regA = await page1.evaluate(
      async ({ email }) => {
        return await OrbitClient.apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name: 'User A',
            email,
            password: 'Password123!',
            organizationName: 'Org A',
          }),
        });
      },
      { email: emailA }
    );

    // Tab 2 adopts User A
    await page2.evaluate(
      ({ userId, orgId }: any) => {
        OrbitClient.setActiveUserId(userId);
        OrbitClient.setActiveOrgId(orgId);
      },
      { userId: regA.user.id, orgId: regA.organizations[0].id }
    );

    // Tab 1 logs out and registers as User B
    await page1.evaluate(async () => {
      await OrbitClient.apiRequest('/api/auth/logout', { method: 'POST' });
    });

    const regB = await page1.evaluate(
      async ({ email }) => {
        return await OrbitClient.apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name: 'User B',
            email,
            password: 'Password123!',
            organizationName: 'Org B',
          }),
        });
      },
      { email: emailB }
    );

    expect(regB.user.id).not.toBe(regA.user.id);

    // Now in Tab 2 (which is still configured with User A's identity):
    // Force a 401 by clearing access token
    await context.clearCookies({ name: 'access_token' });

    // Tab 2 makes a request:
    // Invariant: Tab 2 MUST NOT reuse User B's rotated session! Tab 2 must fail closed safely!
    const tab2Result = await page2.evaluate(async () => {
      try {
        await OrbitClient.apiRequest('/api/organizations');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    expect(tab2Result.success).toBe(false);
    expect(tab2Result.error).toMatch(/Session expired or revoked/i);

    await context.close();
  }, 30000);

  it('Scenario 7: Real Browser Cross-Tab Logout Propagation — Logout in Tab 1 immediately invalidates Tab 2', async () => {
    const context: BrowserContext = await browser.newContext();
    const testEmail = `browser_logout_${Date.now()}@example.com`;

    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto(`${baseUrl}/test.html`);
    await page2.goto(`${baseUrl}/test.html`);

    const reg = await page1.evaluate(
      async ({ email }) => {
        return await OrbitClient.apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Logout User',
            email,
            password: 'Password123!',
            organizationName: 'Logout Org',
          }),
        });
      },
      { email: testEmail }
    );

    await page2.evaluate(
      ({ userId, orgId }: any) => {
        OrbitClient.setActiveUserId(userId);
        OrbitClient.setActiveOrgId(orgId);
      },
      { userId: reg.user.id, orgId: reg.organizations[0].id }
    );

    // Tab 1 logs out
    await page1.evaluate(async () => {
      await OrbitClient.apiRequest('/api/auth/logout', { method: 'POST' });
    });

    // Give broadcast channel 60ms to deliver event
    await new Promise((r) => setTimeout(r, 60));

    // Invariant: Tab 2 should now reject requests immediately without attempting token refresh
    const page2Result = await page2.evaluate(async () => {
      try {
        await OrbitClient.apiRequest('/api/organizations');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    expect(page2Result.success).toBe(false);
    expect(page2Result.error).toMatch(/Session expired or revoked/i);

    await context.close();
  }, 30000);

  it('Scenario 8: Real Browser Login After Logout — Re-authenticating after logout clears logout barrier and allows legitimate subsequent token refresh', async () => {
    const context: BrowserContext = await browser.newContext();
    const testEmail = `browser_relogin_${Date.now()}@example.com`;
    const password = 'Password123!';

    const page1 = await context.newPage();
    await page1.goto(`${baseUrl}/test.html`);

    // 1. Register / Login as User A
    const regResult = await page1.evaluate(
      async ({ email, pass }: any) => {
        return await OrbitClient.apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Relogin User',
            email,
            password: pass,
            organizationName: 'Relogin Org',
          }),
        });
      },
      { email: testEmail, pass: password }
    );

    const orgId = regResult.organizations[0].id;
    await page1.evaluate((id: string) => OrbitClient.setActiveOrgId(id), orgId);

    // 2. Verify authenticated protected request succeeds
    const orgs1 = await page1.evaluate(async () => {
      return await OrbitClient.apiRequest('/api/organizations');
    });
    expect(Array.isArray(orgs1)).toBe(true);
    expect(orgs1.length).toBeGreaterThanOrEqual(1);

    // 3. Logout
    await page1.evaluate(async () => {
      await OrbitClient.apiRequest('/api/auth/logout', { method: 'POST' });
    });

    // 4. Verify logout state is propagated and protected request fails closed
    const postLogoutResult = await page1.evaluate(async () => {
      try {
        await OrbitClient.apiRequest('/api/organizations');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });
    expect(postLogoutResult.success).toBe(false);
    expect(postLogoutResult.error).toMatch(/Session expired or revoked/i);

    // 5. Login again as User A
    let refreshCalls = 0;
    page1.on('request', (req) => {
      if (req.url().includes('/api/auth/refresh') && req.method() === 'POST') {
        refreshCalls++;
      }
    });

    const loginResult = await page1.evaluate(
      async ({ email, pass }: any) => {
        return await OrbitClient.apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password: pass }),
        });
      },
      { email: testEmail, pass: password }
    );
    expect(loginResult.user.id).toBe(regResult.user.id);
    await page1.evaluate((id: string) => OrbitClient.setActiveOrgId(id), orgId);

    // 6. Expire the access token while preserving the valid refresh cookie
    await context.clearCookies({ name: 'access_token' });
    const refreshCountBefore = refreshCalls;

    // 7. Make a protected request
    const orgsAfterRelogin = await page1.evaluate(async () => {
      return await OrbitClient.apiRequest('/api/organizations');
    });

    // 8. Verify exactly one legitimate refresh request occurred
    expect(refreshCalls - refreshCountBefore).toBe(1);

    // 9. Verify the protected request succeeded
    expect(Array.isArray(orgsAfterRelogin)).toBe(true);
    expect(orgsAfterRelogin[0].name).toBe('Relogin Org');

    // 10. Verify the session family remains healthy (1 active session)
    const activeSessions = await prisma.userSession.findMany({
      where: { userId: regResult.user.id, isRevoked: false },
    });
    expect(activeSessions.length).toBe(1);

    await context.close();
  }, 30000);
});
