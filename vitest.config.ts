import { defineConfig } from 'vitest/config';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@orbit/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
      '@orbit/validation': path.resolve(__dirname, 'packages/validation/src/index.ts'),
      '@orbit/config': path.resolve(__dirname, 'packages/config/src/index.ts'),
    },
  },
});
