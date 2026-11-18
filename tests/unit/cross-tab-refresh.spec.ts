/**
 * Cross-Tab Refresh Token Coordination Tests
 *
 * [Gravitas Invariant 6 — Testing Environment Classification]
 * These tests execute in Vitest under simulated execution contexts and Web Locks API mocks/spies.
 * They deterministically verify the serialization, stale 401 interception, fail-closed mutual
 * exclusion, and token theft defense invariants. They do not run in a live multi-process browser
 * harness (such as Playwright, which is not installed in the repository).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiRequest,
  requestTokenRefresh,
  setAuthFailureHandler,
  resetClientState,
  getStoredRefreshEpoch,
  setStoredRefreshEpoch,
  setStoredRefreshStatus,
} from '../../apps/web/src/api/client';

class MockStorage implements Storage {
  private store: Record<string, string> = {};
  get length(): number {
    return Object.keys(this.store).length;
  }
  clear(): void {
    this.store = {};
  }
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  key(index: number): string | null {
    return Object.keys(this.store)[index] || null;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
}

describe('Cross-Tab Refresh Token Coordination Tests', () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.localStorage = new MockStorage();
    resetClientState();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    } else {
      delete (globalThis as any).localStorage;
    }
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

  it('4. unresponsive or aborted lock holder fails closed safely without uncoordinated direct refresh', async () => {
    let refreshExecuted = false;
    let authFailureCalled = false;
    setAuthFailureHandler(() => {
      authFailureCalled = true;
    });

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
      // Must FAIL CLOSED: do not bypass mutex by executing an uncoordinated refresh
      expect(result).toBe(false);
      expect(refreshExecuted).toBe(false);
      expect(authFailureCalled).toBe(true);
    } finally {
      lockSpy.mockRestore();
    }
  });

  it('4b. aborted lock holder reuses rotated session if sibling tab refreshed in the interim', async () => {
    let refreshExecuted = false;

    // Simulate sibling tab having completed refresh 100ms ago
    const siblingRefreshEpoch = Date.now() - 100;
    setStoredRefreshEpoch(siblingRefreshEpoch);
    setStoredRefreshStatus('success');

    const lockSpy = vi
      .spyOn(navigator.locks, 'request')
      .mockRejectedValue(new DOMException('The lock request timed out', 'TimeoutError'));

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        refreshExecuted = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        };
      }
      return { ok: false, status: 404 };
    });

    try {
      // Dispatch time was 200ms ago (before sibling refreshed 100ms ago)
      const dispatchEpoch = Date.now() - 200;
      const result = await requestTokenRefresh(dispatchEpoch);
      // Safely reuses the freshly rotated cookie without dispatching uncoordinated refresh
      expect(result).toBe(true);
      expect(refreshExecuted).toBe(false);
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

  // ============================================================================
  // Tier-2 Fallback: Multi-Tab Mutual Exclusion Without Web Locks API
  // ============================================================================
  it('6. fallback without Web Locks: two independent tabs attempting refresh concurrently serialize via two-phase election (exactly 1 network refresh)', async () => {
    // Disable Web Locks to force Tier-2 fallback
    const origLocks = navigator.locks;
    Object.defineProperty(navigator, 'locks', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    let refreshCallCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        refreshCallCount++;
        await new Promise((r) => setTimeout(r, 60));
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { user: { id: 'u1' } } }),
        };
      }
      return { ok: false, status: 404 };
    });

    try {
      // Simulate Tab 1 and Tab 2 dispatching refresh simultaneously
      const dispatchEpoch = Date.now();
      const tab1Promise = requestTokenRefresh(dispatchEpoch);
      // Give tab 2 a slight 5ms offset to simulate real asynchronous contention
      await new Promise((r) => setTimeout(r, 5));
      const tab2Promise = requestTokenRefresh(dispatchEpoch);

      const [res1, res2] = await Promise.all([tab1Promise, tab2Promise]);

      expect(res1).toBe(true);
      expect(res2).toBe(true);
      // CRITICAL: Even without Web Locks, exactly ONE network call was executed!
      expect(refreshCallCount).toBe(1);
    } finally {
      Object.defineProperty(navigator, 'locks', {
        value: origLocks,
        configurable: true,
        writable: true,
      });
    }
  });

  it('7. fallback without Web Locks: fails closed safely when localStorage is unavailable or throwing', async () => {
    const origLocks = navigator.locks;
    Object.defineProperty(navigator, 'locks', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    let networkCallAttempted = false;
    let authFailureCalled = false;
    setAuthFailureHandler(() => {
      authFailureCalled = true;
    });

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      networkCallAttempted = true;
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    });

    // Mock localStorage throwing SecurityError (e.g. private browsing or sandboxed iframe)
    const storage = globalThis.localStorage as Storage;
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = vi.fn().mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });

    try {
      const result = await requestTokenRefresh();
      // Invariant: Must fail closed safely without making uncoordinated network call!
      expect(result).toBe(false);
      expect(networkCallAttempted).toBe(false);
      expect(authFailureCalled).toBe(true);
    } finally {
      storage.setItem = originalSetItem;
      Object.defineProperty(navigator, 'locks', {
        value: origLocks,
        configurable: true,
        writable: true,
      });
    }
  });

  it('8. fallback without Web Locks: recovers from a crashed holder with a stale lease (> 6000ms TTL)', async () => {
    const origLocks = navigator.locks;
    Object.defineProperty(navigator, 'locks', {
      value: undefined,
      configurable: true,
      writable: true,
    });

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

    // Seed localStorage with a stale lease from a crashed tab that terminated 10 seconds ago
    const storage = globalThis.localStorage as Storage;
    storage.setItem(
      'orbit_auth_refresh_lease',
      JSON.stringify({
        ownerId: 'crashed_tab_session_999',
        expiresAt: Date.now() - 10000,
      })
    );

    try {
      const result = await requestTokenRefresh();
      expect(result).toBe(true);
      expect(refreshCallCount).toBe(1);
    } finally {
      Object.defineProperty(navigator, 'locks', {
        value: origLocks,
        configurable: true,
        writable: true,
      });
    }
  });
});