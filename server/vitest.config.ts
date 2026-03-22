import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/analyzer/**/*.ts',
        'src/parser/jsonl-reader.ts',
        'src/hooks/permission-handler.ts',
      ],
      exclude: ['src/**/*.test.ts', 'node_modules'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
