import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  FALLBACK_MODEL_PRICING,
  DEFAULT_CONTEXT_WINDOW,
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

  it("DEFAULT_CONTEXT_WINDOW constant matches", () => {
    // FALLBACK_CONTEXT_WINDOW_SIZES and ONE_MILLION_CONTEXT were removed on
    // 2026-05-17 (Bug K). Context window is now derived per-session from
    // assistant usage rather than guessed from model-name strings; there is
    // nothing model-specific left to keep in parity. See
    // docs/bugs/context-window-hardcoded-guesswork.md.
    expect(DEFAULT_CONTEXT_WINDOW).toBe(200_000);
    expect(dashboardSource).toContain("DEFAULT_CONTEXT_WINDOW = 200_000");
  });

  it("no FALLBACK_CONTEXT_WINDOW_SIZES export on the dashboard side (the static map is gone)", () => {
    // The deleted static per-model map and substring heuristic must not be
    // reintroduced. We match the export pattern so doc comments mentioning
    // the historical names (for the changelog/bug doc) are not flagged.
    // If a future patch re-adds the export, this test fails loud.
    expect(dashboardSource).not.toMatch(/export\s+const\s+FALLBACK_CONTEXT_WINDOW_SIZES/);
    expect(dashboardSource).not.toMatch(/export\s+const\s+ONE_MILLION_CONTEXT/);
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
