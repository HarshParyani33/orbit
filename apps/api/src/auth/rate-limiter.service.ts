import { Injectable, Logger } from '@nestjs/common';

export interface RateLimitOptions {
  keyPrefix?: string;
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTimeMs: number;
  retryAfterSec: number;
}

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  // In-memory sliding window store: Map<key, timestamp[]>
  private readonly hitBuckets = new Map<string, number[]>();
  private lastCleanupTime = Date.now();

  /**
   * Checks whether a request should be allowed under sliding-window rate limiting.
   */
  public checkLimit(key: string, options: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const windowStart = now - options.windowMs;

    // Periodic cleanup of stale buckets every 60 seconds
    if (now - this.lastCleanupTime > 60000) {
      this.cleanup(windowStart);
      this.lastCleanupTime = now;
    }

    let timestamps = this.hitBuckets.get(key);
    if (!timestamps) {
      timestamps = [];
      this.hitBuckets.set(key, timestamps);
    }

    // Filter out timestamps outside the active window
    const validTimestamps = timestamps.filter((t) => t > windowStart);
    this.hitBuckets.set(key, validTimestamps);

    const remaining = Math.max(0, options.maxRequests - validTimestamps.length);
    const resetTimeMs = validTimestamps.length > 0 ? validTimestamps[0] + options.windowMs : now + options.windowMs;
    const retryAfterSec = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));

    if (validTimestamps.length >= options.maxRequests) {
      return {
        allowed: false,
        limit: options.maxRequests,
        remaining: 0,
        resetTimeMs,
        retryAfterSec,
      };
    }

    // Record the current hit
    validTimestamps.push(now);

    return {
      allowed: true,
      limit: options.maxRequests,
      remaining: options.maxRequests - validTimestamps.length,
      resetTimeMs,
      retryAfterSec,
    };
  }

  /**
   * Resets rate limit records for a key (useful for tests and manual resets).
   */
  public reset(key: string): void {
    this.hitBuckets.delete(key);
  }

  /**
   * Clears all buckets.
   */
  public clearAll(): void {
    this.hitBuckets.clear();
  }

  private cleanup(windowStart: number): void {
    for (const [key, timestamps] of this.hitBuckets.entries()) {
      const active = timestamps.filter((t) => t > windowStart);
      if (active.length === 0) {
        this.hitBuckets.delete(key);
      } else {
        this.hitBuckets.set(key, active);
      }
    }
  }
}
