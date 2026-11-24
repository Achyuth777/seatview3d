import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // With TEST_DATABASE_URL every DB test file shares one real database, so run files one at a time.
      fileParallelism: !process.env.TEST_DATABASE_URL,
      // Playwright specs live in e2e/ and run with npx playwright test.
      include: ['tests/**/*.test.ts'],
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  }),
);
