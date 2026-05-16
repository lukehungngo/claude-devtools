import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  FALLBACK_MODEL_PRICING,
  FALLBACK_CONTEXT_WINDOW_SIZES,
  DEFAULT_CONTEXT_WINDOW,
  ONE_MILLION_CONTEXT,
} from "./modelPricing.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_FILE = join(__dirname, "..", "..", "..", "dashboard", "src", "lib", "modelPricing.ts");

/**
 * Server↔dashboard parity test. Both files must define identical maps and
 * constants — see docs/spec/cc-parity-gaps.md P2-7 for the drift hazard.
 *
 * We read the dashboard file as text and assert each canonical entry is
 * present verbatim. Cheap, no module resolution across packages required.
 */
describe("model pricing — server↔dashboard parity (P2-7)", () => {
  const dashboardSource = readFileSync(DASHBOARD_FILE, "utf-8");

  it("each server pricing entry appears verbatim in the dashboard mirror", () => {
    for (const [model, pricing] of Object.entries(FALLBACK_MODEL_PRICING)) {
      const expected = `"${model}": { input: ${pricing.input}, output: ${pricing.output}, cacheWrite: ${pricing.cacheWrite}, cacheRead: ${pricing.cacheRead} }`;
      expect(dashboardSource).toContain(expected);
    }
  });

  it("each server context-window entry appears verbatim in the dashboard mirror", () => {
    for (const [model, size] of Object.entries(FALLBACK_CONTEXT_WINDOW_SIZES)) {
      // Use the underscored number literal style both files use.
      const formatted = size.toLocaleString("en-US").replace(/,/g, "_");
      const expected = `"${model}": ${formatted}`;
      expect(dashboardSource).toContain(expected);
    }
  });

  it("DEFAULT_CONTEXT_WINDOW and ONE_MILLION_CONTEXT constants match", () => {
    expect(DEFAULT_CONTEXT_WINDOW).toBe(200_000);
    expect(ONE_MILLION_CONTEXT).toBe(1_000_000);
    expect(dashboardSource).toContain("DEFAULT_CONTEXT_WINDOW = 200_000");
    expect(dashboardSource).toContain("ONE_MILLION_CONTEXT = 1_000_000");
  });

  it("dashboard mirror contains no extra model keys server doesn't have", () => {
    // Find lines that look like `"<model>": { input: ... }` inside the
    // FALLBACK_MODEL_PRICING object and extract the model id.
    const lines = dashboardSource.split("\n");
    let inBlock = false;
    const dashboardKeys = new Set<string>();
    for (const line of lines) {
      if (line.includes("FALLBACK_MODEL_PRICING")) {
        inBlock = true;
        continue;
      }
      if (inBlock) {
        if (line.trim().startsWith("}")) {
          inBlock = false;
          continue;
        }
        const m = line.match(/"([a-z0-9-]+)":\s*\{\s*input:/i);
        if (m) dashboardKeys.add(m[1]);
      }
    }
    const serverKeys = new Set(Object.keys(FALLBACK_MODEL_PRICING));
    expect(dashboardKeys).toEqual(serverKeys);
  });
});
