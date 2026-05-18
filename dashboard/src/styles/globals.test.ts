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

function blockFor(selector: string): string {
  const idx = css.indexOf(selector + " {");
  if (idx < 0) throw new Error(`selector not found: ${selector}`);
  const end = css.indexOf("}", idx);
  return css.slice(idx, end);
}

describe("conversation text utility classes — readability sizes", () => {
  const cases: Array<[string, string]> = [
    [".t-body",     "font-size: 15px"],
    [".t-mono",     "font-size: 13px"],
    [".t-mono-sm",  "font-size: 12px"],
    [".t-mono-xs",  "font-size: 11px"],
  ];
  for (const [cls, decl] of cases) {
    it(`${cls} declares ${decl}`, () => {
      expect(blockFor(cls)).toContain(decl);
    });
  }
});
