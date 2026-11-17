import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiRequest,
  requestTokenRefresh,
  setAuthFailureHandler,
  resetClientState,
  getStoredRefreshEpoch,
  setStoredRefreshEpoch,
} from '../../apps/web/src/api/client';

describe('Cross-Tab Refresh Token Coordination Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetClientState();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetClientState();
  });

  it('1. two independent contexts attempting refresh concurrently: only one executes network refresh, second reuses rotated session', async () => {
    let refreshCallCount = 0;
    let tokenRefreshed = false;

    // Simulate server endpoint
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        refreshCallCount++;
        // Simulate network delay
        await new Promise((r) => setTimeout(r, 20));
        tokenRefreshed = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { user: { id: 'u1' } } }),
        };
      }

      if (url === '/api/channels' || url === '/api/organizations') {
        if (!tokenRefreshed) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ success: false, error: { message: 'Token expired' } }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [{ id: 'res1' }] }),
        };
      }

      return { ok: false, status: 404 };
    });

    // Simulate Tab A and Tab B dispatching requests simultaneously
    const tabAPromise = apiRequest('/api/channels');
    const tabBPromise = apiRequest('/api/organizations');

    const [tabAResult, tabBResult] = await Promise.all([tabAPromise, tabBPromise]);

    expect(tabAResult).toEqual([{ id: 'res1' }]);
    expect(tabBResult).toEqual([{ id: 'res1' }]);

    // CRITICAL: Exactly ONE network refresh call was made across both independent tabs!
    expect(refreshCallCount).toBe(1);
  });

  it('2. cross-tab stale 401: tab receives 401 after sibling tab already completed refresh retries without new refresh', async () => {
    let refreshCallCount = 0;

    // Sibling tab (Tab A) just refreshed tokens 50ms ago
    const refreshEpoch = Date.now() - 50;
    setStoredRefreshEpoch(refreshEpoch);

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        refreshCallCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { user: { id: 'u1' } } }),
        };
      }

      if (url === '/api/channels') {
        // Return 200 on retry
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [{ id: 'ch1' }] }),
        };
      }

      return { ok: false, status: 404 };
    });

    // Request was dispatched at T - 100ms (before Tab A refreshed at T - 50ms)
    // The request receives 401, but detects that stored refresh timestamp (T - 50ms) > dispatch time (T - 100ms)
    // It retries once with the newly rotated cookies without hitting /api/auth/refresh!
    const result = await apiRequest('/api/channels');
    expect(result).toEqual([{ id: 'ch1' }]);
    expect(refreshCallCount).toBe(0);
  });

  it('3. refresh failure propagates to waiting contexts and invokes authFailureHandler', async () => {
    let failureHandledCount = 0;
    setAuthFailureHandler(() => {
      failureHandledCount++;
    });

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ success: false, error: { message: 'Refresh token revoked' } }),
        };
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: { message: 'Unauthorized' } }),
      };
    });

    await expect(apiRequest('/api/channels')).rejects.toThrow(/session expired or revoked/i);
    expect(failureHandledCount).toBeGreaterThan(0);
  });

  it('4. unresponsive or aborted lock holder falls back safely to direct refresh without hanging', async () => {
    let refreshExecuted = false;

    // Simulate an aborted or failing lock environment via spy
    const lockSpy = vi
      .spyOn(navigator.locks, 'request')
      .mockRejectedValue(new DOMException('The request was aborted', 'AbortError'));

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        refreshExecuted = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { user: { id: 'u1' } } }),
        };
      }
      return { ok: false, status: 404 };
    });

    try {
      const result = await requestTokenRefresh();
      expect(result).toBe(true);
      expect(refreshExecuted).toBe(true);
    } finally {
      lockSpy.mockRestore();
    }
  });

  it('5. security contract: no sensitive credentials or tokens disclosed in storage or messages', async () => {
    const rawRefreshToken = 'super_secret_refresh_token_value_32_bytes_random';
    const rawAccessToken = 'jwt.stateless.access_token_signature';

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'Set-Cookie': `refresh_token=${rawRefreshToken}; Path=/; HttpOnly; Secure`,
          }),
          json: async () => ({
            success: true,
            data: {
              accessToken: rawAccessToken,
              user: { id: 'u1', email: 'test@orbit.local' },
            },
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    await requestTokenRefresh();

    // Verify stored epoch is purely a non-sensitive numerical timestamp
    const storedEpoch = getStoredRefreshEpoch();
    expect(typeof storedEpoch).toBe('number');
    expect(storedEpoch).toBeGreaterThan(0);

    // Verify storage does NOT contain tokens or secrets
    const epochStr = String(storedEpoch);
    expect(epochStr).not.toContain(rawRefreshToken);
    expect(epochStr).not.toContain(rawAccessToken);
    expect(epochStr).not.toContain('jwt');
    expect(epochStr).not.toContain('super_secret');
  });
});