import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRequest, requestTokenRefresh, setAuthFailureHandler } from '../../apps/web/src/api/client';

describe('Frontend Single-Flight Refresh Concurrency Unit Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('1. single call to requestTokenRefresh calls /api/auth/refresh and returns true on 200', async () => {
    let refreshCallCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        refreshCallCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { user: { id: 'u1' } } }),
        };
      }
      return { ok: false, status: 404 };
    });

    const result = await requestTokenRefresh();
    expect(result).toBe(true);
    expect(refreshCallCount).toBe(1);
  });

  it('2. concurrent calls to requestTokenRefresh share the exact same promise (single-flight)', async () => {
    let refreshCallCount = 0;
    let resolveRefresh: (res: any) => void;

    const delayedRefreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        refreshCallCount++;
        await delayedRefreshPromise;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { user: { id: 'u1' } } }),
        };
      }
      return { ok: false, status: 404 };
    });

    // Fire 5 simultaneous refresh requests
    const p1 = requestTokenRefresh();
    const p2 = requestTokenRefresh();
    const p3 = requestTokenRefresh();
    const p4 = requestTokenRefresh();
    const p5 = requestTokenRefresh();

    // Release the single fetch call
    resolveRefresh!(null);

    const results = await Promise.all([p1, p2, p3, p4, p5]);

    // All 5 must resolve to true
    expect(results).toEqual([true, true, true, true, true]);

    // But fetch('/api/auth/refresh') MUST have been invoked exactly ONCE!
    expect(refreshCallCount).toBe(1);
  });

  it('3. simultaneous apiRequests receiving 401 trigger exactly ONE refresh and all retry successfully', async () => {
    let refreshCount = 0;
    let channelsCount = 0;
    let orgsCount = 0;
    let profileCount = 0;
    let tokenRefreshed = false;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      if (url === '/api/auth/refresh') {
        refreshCount++;
        tokenRefreshed = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { user: { id: 'u1' } } }),
        };
      }

      // If token not refreshed yet, return 401
      if (!tokenRefreshed) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ success: false, error: { message: 'Token expired' } }),
        };
      }

      // After refresh, return success
      if (url === '/api/channels') {
        channelsCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [{ id: 'c1' }] }),
        };
      }

      if (url === '/api/organizations') {
        orgsCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [{ id: 'o1' }] }),
        };
      }

      if (url === '/api/auth/me') {
        profileCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { user: { id: 'u1' } } }),
        };
      }

      return { ok: false, status: 404 };
    });

    // Launch three concurrent requests while access token is expired
    const [channels, orgs, profile] = await Promise.all([
      apiRequest<any>('/api/channels'),
      apiRequest<any>('/api/organizations'),
      apiRequest<any>('/api/auth/me'),
    ]);

    expect(channels).toEqual([{ id: 'c1' }]);
    expect(orgs).toEqual([{ id: 'o1' }]);
    expect(profile).toEqual({ user: { id: 'u1' } });

    // Key invariant: exactly ONE refresh request was made across all three concurrent calls!
    expect(refreshCount).toBe(1);
    expect(channelsCount).toBe(1);
    expect(orgsCount).toBe(1);
    expect(profileCount).toBe(1);
  });

  it('4. failed refresh clears session and does not retry with consumed tokens', async () => {
    let authFailureCalled = false;
    setAuthFailureHandler(() => {
      authFailureCalled = true;
    });

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: { message: 'Security alert: Attempted reuse of rotated refresh token.' },
          }),
        };
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: { message: 'Unauthorized' } }),
      };
    });

    await expect(apiRequest('/api/channels')).rejects.toThrow(
      /session expired or revoked/i
    );

    expect(authFailureCalled).toBe(true);
  });

  it('5. auth endpoints (/api/auth/login) do not trigger auto-refresh on 401', async () => {
    let refreshAttempted = false;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        refreshAttempted = true;
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      if (url === '/api/auth/login') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ success: false, error: { message: 'Invalid credentials' } }),
        };
      }
      return { ok: false, status: 404 };
    });

    await expect(
      apiRequest('/api/auth/login', { method: 'POST', body: '{}' })
    ).rejects.toThrow(/invalid credentials/i);

    // Login 401 must NOT trigger a token refresh attempt
    expect(refreshAttempted).toBe(false);
  });
});
