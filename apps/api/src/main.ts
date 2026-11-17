import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.config';
import { getConfig } from '@orbit/config';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function bootstrap() {
  // Fail-fast configuration validation: throws immediately if config is missing or insecure
  const config = getConfig();

  const app = await NestFactory.create(AppModule);

  configureApp(app);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`[Project Orbit API] Server running on http://localhost:${port}`);
  await app.listen(config.PORT);
  console.log(`[Project Orbit API] Server running on http://localhost:${config.PORT}`);
}

bootstrap();
