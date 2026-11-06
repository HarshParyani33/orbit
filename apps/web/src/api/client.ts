import { ApiResponse } from '@orbit/shared';

let currentOrgId: string | null = null;

export function setActiveOrgId(orgId: string | null) {
  currentOrgId = orgId;
}

export function getActiveOrgId(): string | null {
  return currentOrgId;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (currentOrgId && !headers.has('X-Organization-Id')) {
    headers.set('X-Organization-Id', currentOrgId);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include', // Includes HTTP-only cookies
  });

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
