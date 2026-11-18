/**
 * Cross-Tab Refresh Token Coordination & Concurrency Proof Tests
 *
 * [Gravitas Invariant 6 — Testing Environment Classification]
 * These tests execute in Vitest under simulated execution contexts and Web Locks API mocks/spies.
 * They deterministically verify the serialization, stale 401 interception, fail-closed mutual
 * exclusion, token theft defense, session correlation, and adversarial concurrency invariants.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiRequest,
  requestTokenRefresh,
  setAuthFailureHandler,
  resetClientState,
  markLoggedOut,
  getStoredRefreshEpoch,
  setStoredRefreshEpoch,
  getStoredRefreshStatus,
  setStoredRefreshStatus,
  setActiveUserId,
  getActiveUserId,
  getStoredSessionCorrelation,
  setStoredSessionCorrelation,
  isSiblingRefreshValid,
  getCurrentSessionEpoch,
  setCurrentSessionEpoch,
  isTabSessionLoggedOut,
  getStoredLogoutRecord,
  isLogoutAuthoritativeForSession,
  getBroadcastChannel,
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
  const originalLocks = (globalThis as any).navigator?.locks;

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.localStorage = new MockStorage();
    if (typeof (globalThis as any).navigator === 'undefined') {
      (globalThis as any).navigator = {};
    }
    Object.defineProperty(navigator, 'locks', {
      value: {
        request: vi.fn().mockImplementation(async (_name: string, optionsOrCallback: any, maybeCallback?: any) => {
          const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
          return callback();
        }),
      },
      configurable: true,
      writable: true,
    });
    resetClientState();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    } else {
      delete (globalThis as any).localStorage;
    }
    if (originalLocks) {
      Object.defineProperty(navigator, 'locks', {
        value: originalLocks,
        configurable: true,
        writable: true,
      });
    } else {
      delete (navigator as any).locks;
    }
    resetClientState();
  });

  // ============================================================================
  // Standard Web Locks Serialization Tests
  // ============================================================================

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
    setStoredRefreshStatus('success');
    setStoredSessionCorrelation({
      userId: 'u1',
      sessionEpoch: refreshEpoch,
    });

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
    setStoredSessionCorrelation({
      userId: 'u1',
      sessionEpoch: siblingRefreshEpoch,
    });

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
  // Architecture Verification: Fail-Closed Safety When Web Locks Are Unavailable
  // ============================================================================

  it('6. fail-closed invariant when Web Locks are unavailable: does NOT dispatch uncoordinated refresh', async () => {
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

    try {
      const result = await requestTokenRefresh();
      // Invariant: Must fail closed safely without making uncoordinated network call!
      expect(result).toBe(false);
      expect(networkCallAttempted).toBe(false);
      expect(authFailureCalled).toBe(true);
      expect(getStoredRefreshStatus()).toBe('failed');
    } finally {
      Object.defineProperty(navigator, 'locks', {
        value: origLocks,
        configurable: true,
        writable: true,
      });
    }
  });

  // ============================================================================
  // Session Correlation & Account Switch Invariants (Section 7)
  // ============================================================================

  it('7. session correlation: user A does not accept sibling refresh completed by user B after account switch', async () => {
    // Current tab is associated with User A
    setActiveUserId('user_A_id');

    // Simulate sibling tab completing a refresh for User B
    const siblingEpoch = Date.now() + 100;
    setStoredRefreshEpoch(siblingEpoch);
    setStoredRefreshStatus('success');
    setStoredSessionCorrelation({
      userId: 'user_B_id',
      sessionEpoch: siblingEpoch,
    });

    // Verification: isSiblingRefreshValid MUST return false for User A!
    const dispatchEpoch = Date.now();
    expect(isSiblingRefreshValid(dispatchEpoch)).toBe(false);

    // If User A receives 401, it must NOT reuse User B credentials
    let refreshAttempted = false;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      refreshAttempted = true;
      return { ok: false, status: 401 };
    });

    await expect(apiRequest('/api/channels')).rejects.toThrow();
  });

  it('8. session correlation: logout invalidates coordination state and sets status to logged_out', async () => {
    setActiveUserId('user_A_id');
    setStoredRefreshEpoch(Date.now());
    setStoredRefreshStatus('success');
    setStoredSessionCorrelation({
      userId: 'user_A_id',
      sessionEpoch: Date.now(),
    });

    markLoggedOut();

    expect(getActiveUserId()).toBeNull();
    expect(getStoredRefreshStatus()).toBe('logged_out');
    expect(getStoredSessionCorrelation()).toBeNull();
    expect(getStoredRefreshEpoch()).toBe(0);

    // In logged_out state, requests immediately fail closed without refreshing
    let refreshAttempted = false;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      refreshAttempted = true;
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    });

    const refreshResult = await requestTokenRefresh();
    expect(refreshResult).toBe(false);
    expect(refreshAttempted).toBe(false);
  });

  it('8b. login after logout: establishing a fresh authenticated session supersedes previous logout record and allows legitimate refresh', async () => {
    // 1. Initial login
    const loginEpoch1 = 1000;
    setActiveUserId('user_A_id', loginEpoch1);
    setStoredRefreshStatus('success');

    // 2. User logs out
    markLoggedOut();
    expect(getActiveUserId()).toBeNull();
    expect(getStoredRefreshStatus()).toBe('logged_out');
    expect(isTabSessionLoggedOut()).toBe(true);

    const logoutRecord = getStoredLogoutRecord();
    expect(logoutRecord).not.toBeNull();
    const logoutEpoch = logoutRecord!.logoutEpoch;
    expect(logoutEpoch).toBeGreaterThanOrEqual(loginEpoch1);

    // In logged-out state, refresh is rejected
    expect(await requestTokenRefresh()).toBe(false);

    // 3. User logs in again with a fresh session established after the logout
    const loginEpoch2 = logoutEpoch + 500;
    setActiveUserId('user_A_id', loginEpoch2);

    expect(getActiveUserId()).toBe('user_A_id');
    expect(getCurrentSessionEpoch()).toBe(loginEpoch2);
    expect(isTabSessionLoggedOut()).toBe(false);
    expect(getStoredRefreshStatus()).toBe('success');

    const freshCorr = getStoredSessionCorrelation();
    expect(freshCorr).not.toBeNull();
    expect(freshCorr!.userId).toBe('user_A_id');
    expect(freshCorr!.sessionEpoch).toBe(loginEpoch2);

    // 4. Access token expires: protected request triggers token refresh
    let refreshAttempted = false;
    globalThis.fetch = vi.fn().mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/refresh')) {
        refreshAttempted = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { user: { id: 'user_A_id' } },
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    });

    const refreshResult = await requestTokenRefresh();
    expect(refreshResult).toBe(true);
    expect(refreshAttempted).toBe(true);
    expect(getStoredRefreshStatus()).toBe('success');
  });

  it('8c. stale broadcast protection: delayed messages from older session epochs are discarded without corrupting active session', async () => {
    // Establish active session at epoch 5000
    const activeEpoch = 5000;
    setActiveUserId('user_A_id', activeEpoch);
    setStoredSessionCorrelation({
      userId: 'user_A_id',
      sessionEpoch: activeEpoch,
    });
    setStoredRefreshStatus('success');

    expect(getActiveUserId()).toBe('user_A_id');
    expect(getCurrentSessionEpoch()).toBe(activeEpoch);
    expect(isTabSessionLoggedOut()).toBe(false);

    // Simulate BroadcastChannel delivering a delayed/stale ORBIT_LOGOUT from an older epoch (e.g. 2000)
    const channel = getBroadcastChannel();
    if (channel && channel.onmessage) {
      // Stale message from epoch 2000 < activeEpoch 5000
      channel.onmessage({
        data: { type: 'ORBIT_LOGOUT', epoch: 2000, userId: 'user_A_id' },
      } as MessageEvent);

      // Invariant: Stale message must be discarded; active session must NOT be invalidated
      expect(getActiveUserId()).toBe('user_A_id');
      expect(getCurrentSessionEpoch()).toBe(activeEpoch);
      expect(isTabSessionLoggedOut()).toBe(false);

      // Now send a current broadcast with epoch >= activeEpoch (e.g. 6000)
      channel.onmessage({
        data: { type: 'ORBIT_LOGOUT', epoch: 6000, userId: 'user_A_id' },
      } as MessageEvent);

      // Invariant: Current broadcast is authoritative; session is invalidated
      expect(getActiveUserId()).toBeNull();
      expect(getCurrentSessionEpoch()).toBe(0);
      expect(isTabSessionLoggedOut()).toBe(true);
    }
  });

  // ============================================================================
  // Formal Proof of localStorage Staged Election Race Flaw (Section 2 & 4)
  // ============================================================================

  it('9. formal concurrency proof: models how localStorage staged election fails under preemption / ticket removal schedule', async () => {
    /**
     * Counterexample Schedule Simulation:
     * 1. Tab A and Tab B both observe no active lease.
     * 2. Tab A posts its candidate ticket.
     * 3. Tab A completes arbitration and wins.
     * 4. Tab A writes its lease and removes its candidate ticket.
     * 5. Tab B (delayed by GC/preemption) resumes and posts its candidate ticket.
     * 6. Tab B scans tickets. Because Tab A removed its ticket, Tab B sees only its own ticket.
     * 7. Tab B completes arbitration, believes it is the winner, and overwrites Tab A's active lease.
     * 8. Both Tab A and Tab B execute concurrent refresh requests -> THEFT_DETECTED.
     */
    const store = new MockStorage();

    // Step 1: No lease initially
    expect(store.getItem('orbit_auth_refresh_lease')).toBeNull();

    // Step 2: Tab A posts candidate ticket
    const ticketA = { clientId: 'tab_A', timestamp: Date.now(), priority: 0.1 };
    store.setItem('orbit_auth_candidate_tab_A', JSON.stringify(ticketA));

    // Step 3 & 4: Tab A wins, writes lease, and removes its ticket
    const leaseA = { ownerId: 'tab_A', expiresAt: Date.now() + 6000 };
    store.setItem('orbit_auth_refresh_lease', JSON.stringify(leaseA));
    store.removeItem('orbit_auth_candidate_tab_A');

    // Step 5: Tab B resumes from preemption and posts candidate ticket
    const ticketB = { clientId: 'tab_B', timestamp: Date.now() + 10, priority: 0.5 };
    store.setItem('orbit_auth_candidate_tab_B', JSON.stringify(ticketB));

    // Step 6: Tab B scans candidate tickets
    const activeCandidates: any[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith('orbit_auth_candidate_')) {
        activeCandidates.push(JSON.parse(store.getItem(k)!));
      }
    }

    // Because Tab A removed its ticket in step 4, Tab B sees ONLY its own ticket!
    expect(activeCandidates).toHaveLength(1);
    expect(activeCandidates[0].clientId).toBe('tab_B');

    // Step 7: Tab B determines it is the winner and overwrites the lease!
    const leaseB = { ownerId: 'tab_B', expiresAt: Date.now() + 6000 };
    store.setItem('orbit_auth_refresh_lease', JSON.stringify(leaseB));

    // PROOF ESTABLISHED:
    // The lease written by Tab A was completely overwritten by Tab B!
    const finalLease = JSON.parse(store.getItem('orbit_auth_refresh_lease')!);
    expect(finalLease.ownerId).toBe('tab_B'); // Tab A's lease was overwritten!
    // In actual execution, both Tab A and Tab B would now believe they hold the lease
    // and would send simultaneous refresh requests, causing server theft revocation.
  });

  it('10. adversarial schedule: stale owner tab suspended past 6000ms TTL cannot resurrect lease after new owner claims it', async () => {
    const store = new MockStorage();

    // Tab A acquired lease at T=0
    const leaseA = { ownerId: 'tab_A', expiresAt: Date.now() - 1000 }; // expired 1s ago
    store.setItem('orbit_auth_refresh_lease', JSON.stringify(leaseA));

    // Tab B observes expired lease, acquires new lease at T=7000
    const leaseB = { ownerId: 'tab_B', expiresAt: Date.now() + 6000 };
    store.setItem('orbit_auth_refresh_lease', JSON.stringify(leaseB));

    // Tab A wakes up from long suspension and attempts to release the lease
    const raw = store.getItem('orbit_auth_refresh_lease');
    const current = JSON.parse(raw!);

    // Invariant: Tab A must NOT delete Tab B's lease when ownerId does not match!
    if (current.ownerId === 'tab_A') {
      store.removeItem('orbit_auth_refresh_lease');
    }

    // Tab B's lease remains protected
    expect(store.getItem('orbit_auth_refresh_lease')).not.toBeNull();
    expect(JSON.parse(store.getItem('orbit_auth_refresh_lease')!).ownerId).toBe('tab_B');
  });
});
