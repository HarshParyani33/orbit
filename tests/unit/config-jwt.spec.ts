import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateConfig, getConfig, resetConfigCache } from '../../packages/config/src';
import { TokenService } from '../../apps/api/src/auth/token.service';
import { JwtService } from '@nestjs/jwt';

describe('JWT Secret Enforcement & Configuration Fail-Fast Unit Tests', () => {
  const baseValidEnv = {
    DATABASE_URL: 'postgresql://orbit_app:pass@127.0.0.1:5432/orbit_db',
    REDIS_URL: 'redis://127.0.0.1:6379',
    FRONTEND_URL: 'http://localhost:5173',
  };

  beforeEach(() => {
    resetConfigCache();
  });

  afterEach(() => {
    resetConfigCache();
  });

  it('1. production startup fails when JWT_SECRET is missing or empty', () => {
    expect(() => {
      validateConfig({
        ...baseValidEnv,
        NODE_ENV: 'production',
        COOKIE_SECRET: 'super_secure_production_cookie_secret_at_least_32_chars',
        // JWT_SECRET missing
      });
    }).toThrow(/JWT_SECRET is required in production/i);

    expect(() => {
      validateConfig({
        ...baseValidEnv,
        NODE_ENV: 'production',
        JWT_SECRET: '   ',
        COOKIE_SECRET: 'super_secure_production_cookie_secret_at_least_32_chars',
      });
    }).toThrow(/JWT_SECRET is required in production/i);
  });

  it('2. production startup fails when JWT_SECRET is weak (< 32 characters)', () => {
    expect(() => {
      validateConfig({
        ...baseValidEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'too_short_jwt_secret',
        COOKIE_SECRET: 'super_secure_production_cookie_secret_at_least_32_chars',
      });
    }).toThrow(/JWT_SECRET must be at least 32 characters long in production/i);
  });

  it('3. production startup fails when JWT_SECRET matches known development defaults', () => {
    expect(() => {
      validateConfig({
        ...baseValidEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'dev_jwt_secret_key_minimum_32_characters_for_security_testing',
        COOKIE_SECRET: 'super_secure_production_cookie_secret_at_least_32_chars',
      });
    }).toThrow(/cannot use known insecure or development default secrets/i);
  });

  it('4. production startup fails when COOKIE_SECRET is missing or weak', () => {
    expect(() => {
      validateConfig({
        ...baseValidEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'super_secure_production_jwt_secret_at_least_32_chars_long',
        // COOKIE_SECRET missing
      });
    }).toThrow(/COOKIE_SECRET is required in production/i);

    expect(() => {
      validateConfig({
        ...baseValidEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'super_secure_production_jwt_secret_at_least_32_chars_long',
        COOKIE_SECRET: 'short_cookie_secret',
      });
    }).toThrow(/COOKIE_SECRET must be at least 32 characters long in production/i);
  });

  it('5. valid production configuration passes validation', () => {
    const validProdEnv = {
      ...baseValidEnv,
      NODE_ENV: 'production',
      JWT_SECRET: 'super_secure_production_jwt_secret_at_least_32_chars_long',
      COOKIE_SECRET: 'super_secure_production_cookie_secret_at_least_32_chars',
    };

    const config = validateConfig(validProdEnv);
    expect(config.NODE_ENV).toBe('production');
    expect(config.JWT_SECRET).toBe('super_secure_production_jwt_secret_at_least_32_chars_long');
    expect(config.COOKIE_SECRET).toBe('super_secure_production_cookie_secret_at_least_32_chars');
  });

  it('6. development mode allows explicit development defaults when secrets are not provided', () => {
    const devEnv = {
      ...baseValidEnv,
      NODE_ENV: 'development',
    };

    const config = validateConfig(devEnv);
    expect(config.NODE_ENV).toBe('development');
    expect(config.JWT_SECRET).toBe('dev_jwt_secret_key_minimum_32_characters_for_security_testing');
    expect(config.COOKIE_SECRET).toBe('dev_cookie_signing_secret_key_32_characters_long');
  });

  it('7. JWT signing and verification use the exact same validated configuration source', () => {
    const jwtSecret = 'test_custom_jwt_secret_key_for_verification_32_chars!';
    const config = getConfig({
      ...baseValidEnv,
      JWT_SECRET: jwtSecret,
      COOKIE_SECRET: 'test_cookie_signing_secret_32_chars_long!',
    });

    const jwtService = new JwtService({ secret: config.JWT_SECRET });
    const tokenService = new TokenService(jwtService);

    const payload = {
      sub: 'usr_test_123',
      email: 'test@orbit.local',
      name: 'Test User',
    };

    const signedToken = tokenService.generateAccessToken(payload);
    expect(typeof signedToken).toBe('string');

    // Token verifies cleanly with the same secret
    const verified = tokenService.verifyAccessToken(signedToken);
    expect(verified.sub).toBe('usr_test_123');
    expect(verified.email).toBe('test@orbit.local');

    // Verification fails if a different secret is used
    const attackerJwtService = new JwtService({ secret: 'wrong_secret_key_minimum_32_characters_long!' });
    expect(() => {
      attackerJwtService.verify(signedToken);
    }).toThrow();
  });

  it('8. error messages never print actual secret values', () => {
    const customInsecureSecret = 'dev_jwt_secret_key_minimum_32_characters_for_security_testing';
    try {
      validateConfig({
        ...baseValidEnv,
        NODE_ENV: 'production',
        JWT_SECRET: customInsecureSecret,
        COOKIE_SECRET: 'super_secure_cookie_secret_32_characters_long!',
      });
      expect.unreachable('Should have thrown validation error');
    } catch (err: any) {
      // Must NOT contain the literal secret string
      expect(err.message).not.toContain(customInsecureSecret);
      expect(err.message).toMatch(/cannot use known insecure or development default secrets/i);
    }
  });
});
