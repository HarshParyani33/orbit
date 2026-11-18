import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { createApp, bootstrap } from '../../apps/api/src/main';
import { getConfig, resetConfigCache } from '@orbit/config';
import { INestApplication } from '@nestjs/common';

describe('API Bootstrap Lifecycle & Single Listen Invariant', () => {
  let appInstance: INestApplication | null = null;

  beforeEach(() => {
    resetConfigCache();
  });

  afterEach(async () => {
    if (appInstance) {
      await appInstance.close();
      appInstance = null;
    }
    resetConfigCache();
    vi.restoreAllMocks();
  });

  it('1. createApp creates and configures the NestJS application without binding sockets', async () => {
    appInstance = await createApp();
    expect(appInstance).toBeDefined();
    expect(typeof appInstance.listen).toBe('function');
    expect(typeof appInstance.close).toBe('function');
  });

  it('2. bootstrap invokes app.listen() exactly once using config.PORT as authoritative source', async () => {
    const config = getConfig();
    const listenSpy = vi.fn().mockImplementation(async () => appInstance);

    const originalCreate = NestFactory.create.bind(NestFactory);
    vi.spyOn(NestFactory, 'create').mockImplementation(async (...args: any[]) => {
      const realApp = await (originalCreate as any)(...args);
      appInstance = realApp;
      vi.spyOn(realApp, 'listen').mockImplementation(listenSpy as any);
      return realApp;
    });

    const app = await bootstrap();
    expect(app).toBeDefined();

    // Invariant: app.listen MUST be called exactly once
    expect(listenSpy).toHaveBeenCalledTimes(1);

    // Invariant: The port passed to listen MUST be config.PORT from @orbit/config
    expect(listenSpy).toHaveBeenCalledWith(config.PORT);
  });

  it('3. fail-fast configuration invariant: throws before server creation if config is invalid', async () => {
    const createSpy = vi.spyOn(NestFactory, 'create');

    const originalEnv = process.env.NODE_ENV;
    const originalJwt = process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;

    try {
      await expect(bootstrap()).rejects.toThrow(/JWT_SECRET is required in production/i);
      // Invariant: NestFactory.create must NOT have been called if config validation failed
      expect(createSpy).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalJwt !== undefined) {
        process.env.JWT_SECRET = originalJwt;
      }
      resetConfigCache();
    }
  });
});
