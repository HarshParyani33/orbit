import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { getConfig } from '@orbit/config';

/**
 * Shared Application Middleware & Security Configuration.
 * Applied identically in production main.ts and in HTTP-level integration tests.
 */
export function configureApp(app: INestApplication): void {
  const config = getConfig();

  // 1. HTTP-Only Cookie Parser
  app.use(cookieParser(config.COOKIE_SECRET));

  // 2. Strict CORS Configuration
  // - Whitelists strictly the configured frontend origin (no wildcards)
  // - Supports credentials (cookies)
  // - Whitelists explicitly required headers including X-Requested-With for CSRF defense
  app.enableCors({
    origin: config.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Organization-Id',
      'X-CSRF-Token',
      'X-Requested-With',
    ],
  });
}
