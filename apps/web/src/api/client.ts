import { ApiResponse } from '@orbit/shared';

let currentOrgId: string | null = null;
let refreshPromise: Promise<boolean> | null = null;
let authFailureHandler: (() => void) | null = null;
let lastSuccessfulRefreshTime = 0;

// Shared Storage & Web Lock Constants for Cross-Tab Coordination
const STORAGE_KEY_LAST_REFRESH = 'orbit_auth_last_refresh_epoch';
const STORAGE_KEY_REFRESH_STATUS = 'orbit_auth_last_refresh_status';
const STORAGE_KEY_LEASE = 'orbit_auth_refresh_lease';
const STORAGE_PREFIX_CANDIDATE = 'orbit_auth_candidate_';
const LOCK_NAME = 'orbit_auth_refresh_lock';
const LOCK_TIMEOUT_MS = 10000;
const LEASE_TTL_MS = 6000;

interface LeaseData {
  ownerId: string;
  expiresAt: number;
}

interface CandidateTicket {
  clientId: string;
  timestamp: number;
  priority: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) return (globalThis as any).localStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {}
  return null;
}

export function isLocalStorageAvailable(): boolean {
  try {
    const storage = getLocalStorage();
    if (!storage) return false;
    const testKey = '__orbit_storage_test__';
    storage.setItem(testKey, '1');
    storage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

// Memory storage fallback when localStorage is unavailable (e.g. sandboxed or Node.js)
let memoryStorage: Record<string, string> = {};

// Optional BroadcastChannel for cross-tab notification
let broadcastChannel: any = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel('orbit_auth_coordination');
    broadcastChannel.onmessage = (event: MessageEvent) => {
      if (event.data?.type === 'ORBIT_REFRESH_FAILED') {
        if (authFailureHandler) {
          authFailureHandler();
        }
      }
    };
  }
} catch {
  // BroadcastChannel unavailable in some environments
}

export function setActiveOrgId(orgId: string | null) {
  currentOrgId = orgId;
}

export function getActiveOrgId(): string | null {
  return currentOrgId;
}

export function setAuthFailureHandler(handler: () => void) {
  authFailureHandler = handler;
}

export function getLastSuccessfulRefreshTime(): number {
  return lastSuccessfulRefreshTime;
}

export function getStoredRefreshEpoch(): number {
  try {
    const storage = getLocalStorage();
    if (storage) {
      const val = storage.getItem(STORAGE_KEY_LAST_REFRESH);
      if (val) {
        return parseInt(val, 10) || 0;
      }
    }
  } catch {}
  const memVal = memoryStorage[STORAGE_KEY_LAST_REFRESH];
  return memVal ? parseInt(memVal, 10) || 0 : 0;
}

export function setStoredRefreshEpoch(epoch: number): void {
  try {
    const storage = getLocalStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY_LAST_REFRESH, String(epoch));
    }
  } catch {}
  memoryStorage[STORAGE_KEY_LAST_REFRESH] = String(epoch);
}

export function getStoredRefreshStatus(): string | null {
  try {
    const storage = getLocalStorage();
    if (storage) {
      return storage.getItem(STORAGE_KEY_REFRESH_STATUS);
    }
  } catch {}
  return memoryStorage[STORAGE_KEY_REFRESH_STATUS] || null;
}

export function setStoredRefreshStatus(status: 'success' | 'failed'): void {
  try {
    const storage = getLocalStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY_REFRESH_STATUS, status);
    }
  } catch {}
  memoryStorage[STORAGE_KEY_REFRESH_STATUS] = status;
}

export function resetClientState(): void {
  currentOrgId = null;
  refreshPromise = null;
  authFailureHandler = null;
  lastSuccessfulRefreshTime = 0;
  memoryStorage = {};
  try {
    const storage = getLocalStorage();
    if (storage) {
      storage.removeItem(STORAGE_KEY_LAST_REFRESH);
      storage.removeItem(STORAGE_KEY_REFRESH_STATUS);
      storage.removeItem(STORAGE_KEY_LEASE);
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX_CANDIDATE)) {
          storage.removeItem(key);
        }
      }
    }
  } catch {}
}

/**
 * Executes the actual network refresh request.
 * Never exposes refresh tokens to JavaScript; uses ambient HTTP-only cookies.
 */
async function executeSingleFlightRefresh(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // Satisfies CSRF custom header contract
      },
      credentials: 'include', // Sends HTTP-only refresh_token cookie
    });

    if (!response.ok) {
      setStoredRefreshStatus('failed');
      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({ type: 'ORBIT_REFRESH_FAILED', epoch: Date.now() });
        } catch {}
      }
      if (authFailureHandler) {
        authFailureHandler();
      }
      return false;
    }

    const json: ApiResponse<any> = await response.json().catch(() => ({
      success: false,
    }));

    if (!json.success) {
      setStoredRefreshStatus('failed');
      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({ type: 'ORBIT_REFRESH_FAILED', epoch: Date.now() });
        } catch {}
      }
      if (authFailureHandler) {
        authFailureHandler();
      }
      return false;
    }

    // Record successful refresh timestamps:
    // 1. Shared storage epoch for cross-tab coordination
    const nowEpoch = Date.now();
    setStoredRefreshEpoch(nowEpoch);
    setStoredRefreshStatus('success');

    // 2. Monotonic performance time for in-tab stale 401 interception
    lastSuccessfulRefreshTime = performance.now();

    // 3. Notify sibling tabs via non-sensitive broadcast (no tokens or secrets)
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({ type: 'ORBIT_REFRESH_COMPLETE', epoch: nowEpoch });
      } catch {}
    }

    return true;
  } catch {
    setStoredRefreshStatus('failed');
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({ type: 'ORBIT_REFRESH_FAILED', epoch: Date.now() });
      } catch {}
    }
    if (authFailureHandler) {
      authFailureHandler();
    }
    return false;
  }
}

/**
 * Tier-2 Fallback: Multi-tab mutual exclusion via Staged Two-Phase Ticket Election in localStorage.
 * Used when W3C Web Locks API (navigator.locks) is unavailable.
 *
 * Guarantees:
 * 1. Mutual Exclusion: At most one tab acquires the lease at any given time.
 * 2. Collision Resolution: Staged arbitration window (40-65ms) prevents simultaneous lease acquisition without CAS.
 * 3. Stale Lock Recovery: Crashed or terminated lease holders expire after LEASE_TTL_MS (6000ms).
 * 4. Fail-Closed Safety: If localStorage is unavailable, throwing, or times out, fails closed safely.
 * 5. Zero Token Disclosure: Only non-sensitive timestamps, UUIDs, and status flags are stored in localStorage.
 */
async function executeLocalStorageFallbackRefresh(dispatchEpoch?: number): Promise<boolean> {
  const storage = getLocalStorage();
  if (!storage || !isLocalStorageAvailable()) {
    // If neither Web Locks nor localStorage is functional, cross-tab mutual exclusion
    // cannot be established. Fail closed safely rather than risking uncoordinated token rotation.
    setStoredRefreshStatus('failed');
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({ type: 'ORBIT_REFRESH_FAILED', epoch: Date.now() });
      } catch {}
    }
    if (authFailureHandler) {
      authFailureHandler();
    }
    return false;
  }

  const clientId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const ticketKey = `${STORAGE_PREFIX_CANDIDATE}${clientId}`;
  const startTime = Date.now();

  try {
    while (Date.now() - startTime < LOCK_TIMEOUT_MS) {
      // 1. Check if another tab completed refresh while we were waiting
      const storedRefresh = getStoredRefreshEpoch();
      const storedStatus = getStoredRefreshStatus();
      if (dispatchEpoch && storedRefresh > dispatchEpoch && storedStatus === 'success') {
        lastSuccessfulRefreshTime = performance.now();
        return true;
      }

      // 2. Check active lease
      let currentLease: LeaseData | null = null;
      try {
        const raw = storage.getItem(STORAGE_KEY_LEASE);
        if (raw) currentLease = JSON.parse(raw);
      } catch {}

      if (currentLease && currentLease.expiresAt > Date.now()) {
        // Lease actively held by another tab. Sleep and re-check.
        await sleep(35 + Math.random() * 25);
        continue;
      }

      // 3. Phase 1: Post Candidate Ticket
      const ticket: CandidateTicket = {
        clientId,
        timestamp: Date.now(),
        priority: Math.random(),
      };
      try {
        storage.setItem(ticketKey, JSON.stringify(ticket));
      } catch {
        // Storage write error, fail closed
        setStoredRefreshStatus('failed');
        if (authFailureHandler) authFailureHandler();
        return false;
      }

      // 4. Phase 2: Arbitration jitter window (40-65ms)
      await sleep(40 + Math.random() * 25);

      // 5. Phase 3: Evaluate contenders
      const candidates: CandidateTicket[] = [];
      try {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key && key.startsWith(STORAGE_PREFIX_CANDIDATE)) {
            const rawVal = storage.getItem(key);
            if (rawVal) {
              const c: CandidateTicket = JSON.parse(rawVal);
              if (Date.now() - c.timestamp < 1000) {
                candidates.push(c);
              }
            }
          }
        }
      } catch {}

      candidates.sort((a, b) => {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return a.priority - b.priority;
      });

      const winner = candidates[0];
      if (!winner || winner.clientId !== clientId) {
        // Lost election. Clean ticket, wait, and retry loop.
        try { storage.removeItem(ticketKey); } catch {}
        await sleep(35 + Math.random() * 25);
        continue;
      }

      // 6. Phase 4: Winner commits lease
      const lease: LeaseData = {
        ownerId: clientId,
        expiresAt: Date.now() + LEASE_TTL_MS,
      };
      try {
        storage.setItem(STORAGE_KEY_LEASE, JSON.stringify(lease));
        storage.removeItem(ticketKey);
      } catch {
        setStoredRefreshStatus('failed');
        if (authFailureHandler) authFailureHandler();
        return false;
      }

      // 7. Check if another tab refreshed while we arbitrated
      const interimRefresh = getStoredRefreshEpoch();
      const interimStatus = getStoredRefreshStatus();
      if (dispatchEpoch && interimRefresh > dispatchEpoch && interimStatus === 'success') {
        try { storage.removeItem(STORAGE_KEY_LEASE); } catch {}
        lastSuccessfulRefreshTime = performance.now();
        return true;
      }

      // 8. Winner executes refresh
      try {
        return await executeSingleFlightRefresh();
      } finally {
        try {
          const raw = storage.getItem(STORAGE_KEY_LEASE);
          if (raw) {
            const l: LeaseData = JSON.parse(raw);
            if (l.ownerId === clientId) {
              storage.removeItem(STORAGE_KEY_LEASE);
            }
          }
        } catch {}
      }
    }

    // Contention timeout: check one last time if a sibling completed refresh
    const finalRefresh = getStoredRefreshEpoch();
    const finalStatus = getStoredRefreshStatus();
    if (dispatchEpoch && finalRefresh > dispatchEpoch && finalStatus === 'success') {
      lastSuccessfulRefreshTime = performance.now();
      return true;
    }

    // Fail closed safely
    setStoredRefreshStatus('failed');
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({ type: 'ORBIT_REFRESH_FAILED', epoch: Date.now() });
      } catch {}
    }
    if (authFailureHandler) {
      authFailureHandler();
    }
    return false;
  } finally {
    try { storage.removeItem(ticketKey); } catch {}
  }
}

/**
 * Cross-Tab Coordinated Token Refresh Mechanism.
 * Ensures that multiple simultaneous API requests across one or MORE browser tabs
 * do not trigger concurrent refresh operations, avoiding server-side token reuse / theft detection.
 *
 * Tier 1: Uses the W3C Web Locks API (navigator.locks) when available to serialize execution across tabs.
 * Tier 2: Falls back to Staged Two-Phase Ticket Election in localStorage when Web Locks are absent.
 * Fail-Closed: If safe coordination cannot be established, fails closed safely without uncoordinated network requests.
 */
export async function requestTokenRefresh(dispatchEpoch?: number): Promise<boolean> {
  // If a refresh operation is already in-flight in THIS execution context, return existing promise
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      // 1. Tier-1: Cross-tab coordination via Web Locks API when available
      if (
        typeof navigator !== 'undefined' &&
        navigator.locks &&
        typeof navigator.locks.request === 'function'
      ) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), LOCK_TIMEOUT_MS);

        try {
          return await navigator.locks.request(
            LOCK_NAME,
            { signal: controller.signal },
            async () => {
              clearTimeout(timeoutId);

              // Check if another tab completed refresh while we were waiting for the lock
              const storedRefresh = getStoredRefreshEpoch();
              const storedStatus = getStoredRefreshStatus();
              if (dispatchEpoch && storedRefresh > dispatchEpoch && storedStatus === 'success') {
                lastSuccessfulRefreshTime = performance.now();
                return true;
              }

              return await executeSingleFlightRefresh();
            }
          );
        } catch {
          clearTimeout(timeoutId);
          // If lock acquisition timed out or failed (e.g. aborted or unresponsive lock holder),
          // DO NOT execute an uncoordinated direct refresh, as doing so bypasses mutual exclusion
          // and risks concurrent token rotation and session family theft revocation.
          // First, check whether another tab successfully completed refresh in the interim:
          const storedRefresh = getStoredRefreshEpoch();
          const storedStatus = getStoredRefreshStatus();
          if (dispatchEpoch && storedRefresh > dispatchEpoch && storedStatus === 'success') {
            lastSuccessfulRefreshTime = performance.now();
            return true;
          }

          // If no sibling tab completed a valid refresh, fail closed safely.
          setStoredRefreshStatus('failed');
          if (broadcastChannel) {
            try {
              broadcastChannel.postMessage({ type: 'ORBIT_REFRESH_FAILED', epoch: Date.now() });
            } catch {}
          }
          if (authFailureHandler) {
            authFailureHandler();
          }
          return false;
        }
      }

      // 2. Tier-2: Fallback for environments without Web Locks API
      // Uses Staged Two-Phase Ticket Election Lease in localStorage
      return await executeLocalStorageFallbackRefresh(dispatchEpoch);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export interface ApiRequestOptions extends RequestInit {
  _retry?: boolean;
}

export async function apiRequest<T>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const requestDispatchTime = performance.now();
  const requestDispatchEpoch = Date.now();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  // Attach X-Requested-With custom header for CSRF defense on state mutations
  if (options.method && options.method.toUpperCase() !== 'GET') {
    if (!headers.has('X-Requested-With')) {
      headers.set('X-Requested-With', 'XMLHttpRequest');
    }
  }

  if (currentOrgId && !headers.has('X-Organization-Id')) {
    headers.set('X-Organization-Id', currentOrgId);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include', // Includes HTTP-only cookies
  });

  // Handle 401 Unauthorized with cross-tab single-flight refresh interceptor
  const isAuthEndpoint =
    endpoint.includes('/api/auth/login') ||
    endpoint.includes('/api/auth/register') ||
    endpoint.includes('/api/auth/refresh') ||
    endpoint.includes('/api/auth/logout');

  if (response.status === 401 && !options._retry && !isAuthEndpoint) {
    // 1. In-tab monotonic stale 401 check
    if (lastSuccessfulRefreshTime > requestDispatchTime) {
      return apiRequest<T>(endpoint, {
        ...options,
        _retry: true,
      });
    }

    // 2. Cross-tab stale 401 check: did another tab already refresh after this request was sent?
    const storedRefresh = getStoredRefreshEpoch();
    const storedStatus = getStoredRefreshStatus();
    if (storedRefresh > requestDispatchEpoch && storedStatus === 'success') {
      lastSuccessfulRefreshTime = performance.now();
      return apiRequest<T>(endpoint, {
        ...options,
        _retry: true,
      });
    }

    // 3. Coordinate cross-tab refresh
    const refreshOk = await requestTokenRefresh(requestDispatchEpoch);

    if (refreshOk) {
      // Retry original request exactly once with new ambient credentials
      return apiRequest<T>(endpoint, {
        ...options,
        _retry: true,
      });
    }

    // Refresh failed: Do not retry with consumed token; notify caller
    throw new Error('Session expired or revoked. Please log in again.');
  }

  const json: ApiResponse<T> = await response.json().catch(() => ({
    success: false,
    error: {
      code: 'UNKNOWN_ERROR',
      message: 'Failed to parse server response',
    },
  }));

  if (!response.ok || !json.success) {
    const errorMsg = json.error?.message || `HTTP ${response.status}: Request failed`;
    throw new Error(errorMsg);
  }

  return json.data as T;
}
