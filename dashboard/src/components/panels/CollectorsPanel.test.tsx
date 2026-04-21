import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CollectorsPanel } from "./CollectorsPanel";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ collectors: [] }),
  });
});

describe("CollectorsPanel", () => {
  it("shows empty state when no collectors", async () => {
    render(<CollectorsPanel />);
    await screen.findByText(/no collectors/i);
  });

  it("shows collector source when connected", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        collectors: [
          {
            source: "docker:my-app",
            connectedAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            sessionCount: 2,
            status: "connected",
          },
        ],
      }),
    });
    render(<CollectorsPanel />);
    await screen.findByText("docker:my-app");
    expect(screen.getByText("2 sessions")).toBeDefined();
  });
});
