import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "claude-devtools-server": path.resolve(__dirname, "../server"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/__fixtures__/**"],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
