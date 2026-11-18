import { ApiResponse } from '@orbit/shared';

let currentOrgId: string | null = null;
let refreshPromise: Promise<boolean> | null = null;
let authFailureHandler: (() => void) | null = null;
let lastSuccessfulRefreshTime = 0;

// Shared Storage & Web Lock Constants for Cross-Tab Coordination
const STORAGE_KEY_LAST_REFRESH = 'orbit_auth_last_refresh_epoch';
const STORAGE_KEY_REFRESH_STATUS = 'orbit_auth_last_refresh_status';
const LOCK_NAME = 'orbit_auth_refresh_lock';
const LOCK_TIMEOUT_MS = 10000;

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
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(STORAGE_KEY_LAST_REFRESH);
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
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_LAST_REFRESH, String(epoch));
    }
  } catch {}
  memoryStorage[STORAGE_KEY_LAST_REFRESH] = String(epoch);
}

export function getStoredRefreshStatus(): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY_REFRESH_STATUS);
    }
  } catch {}
  return memoryStorage[STORAGE_KEY_REFRESH_STATUS] || null;
}

export function setStoredRefreshStatus(status: 'success' | 'failed'): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_REFRESH_STATUS, status);
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
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_LAST_REFRESH);
      localStorage.removeItem(STORAGE_KEY_REFRESH_STATUS);
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
 * Cross-Tab Coordinated Token Refresh Mechanism.
 * Ensures that multiple simultaneous API requests across one or MORE browser tabs
 * do not trigger concurrent refresh operations, avoiding server-side token reuse / theft detection.
 *
 * Uses the Web Locks API (navigator.locks) when available to serialize execution across tabs.
 * If another tab completes refresh while this tab was queued, this tab reuses the freshly rotated cookie.
 */
export async function requestTokenRefresh(dispatchEpoch?: number): Promise<boolean> {
  // If a refresh operation is already in-flight in THIS execution context, return existing promise
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      // 1. Cross-tab coordination via Web Locks API when available
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
              if (dispatchEpoch && storedRefresh > dispatchEpoch) {
                lastSuccessfulRefreshTime = performance.now();
                return true;
              }

              // If a refresh succeeded very recently (< 1500ms), reuse the ambient cookie
              if (storedRefresh > 0 && Date.now() - storedRefresh < 1500) {
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
          if (dispatchEpoch && storedRefresh > dispatchEpoch) {
            lastSuccessfulRefreshTime = performance.now();
            return true;
          }

          if (storedRefresh > 0 && Date.now() - storedRefresh < 1500) {
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

      // 2. Fallback for environments without Web Locks API
      return await executeSingleFlightRefresh();
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
    if (storedRefresh > requestDispatchEpoch) {
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
