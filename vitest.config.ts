import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/cli/**', 'src/types.ts', 'src/index.ts', 'src/__tests__/**', 'src/test.ts'],
    },
  },
});
