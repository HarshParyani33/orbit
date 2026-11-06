import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

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

    // 2. Determine if the request uses ambient cookie credentials
    const hasAuthCookie = Boolean(
      request.cookies?.access_token || request.cookies?.refresh_token
    );

    // If no cookies are present (e.g. pure Bearer token programmatic requests or unauthenticated registration/login), CSRF via ambient cookie does not apply
    if (!hasAuthCookie) {
      return true;
    }

    // 3. For cookie-authenticated state mutations, verify Origin / Referer
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

    // If an Origin or Referer is supplied, it MUST match one of the allowed origins
    if (requestOrigin) {
      if (!this.allowedOrigins.has(requestOrigin)) {
        throw new ForbiddenException(
          `Cross-Site Request Forgery (CSRF) blocked: Origin '${requestOrigin}' is not authorized`
        );
      }
      return true;
    }

    // If both Origin and Referer are absent on a cookie-authenticated mutation, require a custom security header (e.g. X-Requested-With or X-CSRF-Token)
    const customHeader =
      request.headers['x-csrf-token'] ||
      request.headers['x-requested-with'] ||
      request.headers['sec-fetch-site'];

    if (!customHeader) {
      throw new ForbiddenException(
        'Cross-Site Request Forgery (CSRF) blocked: Missing Origin/Referer on cookie-authenticated mutation'
      );
    }

    return true;
  }
}
