import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response, Request } from 'express';
import { RateLimiterService, RateLimitOptions } from './rate-limiter.service';

export const RATE_LIMIT_METADATA = 'orbit:rate_limit_options';

export interface RateLimitDecoratorConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
  keyBy?: 'ip' | 'user' | 'org';
}

export const RateLimit = (config: RateLimitDecoratorConfig) =>
  SetMetadata(RATE_LIMIT_METADATA, config);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RateLimiterService) private readonly rateLimiter: RateLimiterService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const config = this.reflector.getAllAndOverride<RateLimitDecoratorConfig | undefined>(
      RATE_LIMIT_METADATA,
      [context.getHandler(), context.getClass()]
    );

    // If no rate limit metadata defined, allow request
    if (!config) {
      return true;
    }

    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const res = httpContext.getResponse<Response>();

    // In test environment, bypass rate limiting unless explicitly tested
    if (process.env.NODE_ENV === 'test' && !req.headers?.['x-test-rate-limit']) {
      return true;
    }

    // Determine client identifier
    const clientIp = this.getClientIp(req);
    let key = `${config.keyPrefix || 'rl'}:${clientIp}`;

    if (config.keyBy === 'user' && (req as any).user?.id) {
      key = `${config.keyPrefix || 'rl_user'}:${(req as any).user.id}`;
    } else if (config.keyBy === 'org') {
      const orgId = req.headers['x-organization-id'] || (req as any).organizationId;
      if (orgId) {
        key = `${config.keyPrefix || 'rl_org'}:${orgId}`;
      }
    }

    const result = this.rateLimiter.checkLimit(key, {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      keyPrefix: config.keyPrefix,
    });

    if (res && typeof res.setHeader === 'function') {
      res.setHeader('X-RateLimit-Limit', result.limit.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', new Date(result.resetTimeMs).toISOString());
    }

    if (!result.allowed) {
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('Retry-After', result.retryAfterSec.toString());
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please wait before retrying.',
          retryAfterSec: result.retryAfterSec,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return true;
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return first.trim();
    }
    return req.ip || req.socket.remoteAddress || '127.0.0.1';
  }
}
