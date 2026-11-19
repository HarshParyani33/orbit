import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiterService } from '../../apps/api/src/auth/rate-limiter.service';

describe('RateLimiterService — Tiered Protection & Sliding Window', () => {
  let rateLimiter: RateLimiterService;

  beforeEach(() => {
    rateLimiter = new RateLimiterService();
  });

  it('allows requests within the configured max limit', () => {
    const key = 'ip:127.0.0.1:auth_login';
    const options = { maxRequests: 5, windowMs: 60000 };

    for (let i = 1; i <= 5; i++) {
      const result = rateLimiter.checkLimit(key, options);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5 - i);
    }
  });

  it('blocks requests once the max limit is exceeded with correct retryAfterSec', () => {
    const key = 'ip:192.168.1.100:auth_login';
    const options = { maxRequests: 3, windowMs: 10000 };

    rateLimiter.checkLimit(key, options); // 1
    rateLimiter.checkLimit(key, options); // 2
    rateLimiter.checkLimit(key, options); // 3

    // 4th request exceeds limit
    const blocked = rateLimiter.checkLimit(key, options);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(10);
  });

  it('tracks different keys independently', () => {
    const options = { maxRequests: 2, windowMs: 60000 };

    rateLimiter.checkLimit('ip:10.0.0.1', options);
    rateLimiter.checkLimit('ip:10.0.0.1', options);
    expect(rateLimiter.checkLimit('ip:10.0.0.1', options).allowed).toBe(false);

    // Another IP should still be allowed
    expect(rateLimiter.checkLimit('ip:10.0.0.2', options).allowed).toBe(true);
  });

  it('resets key correctly when requested', () => {
    const key = 'ip:10.0.0.5';
    const options = { maxRequests: 1, windowMs: 60000 };

    rateLimiter.checkLimit(key, options);
    expect(rateLimiter.checkLimit(key, options).allowed).toBe(false);

    rateLimiter.reset(key);
    expect(rateLimiter.checkLimit(key, options).allowed).toBe(true);
  });
});
