import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/dist/", "**/node_modules/", "**/*.js", "**/*.mjs"] },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript recommended (type-aware disabled to keep it fast)
  ...tseslint.configs.recommended,

  // Server files — Node globals
  {
    files: ["server/src/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Dashboard files — browser globals + React hooks
  {
    files: ["dashboard/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
    languageOptions: {
      globals: globals.browser,
    },
  },

  // turnSnapshot.ts — require ownership-filter helpers instead of inline
  // !event.isSidechain / !events[i].isSidechain patterns. This prevents
  // drift across reducers (see docs/brainstorms/2026-04-17-turn-status-sidechain-bleed.md).
  // Positive `if (event.isSidechain)` checks (e.g. isTurnBoundary) are intentionally allowed.
  {
    files: ["dashboard/src/lib/turnSnapshot.ts"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "UnaryExpression[operator='!'] > MemberExpression[property.name='isSidechain']",
        message: "Use mainEventsOnly() or eventsForAgent() from ./turnEventFilters instead of inline isSidechain checks. See docs/brainstorms/2026-04-17-turn-status-sidechain-bleed.md.",
      }],
    },
  },

  // Shared rule overrides
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  }
);
