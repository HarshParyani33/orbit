import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.config';
import { getConfig } from '@orbit/config';
import { INestApplication } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Creates and configures the NestJS application instance without binding to a network port.
 * Allows integration test suites and bootstrap lifecycles to inspect and verify the pipeline.
 */
export async function createApp(): Promise<INestApplication> {
  // Fail-fast configuration validation: throws immediately if config is missing or insecure
  getConfig();

  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);
  return app;
}

/**
 * Bootstraps the Project Orbit API application.
 * Enforces config.PORT from @orbit/config as the sole authoritative port source.
 * Invokes app.listen() exactly once.
 */
export async function bootstrap(): Promise<INestApplication> {
  const config = getConfig();
  const app = await createApp();

  await app.listen(config.PORT);
  console.log(`[Project Orbit API] Server running on http://localhost:${config.PORT}`);
  return app;
}

// Only auto-start when executed directly, not when imported in test suites
if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
  void bootstrap();
}
