/**
 * Tiny `unknown` → narrow-type helpers used by inline-marker extractors and
 * any other code that walks loosely-typed SSE / SDK payloads.
 *
 * Returns `undefined` instead of throwing so callers can compose them with
 * `??` defaults without a try/catch wall.
 */

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === "string") out.push(v);
  }
  return out.length > 0 ? out : undefined;
}
