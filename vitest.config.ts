import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@psp/shared': resolve(import.meta.dirname, 'packages/shared/src/index.ts'),
    },
  },
  test: {
    include: ['apps/**/*.spec.ts', 'packages/**/*.spec.ts', 'scripts/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
  },
});
