const PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

function scrubString(s: string): string {
  let out = s;
  for (const p of PATTERNS) {
    // Reset lastIndex for global regexps
    p.lastIndex = 0;
    out = out.replace(p, "[REDACTED]");
  }
  return out;
}

export function scrubSecrets<T>(v: T): T {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") return scrubString(v) as unknown as T;
  if (Array.isArray(v)) return v.map(scrubSecrets) as unknown as T;
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = scrubSecrets(val);
    }
    return out as unknown as T;
  }
  return v;
}
