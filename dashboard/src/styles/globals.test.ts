// @vitest-environment node
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { describe, it, expect } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CSS_PATH = resolve(__dirname, "./globals.css");
const css = readFileSync(CSS_PATH, "utf-8");

describe("globals.css highlight.js theme configuration", () => {
  it("imports github light theme as default (not github-dark)", () => {
    expect(css).toContain('highlight.js/styles/github.min.css');
    expect(css).not.toContain('highlight.js/styles/github-dark.min.css');
  });

  it("has dark mode hljs color overrides scoped to [data-theme=dark]", () => {
    expect(css).toContain('[data-theme="dark"] .hljs');
  });

  it("has high-contrast hljs color overrides scoped to [data-theme=high-contrast]", () => {
    expect(css).toContain('[data-theme="high-contrast"] .hljs');
  });
});
