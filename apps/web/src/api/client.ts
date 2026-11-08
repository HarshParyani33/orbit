import { ApiResponse } from '@orbit/shared';

let currentOrgId: string | null = null;
let refreshPromise: Promise<boolean> | null = null;
let authFailureHandler: (() => void) | null = null;
let lastSuccessfulRefreshTime = 0;

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

export function resetClientState(): void {
  currentOrgId = null;
  refreshPromise = null;
  authFailureHandler = null;
  lastSuccessfulRefreshTime = 0;
}

/**
 * Single-Flight Token Refresh Mechanism.
 * Ensures that multiple simultaneous API requests receiving 401 do not trigger
 * concurrent refresh operations, avoiding server-side token reuse / theft detection.
 */
export async function requestTokenRefresh(): Promise<boolean> {
  // If a refresh operation is already in-flight, return the existing shared promise
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
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
        if (authFailureHandler) {
          authFailureHandler();
        }
        return false;
      }

      const json: ApiResponse<any> = await response.json().catch(() => ({
        success: false,
      }));

      if (!json.success) {
        if (authFailureHandler) {
          authFailureHandler();
        }
        return false;
      }

      // Record successful refresh timestamp for stale 401 interception
      lastSuccessfulRefreshTime = performance.now();
      return true;
    } catch {
      if (authFailureHandler) {
        authFailureHandler();
      }
      return false;
    } finally {
      // Clear the in-flight promise once completed
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

  // Handle 401 Unauthorized with single-flight refresh interceptor
  const isAuthEndpoint =
    endpoint.includes('/api/auth/login') ||
    endpoint.includes('/api/auth/register') ||
    endpoint.includes('/api/auth/refresh') ||
    endpoint.includes('/api/auth/logout');

  if (response.status === 401 && !options._retry && !isAuthEndpoint) {
    // Edge-case protection: If a token refresh already succeeded while this request was in flight,
    // the 401 response is stale. The updated credentials are already in the cookie jar.
    // Retry immediately without initiating a redundant and potentially conflicting second refresh.
    if (lastSuccessfulRefreshTime > requestDispatchTime) {
      return apiRequest<T>(endpoint, {
        ...options,
        _retry: true,
      });
    }

    // Wait for the single-flight refresh operation
    const refreshOk = await requestTokenRefresh();

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
