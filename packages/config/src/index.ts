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

  // Database URLs for specific roles
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  MIGRATION_DATABASE_URL: z.string().optional(),
  INGRESS_DATABASE_URL: z.string().optional(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT & Cryptographic Secrets
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be at least 16 characters').optional(),
  WIDGET_JWT_SECRET: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

let parsedConfig: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (parsedConfig) return parsedConfig;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Environment configuration validation failed:\n${issues}`);
  }

  parsedConfig = result.data;
  return parsedConfig;
}
