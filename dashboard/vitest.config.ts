import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/cost.ts',
        'src/lib/normalizeContent.ts',
        'src/lib/turnSnapshot.ts',
      ],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'node_modules'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
