import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { AgentManager } from "./AgentManager";

afterEach(cleanup);

describe("AgentManager: filesystem fallback (no sessionId)", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ agents: [] }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders filesystem hint when no sessionId is provided and no agents exist", async () => {
    render(<AgentManager />);
    await waitFor(() => {
      expect(screen.getByText(/No custom agents defined/i)).toBeTruthy();
    });
    expect(screen.getByText(/.claude\/agents/)).toBeTruthy();
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/agents/definitions");
  });
});

describe("AgentManager: SDK-aware mode (sessionId provided)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders SDK agents with name, description, and model when fetched", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("/supported-agents")) {
        return {
          ok: true,
          json: async () => ({
            agents: [
              { name: "Explore", description: "Search codebase", model: "claude-sonnet-4-6" },
              { name: "Reviewer", description: "Code review" },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ agents: [] }) } as Response;
    });

    render(<AgentManager sessionId="sess-123" />);

    await waitFor(() => {
      expect(screen.getByText("Explore")).toBeTruthy();
      expect(screen.getByText("Reviewer")).toBeTruthy();
    });

    expect(screen.getByText("Search codebase")).toBeTruthy();
    expect(screen.getByText("Code review")).toBeTruthy();
    expect(screen.getByText(/claude-sonnet-4-6/)).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledWith("/api/sessions/sess-123/supported-agents");
  });

  it("falls back to filesystem hint when SDK returns null", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("/supported-agents")) {
        return { ok: true, json: async () => ({ agents: null }) } as Response;
      }
      return { ok: true, json: async () => ({ agents: [] }) } as Response;
    });

    render(<AgentManager sessionId="sess-cold" />);

    await waitFor(() => {
      expect(screen.getByText(/No custom agents defined/i)).toBeTruthy();
    });
    expect(screen.getByText(/.claude\/agents/)).toBeTruthy();
  });
});
