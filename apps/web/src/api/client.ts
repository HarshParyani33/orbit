import { ApiResponse } from '@orbit/shared';

let currentOrgId: string | null = null;
let currentUserId: string | null = null;
let refreshPromise: Promise<boolean> | null = null;
let authFailureHandler: (() => void) | null = null;
let lastSuccessfulRefreshTime = 0;

// Shared Storage & Web Lock Constants for Cross-Tab Coordination
const STORAGE_KEY_LAST_REFRESH = 'orbit_auth_last_refresh_epoch';
const STORAGE_KEY_REFRESH_STATUS = 'orbit_auth_last_refresh_status';
const STORAGE_KEY_SESSION_CORRELATION = 'orbit_auth_session_correlation';
const STORAGE_KEY_REFRESH_COUNTER = 'orbit_auth_refresh_counter';
const STORAGE_KEY_LEASE = 'orbit_auth_refresh_lease';
const STORAGE_PREFIX_CANDIDATE = 'orbit_auth_candidate_';
const LOCK_NAME = 'orbit_auth_refresh_lock';
const LOCK_TIMEOUT_MS = 10000;

export interface SessionCorrelation {
  userId: string;
  sessionEpoch: number;
}

export function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) return (globalThis as any).localStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { }
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
      if (
        event.data?.type === 'ORBIT_REFRESH_FAILED' ||
        event.data?.type === 'ORBIT_LOGOUT'
      ) {
        currentUserId = null;
        currentOrgId = null;
        lastSuccessfulRefreshTime = 0;
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

export function setActiveUserId(userId: string | null) {
  currentUserId = userId;
}

export function getActiveUserId(): string | null {
  return currentUserId;
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
  } catch { }
  const memVal = memoryStorage[STORAGE_KEY_LAST_REFRESH];
  return memVal ? parseInt(memVal, 10) || 0 : 0;
}

export function setStoredRefreshEpoch(epoch: number): void {
  try {
    const storage = getLocalStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY_LAST_REFRESH, String(epoch));
    }
  } catch { }
  memoryStorage[STORAGE_KEY_LAST_REFRESH] = String(epoch);
}

export function getStoredRefreshStatus(): string | null {
  try {
    const storage = getLocalStorage();
    if (storage) {
      return storage.getItem(STORAGE_KEY_REFRESH_STATUS);
    }
  } catch { }
  return memoryStorage[STORAGE_KEY_REFRESH_STATUS] || null;
}

export function setStoredRefreshStatus(status: 'success' | 'failed' | 'logged_out'): void {
  try {
    const storage = getLocalStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY_REFRESH_STATUS, status);
    }
  } catch { }
  memoryStorage[STORAGE_KEY_REFRESH_STATUS] = status;
}

export function getStoredSessionCorrelation(): SessionCorrelation | null {
  try {
    const storage = getLocalStorage();
    if (storage) {
      const val = storage.getItem(STORAGE_KEY_SESSION_CORRELATION);
      if (val) return JSON.parse(val);
    }
  } catch {}
  const memVal = memoryStorage[STORAGE_KEY_SESSION_CORRELATION];
  if (memVal) {
    try {
      return JSON.parse(memVal);
    } catch {}
  }
  return null;
}

export function setStoredSessionCorrelation(correlation: SessionCorrelation | null): void {
  try {
    const storage = getLocalStorage();
    if (storage) {
      if (correlation) {
        storage.setItem(STORAGE_KEY_SESSION_CORRELATION, JSON.stringify(correlation));
      } else {
        storage.removeItem(STORAGE_KEY_SESSION_CORRELATION);
      }
    }
  } catch {}
  if (correlation) {
    memoryStorage[STORAGE_KEY_SESSION_CORRELATION] = JSON.stringify(correlation);
  } else {
    delete memoryStorage[STORAGE_KEY_SESSION_CORRELATION];
  }
}

export function getStoredRefreshCounter(): number {
  try {
    const storage = getLocalStorage();
    if (storage) {
      const val = storage.getItem(STORAGE_KEY_REFRESH_COUNTER);
      if (val) return parseInt(val, 10) || 0;
    }
  } catch {}
  const memVal = memoryStorage[STORAGE_KEY_REFRESH_COUNTER];
  return memVal ? parseInt(memVal, 10) || 0 : 0;
}

export function incrementStoredRefreshCounter(): number {
  const next = getStoredRefreshCounter() + 1;
  try {
    const storage = getLocalStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY_REFRESH_COUNTER, String(next));
    }
  } catch {}
  memoryStorage[STORAGE_KEY_REFRESH_COUNTER] = String(next);
  return next;
}

/**
 * Validates whether a sibling tab's refresh completion is valid and matches the current session.
 * Prevents cross-session credential contamination after account switch or logout.
 */
export function isSiblingRefreshValid(dispatchEpoch?: number): boolean {
  const storedRefresh = getStoredRefreshEpoch();
  const storedStatus = getStoredRefreshStatus();

  if (!dispatchEpoch || storedRefresh <= dispatchEpoch || storedStatus !== 'success') {
    return false;
  }

  // If current tab is associated with a specific user, verify session correlation
  if (currentUserId) {
    const correlation = getStoredSessionCorrelation();
    if (!correlation || correlation.userId !== currentUserId) {
      // Sibling refresh was performed by a different user or session identity was cleared
      return false;
    }
  }

  return true;
}

export function resetClientState(): void {
  currentOrgId = null;
  currentUserId = null;
  refreshPromise = null;
  authFailureHandler = null;
  lastSuccessfulRefreshTime = 0;
  memoryStorage = {};
  try {
    const storage = getLocalStorage();
    if (storage) {
      storage.removeItem(STORAGE_KEY_LAST_REFRESH);
      storage.removeItem(STORAGE_KEY_REFRESH_STATUS);
      storage.removeItem(STORAGE_KEY_SESSION_CORRELATION);
      storage.removeItem(STORAGE_KEY_REFRESH_COUNTER);
      storage.removeItem(STORAGE_KEY_LEASE);
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX_CANDIDATE)) {
          storage.removeItem(key);
        }
      }
    }
  } catch { }
}

export function markLoggedOut(): void {
  resetClientState();
  setStoredRefreshStatus('logged_out');
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type: 'ORBIT_LOGOUT', epoch: Date.now() });
    } catch {}
  }
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
        } catch { }
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
        } catch { }
      }
      if (authFailureHandler) {
        authFailureHandler();
      }
      return false;
    }

    // Record successful refresh timestamps and session correlation:
    const nowEpoch = Date.now();
    setStoredRefreshEpoch(nowEpoch);
    setStoredRefreshStatus('success');
    incrementStoredRefreshCounter();

    // Correlate active user session
    if (json.data?.user?.id) {
      currentUserId = json.data.user.id;
      setStoredSessionCorrelation({
        userId: json.data.user.id,
        sessionEpoch: nowEpoch,
      });
    }

    // Monotonic performance time for in-tab stale 401 interception
    lastSuccessfulRefreshTime = performance.now();

    // Notify sibling tabs via non-sensitive broadcast (no tokens or secrets)
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({
          type: 'ORBIT_REFRESH_COMPLETE',
          epoch: nowEpoch,
          userId: currentUserId,
        });
      } catch { }
    }

    return true;
  } catch {
    setStoredRefreshStatus('failed');
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({ type: 'ORBIT_REFRESH_FAILED', epoch: Date.now() });
      } catch { }
    }
    if (authFailureHandler) {
      authFailureHandler();
    }
    return false;
  }
}

/**
 * Cross-Tab Coordinated Token Refresh Mechanism.
 * Ensures that multiple simultaneous API requests across one or MORE browser tabs
 * do not trigger concurrent refresh operations, avoiding server-side token reuse / theft detection.
 *
 * Tier 1: Uses the W3C Web Locks API (navigator.locks) when available to serialize execution across tabs.
 * Fail-Closed Invariant: In environments lacking the Web Locks API (e.g. non-secure HTTP, restricted iframes,
 * or legacy engines), multi-tab mutual exclusion cannot be proven without an atomic CAS primitive.
 * Rather than risking concurrent refresh requests and session family theft revocation, the client fails closed safely.
 */
export async function requestTokenRefresh(dispatchEpoch?: number): Promise<boolean> {
  // If user has explicitly logged out, reject immediately
  if (getStoredRefreshStatus() === 'logged_out') {
    if (authFailureHandler) {
      authFailureHandler();
    }
    return false;
  }

  // If a refresh operation is already in-flight in THIS execution context, return existing promise
  if (refreshPromise) {
    return refreshPromise;
  }

  const queueCounter = getStoredRefreshCounter();

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
              if (
                getStoredRefreshCounter() > queueCounter ||
                isSiblingRefreshValid(dispatchEpoch)
              ) {
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
          if (
            getStoredRefreshCounter() > queueCounter ||
            isSiblingRefreshValid(dispatchEpoch)
          ) {
            lastSuccessfulRefreshTime = performance.now();
            return true;
          }

          // If no sibling tab completed a valid refresh, fail closed safely.
          setStoredRefreshStatus('failed');
          if (broadcastChannel) {
            try {
              broadcastChannel.postMessage({ type: 'ORBIT_REFRESH_FAILED', epoch: Date.now() });
            } catch { }
          }
          if (authFailureHandler) {
            authFailureHandler();
          }
          return false;
        }
      }

      // 2. Tier-2: When Web Locks API is unavailable
      // Without browser-engine-level mutual exclusion or an atomic compare-and-swap primitive,
      // multi-tab mutual exclusion cannot be guaranteed against preemption or tab suspension races.
      // Fail closed safely rather than risking concurrent refresh requests and session family theft revocation.
      console.warn(
        '[Orbit Auth] Web Locks API (navigator.locks) is unavailable. Failing closed safely to prevent uncoordinated multi-tab token rotation.'
      );
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
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export interface ApiRequestOptions extends RequestInit {
  _retry?: boolean;
}

/**
 * Universal Authenticated API Request Wrapper.
 * - Injects 'X-Organization-ID' header when currentOrgId is active.
 * - Injects 'X-Requested-With: XMLHttpRequest' for CSRF protection.
 * - Sends credentials: 'include' for ambient HTTP-only cookies.
 * - Catches 401 Unauthorized responses and performs coordinated token refresh.
 * - In-tab and cross-tab stale 401 interception: if another tab already completed
 *   a valid refresh after this request was sent, retries immediately without re-refreshing.
 * - Retries the original failed request exactly once upon successful refresh.
 */
export async function apiRequest<T>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const requestDispatchTime = performance.now();
  const requestDispatchEpoch = Date.now();
  const requestCounter = getStoredRefreshCounter();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest', // CSRF guard verification
    ...((options.headers as Record<string, string>) || {}),
  };

  if (currentOrgId && !headers['X-Organization-ID']) {
    headers['X-Organization-ID'] = currentOrgId;
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
    if (
      getStoredRefreshCounter() > requestCounter ||
      isSiblingRefreshValid(requestDispatchEpoch)
    ) {
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
