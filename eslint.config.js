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
