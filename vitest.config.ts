import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000, // Git operations can be slow
    hookTimeout: 30000,
    // Run tests sequentially to avoid git conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts', // CLI entry point
        'src/types.ts', // Type definitions only
      ],
      thresholds: {
        // Start with achievable thresholds, can increase over time
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});
