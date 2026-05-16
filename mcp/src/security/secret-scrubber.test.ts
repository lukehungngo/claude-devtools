import { describe, it, expect } from "vitest";
import { scrubSecrets } from "./secret-scrubber.js";

describe("scrubSecrets", () => {
  it("redacts anthropic-style keys", () => {
    expect(scrubSecrets("token sk-ant-api03-AAAAbbbbCCCC12345678901234 end")).toBe(
      "token [REDACTED] end",
    );
  });

  it("redacts sk- prefixed keys", () => {
    expect(scrubSecrets("key sk-abcdefghijklmnopqrstuv done")).toBe(
      "key [REDACTED] done",
    );
  });

  it("redacts AWS access keys", () => {
    expect(scrubSecrets("AKIAIOSFODNN7EXAMPLE")).toBe("[REDACTED]");
  });

  it("redacts JWT-shaped tokens", () => {
    const jwt = "eyJhbGciOiJIUz.eyJzdWIiOiIxMjM.SflKxwRJSMeKKF2QT4";
    expect(scrubSecrets(jwt)).toBe("[REDACTED]");
  });

  it("scrubs nested object values recursively", () => {
    const out = scrubSecrets({ a: "AKIAIOSFODNN7EXAMPLE", b: { c: "safe" } });
    expect(out).toEqual({ a: "[REDACTED]", b: { c: "safe" } });
  });

  it("scrubs arrays", () => {
    const out = scrubSecrets(["safe", "sk-ant-api03-AAAA1234567890123456"]);
    expect(out).toEqual(["safe", "[REDACTED]"]);
  });

  it("leaves short non-matching text alone", () => {
    expect(scrubSecrets("the AKIA acronym")).toBe("the AKIA acronym");
  });

  it("passes through numbers and booleans unchanged", () => {
    expect(scrubSecrets(42)).toBe(42);
    expect(scrubSecrets(true)).toBe(true);
    expect(scrubSecrets(null)).toBe(null);
  });
});
