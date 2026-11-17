import { z } from 'zod';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from root if available
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
const INSECURE_DEFAULT_SECRETS = new Set([
  'dev_jwt_secret_key_minimum_32_characters_for_security_testing',
  'dev_cookie_signing_secret_key_32_characters_long',
  'dev_widget_session_signing_secret_key_32_characters',
  'secret',
  'changeme',
  'password',
  'jwt_secret',
]);

  // Database URLs for specific roles
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  MIGRATION_DATABASE_URL: z.string().optional(),
  INGRESS_DATABASE_URL: z.string().optional(),
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(4000),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
    // Database URLs for specific roles
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    MIGRATION_DATABASE_URL: z.string().optional(),
    INGRESS_DATABASE_URL: z.string().optional(),

  // JWT & Cryptographic Secrets
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be at least 16 characters').optional(),
  WIDGET_JWT_SECRET: z.string().optional(),
});
    // Redis
    REDIS_URL: z.string().default('redis://localhost:6379'),

export type EnvConfig = z.infer<typeof envSchema>;
    // JWT & Cryptographic Secrets
    JWT_SECRET: z.string().optional(),
    COOKIE_SECRET: z.string().optional(),
    WIDGET_JWT_SECRET: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const isProd = data.NODE_ENV === 'production';

    // 1. JWT_SECRET Validation
    if (isProd) {
      if (!data.JWT_SECRET || data.JWT_SECRET.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'JWT_SECRET is required in production and cannot be empty',
        });
      } else if (data.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'JWT_SECRET must be at least 32 characters long in production',
        });
      } else if (INSECURE_DEFAULT_SECRETS.has(data.JWT_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'JWT_SECRET cannot use known insecure or development default secrets in production',
        });
      }
    } else {
      // In development / test: if not provided, assign explicit development fallback
      if (!data.JWT_SECRET || data.JWT_SECRET.trim().length === 0) {
        data.JWT_SECRET = 'dev_jwt_secret_key_minimum_32_characters_for_security_testing';
      }
    }

    // 2. COOKIE_SECRET Validation
    if (isProd) {
      if (!data.COOKIE_SECRET || data.COOKIE_SECRET.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_SECRET'],
          message: 'COOKIE_SECRET is required in production and cannot be empty',
        });
      } else if (data.COOKIE_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_SECRET'],
          message: 'COOKIE_SECRET must be at least 32 characters long in production',
        });
      } else if (INSECURE_DEFAULT_SECRETS.has(data.COOKIE_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_SECRET'],
          message: 'COOKIE_SECRET cannot use known insecure or development default secrets in production',
        });
      }
    } else {
      if (!data.COOKIE_SECRET || data.COOKIE_SECRET.trim().length === 0) {
        data.COOKIE_SECRET = 'dev_cookie_signing_secret_key_32_characters_long';
      }
    }

    // 3. WIDGET_JWT_SECRET Validation
    if (isProd && data.WIDGET_JWT_SECRET) {
      if (data.WIDGET_JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['WIDGET_JWT_SECRET'],
          message: 'WIDGET_JWT_SECRET must be at least 32 characters long in production',
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof envSchema> & {
  JWT_SECRET: string;
  COOKIE_SECRET: string;
};

let parsedConfig: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (parsedConfig) return parsedConfig;

  const result = envSchema.safeParse(process.env);
export function validateConfig(rawEnv: Record<string, any>): EnvConfig {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n');
    // Report issues without printing actual secret values
    const issues = result.error.issues
      .map((i) => ` - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment configuration validation failed:\n${issues}`);
  }
  return result.data as EnvConfig;
}

  parsedConfig = result.data;
export function getConfig(customEnv?: Record<string, any>): EnvConfig {
  if (customEnv) {
    return validateConfig(customEnv);
  }

  if (parsedConfig) return parsedConfig;

  parsedConfig = validateConfig(process.env);
  return parsedConfig;
}

export function resetConfigCache(): void {
  parsedConfig = null;
}
