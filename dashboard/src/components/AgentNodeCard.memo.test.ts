import { describe, it, expect } from "vitest";
import { AgentNodeCard } from "./AgentNodeCard";

describe("AgentNodeCard memo", () => {
  it("is wrapped in React.memo (has compare function)", () => {
    // React.memo components have a `type` property or `$$typeof` that differs
    // from plain function components. Specifically, React.memo wraps the component
    // and sets `displayName` or can be detected via `type` property.
    // The simplest check: React.memo components have a `.type` property
    // pointing to the inner component.
    const descriptor = Object.getOwnPropertyDescriptor(AgentNodeCard, "$$typeof");
    // React.memo components expose a `compare` property
    expect((AgentNodeCard as unknown as { compare: unknown }).compare).toBeDefined();
  });
});
