import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/**
 * Shared Application Middleware & Security Configuration.
 * Applied identically in production main.ts and in HTTP-level integration tests.
 */
export function configureApp(app: INestApplication): void {
  // 1. HTTP-Only Cookie Parser
  app.use(cookieParser(process.env.COOKIE_SECRET));

  // 2. Strict CORS Configuration
  // - Whitelists strictly the configured frontend origin (no wildcards)
  // - Supports credentials (cookies)
  // - Whitelists explicitly required headers including X-Requested-With for CSRF defense
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

