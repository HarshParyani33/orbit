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

  // 2. Permissive CORS for Embeddable Chat Widget Ingress
  // Allows third-party client websites to communicate with the widget API endpoints
  app.use('/api/widget', (req: any, res: any, next: any) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // 3. Strict CORS Configuration for Dashboard and Core APIs
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
