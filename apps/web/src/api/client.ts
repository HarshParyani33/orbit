import { ApiResponse } from '@orbit/shared';

let currentOrgId: string | null = null;
let currentUserId: string | null = null;
let lastAssociatedUserId: string | null = null;
let currentSessionEpoch = 0;
let refreshPromise: Promise<boolean> | null = null;
let authFailureHandler: (() => void) | null = null;
let lastSuccessfulRefreshTime = 0;
let lastBroadcastRefreshEpoch = 0;
let lastBroadcastRefreshCounter = 0;
let isTabLoggedOut = false;

// Shared Storage & Web Lock Constants for Cross-Tab Coordination
const STORAGE_KEY_LAST_REFRESH = 'orbit_auth_last_refresh_epoch';
const STORAGE_KEY_REFRESH_STATUS = 'orbit_auth_last_refresh_status';
const STORAGE_KEY_SESSION_CORRELATION = 'orbit_auth_session_correlation';
const STORAGE_KEY_LOGOUT_RECORD = 'orbit_auth_logout_record';
const STORAGE_KEY_REFRESH_COUNTER = 'orbit_auth_refresh_counter';
const STORAGE_KEY_LEASE = 'orbit_auth_refresh_lease';
const STORAGE_PREFIX_CANDIDATE = 'orbit_auth_candidate_';
const LOCK_NAME = 'orbit_auth_refresh_lock';
const LOCK_TIMEOUT_MS = 10000;

export interface SessionCorrelation {
  userId: string;
  sessionEpoch: number;
}

export interface LogoutRecord {
  userId: string | null;
  logoutEpoch: number;
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
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      const msgEpoch = typeof msg.epoch === 'number' ? msg.epoch : 0;

      // STALE BROADCAST PROTECTION (Invariant 3D):
      // Ignore broadcast messages belonging to an older session generation than this tab's active session
      if (currentSessionEpoch > 0 && msgEpoch < currentSessionEpoch) {
        return;
      }

      // USER IDENTITY MISMATCH PROTECTION:
      // If message is associated with a specific user, and current tab has a different active user, ignore it
      if (msg.userId && currentUserId && msg.userId !== currentUserId) {
        return;
      }

      if (msg.type === 'ORBIT_REFRESH_COMPLETE') {
        const refreshEpoch = typeof msg.epoch === 'number' ? msg.epoch : 0;
        const refreshCounter = typeof msg.counter === 'number' ? msg.counter : 0;
        if (refreshEpoch > lastBroadcastRefreshEpoch) {
          lastBroadcastRefreshEpoch = refreshEpoch;
        }
        if (refreshCounter > lastBroadcastRefreshCounter) {
          lastBroadcastRefreshCounter = refreshCounter;
        }
        lastSuccessfulRefreshTime = performance.now();
        return;
      }

      if (
        msg.type === 'ORBIT_REFRESH_FAILED' ||
        msg.type === 'ORBIT_LOGOUT'
      ) {
        const wasAuthenticated = currentSessionEpoch > 0 || currentUserId !== null || !isTabLoggedOut;
        isTabLoggedOut = true;
        currentUserId = null;
        currentOrgId = null;
        currentSessionEpoch = 0;
        lastSuccessfulRefreshTime = 0;
        lastBroadcastRefreshEpoch = 0;
        lastBroadcastRefreshCounter = 0;
        if (wasAuthenticated && authFailureHandler) {
          authFailureHandler();
        }
      }
    };
  }
} catch {
  // BroadcastChannel unavailable in some environments
}

export function getBroadcastChannel(): any {
  return broadcastChannel;
}

export function setActiveOrgId(orgId: string | null) {
  currentOrgId = orgId;
}

export function getActiveOrgId(): string | null {
  return currentOrgId;
}

export function setActiveUserId(userId: string | null, sessionEpoch?: number) {
  currentUserId = userId;
  if (userId) {
    lastAssociatedUserId = userId;
    isTabLoggedOut = false;
    const epoch = sessionEpoch || (currentSessionEpoch > 0 ? currentSessionEpoch : Date.now());
    currentSessionEpoch = epoch;
    // If shared storage had an older logged_out marker, establish this active session
    const logoutRec = getStoredLogoutRecord();
    if (!logoutRec || epoch > logoutRec.logoutEpoch) {
      if (getStoredRefreshStatus() === 'logged_out') {
        setStoredRefreshStatus('success');
      }
      const existingCorr = getStoredSessionCorrelation();
      if (!existingCorr || existingCorr.userId !== userId || epoch > existingCorr.sessionEpoch) {
        setStoredSessionCorrelation({
          userId,
          sessionEpoch: epoch,
        });
      }
    }
  } else {
    currentSessionEpoch = 0;
  }
}

export function getActiveUserId(): string | null {
  return currentUserId;
}

export function getCurrentSessionEpoch(): number {
  return currentSessionEpoch;
}

export function setCurrentSessionEpoch(epoch: number): void {
  currentSessionEpoch = epoch;
}

export function isTabSessionLoggedOut(): boolean {
  return isTabLoggedOut;
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
  } catch { }
  const memVal = memoryStorage[STORAGE_KEY_SESSION_CORRELATION];
  if (memVal) {
    try {
      return JSON.parse(memVal);
    } catch { }
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
  } catch { }
  if (correlation) {
    memoryStorage[STORAGE_KEY_SESSION_CORRELATION] = JSON.stringify(correlation);
  } else {
    delete memoryStorage[STORAGE_KEY_SESSION_CORRELATION];
  }
}

export function getStoredLogoutRecord(): LogoutRecord | null {
  try {
    const storage = getLocalStorage();
    if (storage) {
      const val = storage.getItem(STORAGE_KEY_LOGOUT_RECORD);
      if (val) return JSON.parse(val);
    }
  } catch { }
  const memVal = memoryStorage[STORAGE_KEY_LOGOUT_RECORD];
  if (memVal) {
    try {
      return JSON.parse(memVal);
    } catch { }
  }
  return null;
}

export function setStoredLogoutRecord(record: LogoutRecord | null): void {
  try {
    const storage = getLocalStorage();
    if (storage) {
      if (record) {
        storage.setItem(STORAGE_KEY_LOGOUT_RECORD, JSON.stringify(record));
      } else {
        storage.removeItem(STORAGE_KEY_LOGOUT_RECORD);
      }
    }
  } catch { }
  if (record) {
    memoryStorage[STORAGE_KEY_LOGOUT_RECORD] = JSON.stringify(record);
  } else {
    delete memoryStorage[STORAGE_KEY_LOGOUT_RECORD];
  }
}

/**
 * Determines whether a stored logout event is authoritative for the given session epoch.
 * A logout is authoritative for an execution context if:
 * 1. An explicit logout record exists with logoutEpoch >= sessionEpoch, OR
 * 2. Shared status is 'logged_out' and no newer session correlation exists.
 */
export function isLogoutAuthoritativeForSession(sessionEpoch: number): boolean {
  const logoutRec = getStoredLogoutRecord();
  if (logoutRec && logoutRec.logoutEpoch >= sessionEpoch) {
    return true;
  }
  if (getStoredRefreshStatus() === 'logged_out') {
    const correlation = getStoredSessionCorrelation();
    if (!correlation || correlation.sessionEpoch <= (logoutRec?.logoutEpoch || 0)) {
      return true;
    }
  }
  return false;
}

export function getStoredRefreshCounter(): number {
  try {
    const storage = getLocalStorage();
    if (storage) {
      const val = storage.getItem(STORAGE_KEY_REFRESH_COUNTER);
      if (val) return parseInt(val, 10) || 0;
    }
  } catch { }
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
  } catch { }
  memoryStorage[STORAGE_KEY_REFRESH_COUNTER] = String(next);
  return next;
}

/**
 * Validates whether a sibling tab's refresh completion is valid and matches the current session.
 * Prevents cross-session credential contamination after account switch or logout.
 * Sibling refresh reuse is strictly conditional on valid session correlation and forward progress.
 */
export function isSiblingRefreshValid(
  dispatchEpoch?: number,
  queueCounter?: number
): boolean {
  const storedRefresh = getStoredRefreshEpoch();
  const storedStatus = getStoredRefreshStatus();

  // 1. Must have explicit success status (not 'failed', not 'logged_out', not null)
  if (storedStatus !== 'success') {
    return false;
  }

  // Check if a logout occurred after this tab's session
  if (isLogoutAuthoritativeForSession(currentSessionEpoch)) {
    return false;
  }

  // 2. Must demonstrate verified forward progress (timing epoch or monotonic counter)
  // Combines shared storage and BroadcastChannel to neutralize Chromium cross-process IPC delay
  const effectiveStoredRefresh = Math.max(storedRefresh, lastBroadcastRefreshEpoch);
  const effectiveStoredCounter = Math.max(getStoredRefreshCounter(), lastBroadcastRefreshCounter);

  const hasTimingProgress = dispatchEpoch ? effectiveStoredRefresh > dispatchEpoch : false;
  const hasCounterProgress =
    queueCounter !== undefined ? effectiveStoredCounter > queueCounter : false;

  if (!hasTimingProgress && !hasCounterProgress) {
    return false;
  }

  // 3. Must have valid session correlation (identity must exist)
  const correlation = getStoredSessionCorrelation();
  if (!correlation || !correlation.userId) {
    return false;
  }

  // 4. If current tab is associated with an active user, the refreshed session MUST match that exact user
  if (currentUserId && correlation.userId !== currentUserId) {
    // Sibling refresh belongs to a different user account (e.g. account switch in another tab)
    return false;
  }

  // Never adopt a sibling session if this tab has been logged out and no newer session exists
  if (isTabLoggedOut && isLogoutAuthoritativeForSession(correlation.sessionEpoch)) {
    return false;
  }

  // If current tab was unauthenticated, adopt the verified active session identity
  if (!currentUserId && correlation.userId) {
    currentUserId = correlation.userId;
    currentSessionEpoch = correlation.sessionEpoch;
    isTabLoggedOut = false;
  }

  return true;
}

export function resetClientState(): void {
  currentOrgId = null;
  currentUserId = null;
  currentSessionEpoch = 0;
  refreshPromise = null;
  authFailureHandler = null;
  lastSuccessfulRefreshTime = 0;
  lastBroadcastRefreshEpoch = 0;
  lastBroadcastRefreshCounter = 0;
  isTabLoggedOut = false;
  memoryStorage = {};
  try {
    const storage = getLocalStorage();
    if (storage) {
      storage.removeItem(STORAGE_KEY_LAST_REFRESH);
      storage.removeItem(STORAGE_KEY_REFRESH_STATUS);
      storage.removeItem(STORAGE_KEY_SESSION_CORRELATION);
      storage.removeItem(STORAGE_KEY_LOGOUT_RECORD);
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
  const logoutUserId = currentUserId;
  const logoutEpoch = Date.now();
  resetClientState();
  isTabLoggedOut = true;
  setStoredRefreshStatus('logged_out');
  setStoredLogoutRecord({
    userId: logoutUserId,
    logoutEpoch,
  });
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({
        type: 'ORBIT_LOGOUT',
        epoch: logoutEpoch,
        userId: logoutUserId,
      });
    } catch { }
  }
}

/**
 * Executes the actual network refresh request.
 * Never exposes refresh tokens to JavaScript; uses ambient HTTP-only cookies.
 */
async function executeSingleFlightRefresh(
  originatingEpoch = currentSessionEpoch,
  originatingUserId = currentUserId
): Promise<boolean> {
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
      const correlation = getStoredSessionCorrelation();
      if (!correlation || correlation.sessionEpoch <= originatingEpoch) {
        setStoredRefreshStatus('failed');
      }
      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({
            type: 'ORBIT_REFRESH_FAILED',
            epoch: originatingEpoch,
            userId: originatingUserId,
          });
        } catch { }
      }
      if (
        currentSessionEpoch <= originatingEpoch &&
        (!originatingUserId || currentUserId === originatingUserId)
      ) {
        isTabLoggedOut = true;
        currentUserId = null;
        currentOrgId = null;
        currentSessionEpoch = 0;
        if (authFailureHandler) {
          authFailureHandler();
        }
      }
      return false;
    }

    const json: ApiResponse<any> = await response.json().catch(() => ({
      success: false,
    }));

    if (!json.success) {
      const correlation = getStoredSessionCorrelation();
      if (!correlation || correlation.sessionEpoch <= originatingEpoch) {
        setStoredRefreshStatus('failed');
      }
      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({
            type: 'ORBIT_REFRESH_FAILED',
            epoch: originatingEpoch,
            userId: originatingUserId,
          });
        } catch { }
      }
      if (
        currentSessionEpoch <= originatingEpoch &&
        (!originatingUserId || currentUserId === originatingUserId)
      ) {
        isTabLoggedOut = true;
        currentUserId = null;
        currentOrgId = null;
        currentSessionEpoch = 0;
        if (authFailureHandler) {
          authFailureHandler();
        }
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
      if (
        currentSessionEpoch <= originatingEpoch &&
        (!originatingUserId || currentUserId === originatingUserId)
      ) {
        currentUserId = json.data.user.id;
        currentSessionEpoch = nowEpoch;
        setStoredSessionCorrelation({
          userId: json.data.user.id,
          sessionEpoch: nowEpoch,
        });
      }
    }

    // Monotonic performance time for in-tab stale 401 interception
    lastSuccessfulRefreshTime = performance.now();

    // Notify sibling tabs via non-sensitive broadcast (no tokens or secrets)
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({
          type: 'ORBIT_REFRESH_COMPLETE',
          epoch: nowEpoch,
          counter: getStoredRefreshCounter(),
          userId: currentUserId,
        });
      } catch { }
    }

    return true;
  } catch {
    const correlation = getStoredSessionCorrelation();
    if (!correlation || correlation.sessionEpoch <= originatingEpoch) {
      setStoredRefreshStatus('failed');
    }
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({
          type: 'ORBIT_REFRESH_FAILED',
          epoch: originatingEpoch,
          userId: originatingUserId,
        });
      } catch { }
    }
    if (
      currentSessionEpoch <= originatingEpoch &&
      (!originatingUserId || currentUserId === originatingUserId)
    ) {
      isTabLoggedOut = true;
      currentUserId = null;
      currentOrgId = null;
      currentSessionEpoch = 0;
      if (authFailureHandler) {
        authFailureHandler();
      }
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
  // If user has explicitly logged out, or this tab received a cross-tab logout,
  // verify whether that logout is authoritative for this tab's session epoch
  if (isTabLoggedOut || isLogoutAuthoritativeForSession(currentSessionEpoch)) {
    // Check if shared storage has a newer valid session for this user established after the logout
    const correlation = getStoredSessionCorrelation();
    const logoutRec = getStoredLogoutRecord();
    const targetUserId = currentUserId || lastAssociatedUserId;
    const hasNewerSession =
      correlation &&
      (!logoutRec || correlation.sessionEpoch > logoutRec.logoutEpoch) &&
      (targetUserId ? correlation.userId === targetUserId : false);

    if (hasNewerSession) {
      isTabLoggedOut = false;
      currentUserId = correlation.userId;
      lastAssociatedUserId = correlation.userId;
      currentSessionEpoch = correlation.sessionEpoch;
    } else {
      if (authFailureHandler) {
        authFailureHandler();
      }
      return false;
    }
  }

  // Account switch guard: if this tab is associated with user A, but active session belongs to user B
  if (currentUserId) {
    const correlation = getStoredSessionCorrelation();
    if (correlation && correlation.userId !== currentUserId) {
      isTabLoggedOut = true;
      if (authFailureHandler) {
        authFailureHandler();
      }
      return false;
    }
  }

  // If a refresh operation is already in-flight in THIS execution context, return existing promise
  if (refreshPromise) {
    return refreshPromise;
  }

  const originatingEpoch = currentSessionEpoch;
  const originatingUserId = currentUserId;
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

              // 1. Immediate check: Check if sibling refresh completed and synchronized
              if (isSiblingRefreshValid(dispatchEpoch, queueCounter)) {
                lastSuccessfulRefreshTime = performance.now();
                return true;
              }

              // 2. Cross-renderer synchronization window:
              // In multi-process Chromium, localStorage IPC between separate renderer processes has microsecond-to-millisecond latency.
              // Yield briefly to event loop / IPC channel to absorb any in-flight sibling refresh completion before initiating network flight.
              await new Promise((resolve) => setTimeout(resolve, 50));
              if (isSiblingRefreshValid(dispatchEpoch, queueCounter)) {
                lastSuccessfulRefreshTime = performance.now();
                return true;
              }

              return await executeSingleFlightRefresh(originatingEpoch, originatingUserId);
            }
          );
        } catch {
          clearTimeout(timeoutId);
          // If lock acquisition timed out or failed (e.g. aborted or unresponsive lock holder),
          // DO NOT execute an uncoordinated direct refresh, as doing so bypasses mutual exclusion
          // and risks concurrent token rotation and session family theft revocation.
          // First, check whether another tab successfully completed refresh in the interim:
          if (isSiblingRefreshValid(dispatchEpoch, queueCounter)) {
            lastSuccessfulRefreshTime = performance.now();
            return true;
          }

          // If no sibling tab completed a valid refresh, fail closed safely.
          const correlation = getStoredSessionCorrelation();
          if (!correlation || correlation.sessionEpoch <= originatingEpoch) {
            setStoredRefreshStatus('failed');
          }
          if (broadcastChannel) {
            try {
              broadcastChannel.postMessage({
                type: 'ORBIT_REFRESH_FAILED',
                epoch: originatingEpoch,
                userId: originatingUserId,
              });
            } catch { }
          }
          if (
            currentSessionEpoch <= originatingEpoch &&
            (!originatingUserId || currentUserId === originatingUserId)
          ) {
            isTabLoggedOut = true;
            currentUserId = null;
            currentOrgId = null;
            currentSessionEpoch = 0;
            if (authFailureHandler) {
              authFailureHandler();
            }
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
      const correlation = getStoredSessionCorrelation();
      if (!correlation || correlation.sessionEpoch <= originatingEpoch) {
        setStoredRefreshStatus('failed');
      }
      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({
            type: 'ORBIT_REFRESH_FAILED',
            epoch: originatingEpoch,
            userId: originatingUserId,
          });
        } catch { }
      }
      if (
        currentSessionEpoch <= originatingEpoch &&
        (!originatingUserId || currentUserId === originatingUserId)
      ) {
        isTabLoggedOut = true;
        currentUserId = null;
        currentOrgId = null;
        currentSessionEpoch = 0;
        if (authFailureHandler) {
          authFailureHandler();
        }
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
  const isCoreAuthEndpoint =
    endpoint.includes('/api/auth/login') ||
    endpoint.includes('/api/auth/register') ||
    endpoint.includes('/api/auth/refresh') ||
    endpoint.includes('/api/auth/logout');

  const isProfileEndpoint = endpoint.includes('/api/auth/me');

  // If this tab was invalidated by logout, fail closed immediately on protected resources (unless verifying profile)
  if (isTabLoggedOut && !isCoreAuthEndpoint && !isProfileEndpoint) {
    // Check if shared storage has a newer valid session for this user established after the logout
    const correlation = getStoredSessionCorrelation();
    const logoutRec = getStoredLogoutRecord();
    const targetUserId = currentUserId || lastAssociatedUserId;
    const hasNewerSession =
      correlation &&
      (!logoutRec || correlation.sessionEpoch > logoutRec.logoutEpoch) &&
      (targetUserId ? correlation.userId === targetUserId : false);

    if (hasNewerSession) {
      isTabLoggedOut = false;
      currentUserId = correlation.userId;
      lastAssociatedUserId = correlation.userId;
      currentSessionEpoch = correlation.sessionEpoch;
    } else {
      if (authFailureHandler) {
        authFailureHandler();
      }
      throw new Error('Session expired or revoked. Please log in again.');
    }
  }

  if (response.status === 401 && !options._retry && !isCoreAuthEndpoint) {
    // 0. Account switch check: if this tab belongs to user A, but active session was switched to user B
    if (currentUserId) {
      const correlation = getStoredSessionCorrelation();
      if (correlation && correlation.userId !== currentUserId) {
        isTabLoggedOut = true;
        if (authFailureHandler) {
          authFailureHandler();
        }
        throw new Error('Session expired or revoked. Please log in again.');
      }
    }

    // 1. In-tab monotonic stale 401 check
    if (lastSuccessfulRefreshTime > requestDispatchTime) {
      return apiRequest<T>(endpoint, {
        ...options,
        _retry: true,
      });
    }

    // 2. Cross-tab stale 401 check: did another tab already refresh after this request was sent?
    if (isSiblingRefreshValid(requestDispatchEpoch, requestCounter)) {
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

  // Automatically sync session correlation on successful authentication operations
  if (
    endpoint.includes('/api/auth/login') ||
    endpoint.includes('/api/auth/register') ||
    endpoint.includes('/api/auth/me')
  ) {
    const user = (json.data as any)?.user;
    if (user?.id) {
      isTabLoggedOut = false;
      currentUserId = user.id;
      lastAssociatedUserId = user.id;
      const nowEpoch = Date.now();
      currentSessionEpoch = nowEpoch;
      setStoredRefreshEpoch(nowEpoch);
      setStoredRefreshStatus('success');
      incrementStoredRefreshCounter();
      setStoredSessionCorrelation({
        userId: user.id,
        sessionEpoch: nowEpoch,
      });
    }
  }

  if (endpoint.includes('/api/auth/logout')) {
    markLoggedOut();
  }

  return json.data as T;
}
