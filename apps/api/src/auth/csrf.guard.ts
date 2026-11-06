import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Cross-Site Request Forgery (CSRF) Guard for Cookie-Authenticated Endpoints.
 *
 * Security Design & Enforcement:
 * 1. Safe HTTP methods (GET, HEAD, OPTIONS) do not mutate state and are allowed.
 * 2. Requests without ambient credentials (cookies) are exempt; Bearer token API
 *    clients are not vulnerable to ambient credential CSRF.
 * 3. W3C Fetch Metadata (`Sec-Fetch-Site`):
 *    - `cross-site` is UNCONDITIONALLY REJECTED for cookie-authenticated state mutations.
 *    - The mere presence of `Sec-Fetch-Site` is NEVER treated as proof of authorization.
 *    - `same-origin` is accepted as verified same-origin browser metadata.
 *    - `same-site` requires verified Origin matching allowed origins or a valid custom header.
 * 4. Origin & Referer Validation:
 *    - If present, Origin or Referer MUST match the explicit allowed origins list.
 * 5. Custom Header Defense-in-Depth (`X-CSRF-Token`, `X-Requested-With`):
 *    - When Origin and Referer are absent, a valid custom header is required.
 *    - Security Contract: Custom headers prevent CSRF because the browser Same-Origin Policy (SOP)
 *      prevents cross-origin scripts from setting non-simple custom headers without CORS preflight.
 *      Since CORS is strictly scoped in main.ts, cross-site sites cannot forge custom headers.
 *    - Note: `X-Requested-With` is NOT a secret token; its security relies on browser preflight enforcement.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

  private readonly allowedOrigins: Set<string>;

  constructor() {
    const defaultOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:4000',
      'http://127.0.0.1:4000',
    ];

    if (process.env.FRONTEND_URL) {
      defaultOrigins.push(process.env.FRONTEND_URL.replace(/\/+$/, ''));
    }

    this.allowedOrigins = new Set(defaultOrigins);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    // 1. Safe HTTP methods do not mutate state
    if (this.safeMethods.has(method)) {
      return true;
    }

    // 2. Check for ambient cookie credentials (access_token or refresh_token)
    const hasAuthCookie = Boolean(
      request.cookies?.access_token || request.cookies?.refresh_token
    );

    // If no ambient cookies are present (e.g. pure Bearer token clients or unauthenticated requests),
    // browser ambient credential CSRF does not apply.
    if (!hasAuthCookie) {
      return true;
    }

    // 3. W3C Fetch Metadata: Check Sec-Fetch-Site explicitly
    const rawSecFetchSite = request.headers['sec-fetch-site'];
    const secFetchSite = typeof rawSecFetchSite === 'string' ? rawSecFetchSite.trim().toLowerCase() : undefined;

    // Explicitly reject any cross-site cookie-authenticated state mutation
    if (secFetchSite === 'cross-site') {
      throw new ForbiddenException(
        'Cross-Site Request Forgery (CSRF) blocked: Sec-Fetch-Site is cross-site'
      );
    }

    // 4. Extract Origin or Referer
    const originHeader = request.headers['origin'] as string | undefined;
    const refererHeader = request.headers['referer'] as string | undefined;

    let requestOrigin: string | undefined;

    if (originHeader) {
      requestOrigin = originHeader.trim().replace(/\/+$/, '');
    } else if (refererHeader) {
      try {
        const url = new URL(refererHeader);
        requestOrigin = url.origin;
      } catch {
        throw new ForbiddenException('Invalid CSRF Referer header');
      }
    }

    // If Origin or Referer is present, it MUST match the allowed origins list
    if (requestOrigin) {
      if (!this.allowedOrigins.has(requestOrigin)) {
        throw new ForbiddenException(
          `Cross-Site Request Forgery (CSRF) blocked: Origin '${requestOrigin}' is not authorized`
        );
      }
      return true;
    }

    // 5. Origin and Referer are both absent:
    // If Sec-Fetch-Site is explicitly 'same-origin', the browser guarantees same-origin provenance
    if (secFetchSite === 'same-origin') {
      return true;
    }

    // 6. Custom Header Defense: Check X-CSRF-Token or X-Requested-With
    // The presence of a non-empty custom header guarantees CORS preflight was required and passed
    const rawCsrfToken = request.headers['x-csrf-token'];
    const rawRequestedWith = request.headers['x-requested-with'];

    const hasValidCustomHeader =
      (typeof rawCsrfToken === 'string' && rawCsrfToken.trim().length > 0) ||
      (typeof rawRequestedWith === 'string' && rawRequestedWith.trim().length > 0);

    if (hasValidCustomHeader) {
      return true;
    }

    // If all security indicators are missing, fail closed
    throw new ForbiddenException(
      'Cross-Site Request Forgery (CSRF) blocked: Missing security context (Origin/Referer/Custom Header)'
    );
  }
}
