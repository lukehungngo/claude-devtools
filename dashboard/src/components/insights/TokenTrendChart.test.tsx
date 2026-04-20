import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// Mock recharts components so tests don't depend on canvas/DOM rendering
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
}));

import { TokenTrendChart } from "./TokenTrendChart";

const DAILY = [
  { date: "2026-04-10", tokensIn: 1000, tokensOut: 500, cost: 0.01 },
  { date: "2026-04-11", tokensIn: 2000, tokensOut: 1000, cost: 0.02 },
  { date: "2026-04-12", tokensIn: 1500, tokensOut: 750, cost: 0.015 },
];

const LS_KEY = "dt-tool-milestones";

// Safe localStorage mock helper
function mockLocalStorage(): { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> } {
  const store: Record<string, string> = {};
  const getItem = vi.fn((key: string) => store[key] ?? null);
  const setItem = vi.fn((key: string, value: string) => { store[key] = value; });
  const removeItem = vi.fn((key: string) => { delete store[key]; });
  Object.defineProperty(window, "localStorage", {
    value: { getItem, setItem, removeItem, clear: vi.fn(), length: 0, key: vi.fn() },
    writable: true,
  });
  return { getItem, setItem, removeItem };
}

beforeEach(() => {
  mockLocalStorage();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TokenTrendChart — chart rendering", () => {
  it("renders the recharts container when daily has data", () => {
    render(<TokenTrendChart daily={DAILY} />);
    expect(screen.getByTestId("responsive-container")).toBeTruthy();
  });

  it("renders the line chart when daily has data", () => {
    render(<TokenTrendChart daily={DAILY} />);
    expect(screen.getByTestId("line-chart")).toBeTruthy();
  });

  it("shows empty state when daily is undefined", () => {
    render(<TokenTrendChart />);
    expect(screen.getByTestId("token-trend-empty")).toBeTruthy();
  });

  it("shows empty state when daily is empty array", () => {
    render(<TokenTrendChart daily={[]} />);
    expect(screen.getByTestId("token-trend-empty")).toBeTruthy();
  });

  it("does not render chart when daily is undefined", () => {
    render(<TokenTrendChart />);
    expect(screen.queryByTestId("responsive-container")).toBeNull();
  });

  it("shows loading skeleton when loading=true", () => {
    render(<TokenTrendChart loading />);
    expect(screen.getByTestId("token-trend-loading")).toBeTruthy();
  });

  it("does not show loading skeleton when loading=false and daily has data", () => {
    render(<TokenTrendChart daily={DAILY} loading={false} />);
    expect(screen.queryByTestId("token-trend-loading")).toBeNull();
  });
});

describe("TokenTrendChart — empty milestones state", () => {
  it("shows empty milestone message when no milestones saved", () => {
    render(<TokenTrendChart daily={DAILY} />);
    expect(screen.getByTestId("milestones-empty")).toBeTruthy();
  });

  it("empty message contains instructional text", () => {
    render(<TokenTrendChart daily={DAILY} />);
    const el = screen.getByTestId("milestones-empty");
    expect(el.textContent).toContain("milestone");
  });
});

describe("TokenTrendChart — add milestone form", () => {
  it("renders Add milestone button", () => {
    render(<TokenTrendChart daily={DAILY} />);
    expect(screen.getByTestId("add-milestone-btn")).toBeTruthy();
  });

  it("clicking Add milestone shows the inline form", () => {
    render(<TokenTrendChart daily={DAILY} />);
    fireEvent.click(screen.getByTestId("add-milestone-btn"));
    expect(screen.getByTestId("milestone-form")).toBeTruthy();
  });

  it("form has name input", () => {
    render(<TokenTrendChart daily={DAILY} />);
    fireEvent.click(screen.getByTestId("add-milestone-btn"));
    expect(screen.getByTestId("milestone-name-input")).toBeTruthy();
  });

  it("form has startDate input", () => {
    render(<TokenTrendChart daily={DAILY} />);
    fireEvent.click(screen.getByTestId("add-milestone-btn"));
    expect(screen.getByTestId("milestone-start-date-input")).toBeTruthy();
  });

  it("form has endDate input", () => {
    render(<TokenTrendChart daily={DAILY} />);
    fireEvent.click(screen.getByTestId("add-milestone-btn"));
    expect(screen.getByTestId("milestone-end-date-input")).toBeTruthy();
  });

  it("form has 5 color buttons", () => {
    render(<TokenTrendChart daily={DAILY} />);
    fireEvent.click(screen.getByTestId("add-milestone-btn"));
    const colorBtns = screen.getAllByTestId(/^milestone-color-/);
    expect(colorBtns).toHaveLength(5);
  });

  it("submit without name shows validation error", () => {
    render(<TokenTrendChart daily={DAILY} />);
    fireEvent.click(screen.getByTestId("add-milestone-btn"));
    fireEvent.click(screen.getByTestId("milestone-submit-btn"));
    expect(screen.getByTestId("milestone-form-error")).toBeTruthy();
  });

  it("submit without startDate shows validation error", () => {
    render(<TokenTrendChart daily={DAILY} />);
    fireEvent.click(screen.getByTestId("add-milestone-btn"));
    const nameInput = screen.getByTestId("milestone-name-input");
    fireEvent.change(nameInput, { target: { value: "My Tool" } });
    fireEvent.click(screen.getByTestId("milestone-submit-btn"));
    expect(screen.getByTestId("milestone-form-error")).toBeTruthy();
  });

  it("valid submission saves milestone to localStorage", () => {
    const { setItem } = mockLocalStorage();
    render(<TokenTrendChart daily={DAILY} />);
    fireEvent.click(screen.getByTestId("add-milestone-btn"));

    fireEvent.change(screen.getByTestId("milestone-name-input"), { target: { value: "New Tool" } });
    fireEvent.change(screen.getByTestId("milestone-start-date-input"), { target: { value: "2026-04-10" } });

    fireEvent.click(screen.getByTestId("milestone-submit-btn"));

    expect(setItem).toHaveBeenCalledWith(LS_KEY, expect.stringContaining("New Tool"));
  });

  it("valid submission closes the form", () => {
    render(<TokenTrendChart daily={DAILY} />);
    fireEvent.click(screen.getByTestId("add-milestone-btn"));

    fireEvent.change(screen.getByTestId("milestone-name-input"), { target: { value: "New Tool" } });
    fireEvent.change(screen.getByTestId("milestone-start-date-input"), { target: { value: "2026-04-10" } });
    fireEvent.click(screen.getByTestId("milestone-submit-btn"));

    expect(screen.queryByTestId("milestone-form")).toBeNull();
  });

  it("valid submission renders new milestone row", () => {
    render(<TokenTrendChart daily={DAILY} />);
    fireEvent.click(screen.getByTestId("add-milestone-btn"));

    fireEvent.change(screen.getByTestId("milestone-name-input"), { target: { value: "Fancy Tool" } });
    fireEvent.change(screen.getByTestId("milestone-start-date-input"), { target: { value: "2026-04-10" } });
    fireEvent.click(screen.getByTestId("milestone-submit-btn"));

    expect(screen.getByText("Fancy Tool")).toBeTruthy();
  });
});

describe("TokenTrendChart — milestone persistence", () => {
  it("loads milestones from localStorage on mount", () => {
    const stored = JSON.stringify([
      { id: "abc", name: "Persisted Tool", startDate: "2026-04-01", endDate: null, color: "blue" },
    ]);
    window.localStorage.getItem = vi.fn((key: string) => (key === LS_KEY ? stored : null));

    render(<TokenTrendChart daily={DAILY} />);
    expect(screen.getByText("Persisted Tool")).toBeTruthy();
  });

  it("handles corrupted localStorage gracefully", () => {
    window.localStorage.getItem = vi.fn(() => "not-valid-json{{{");
    expect(() => render(<TokenTrendChart daily={DAILY} />)).not.toThrow();
  });

  it("shows empty milestone state when localStorage returns null", () => {
    window.localStorage.getItem = vi.fn(() => null);
    render(<TokenTrendChart daily={DAILY} />);
    expect(screen.getByTestId("milestones-empty")).toBeTruthy();
  });
});

describe("TokenTrendChart — delete milestone", () => {
  it("renders delete button for each milestone", () => {
    const stored = JSON.stringify([
      { id: "m1", name: "Tool A", startDate: "2026-04-01", endDate: null, color: "blue" },
      { id: "m2", name: "Tool B", startDate: "2026-04-05", endDate: null, color: "green" },
    ]);
    window.localStorage.getItem = vi.fn((key: string) => (key === LS_KEY ? stored : null));

    render(<TokenTrendChart daily={DAILY} />);
    const deleteButtons = screen.getAllByTestId(/^milestone-delete-/);
    expect(deleteButtons).toHaveLength(2);
  });

  it("clicking delete removes milestone from view", () => {
    const stored = JSON.stringify([
      { id: "m1", name: "Tool A", startDate: "2026-04-01", endDate: null, color: "blue" },
    ]);
    window.localStorage.getItem = vi.fn((key: string) => (key === LS_KEY ? stored : null));

    render(<TokenTrendChart daily={DAILY} />);
    const deleteBtn = screen.getByTestId("milestone-delete-m1");
    fireEvent.click(deleteBtn);

    expect(screen.queryByText("Tool A")).toBeNull();
  });

  it("clicking delete persists updated list to localStorage", () => {
    const { setItem } = mockLocalStorage();
    const stored = JSON.stringify([
      { id: "m1", name: "Tool A", startDate: "2026-04-01", endDate: null, color: "blue" },
    ]);
    window.localStorage.getItem = vi.fn((key: string) => (key === LS_KEY ? stored : null));

    render(<TokenTrendChart daily={DAILY} />);
    fireEvent.click(screen.getByTestId("milestone-delete-m1"));

    // After deletion, localStorage should be updated with empty array
    expect(setItem).toHaveBeenCalledWith(LS_KEY, "[]");
  });

  it("deleting last milestone shows empty state", () => {
    const stored = JSON.stringify([
      { id: "m1", name: "Tool A", startDate: "2026-04-01", endDate: null, color: "blue" },
    ]);
    window.localStorage.getItem = vi.fn((key: string) => (key === LS_KEY ? stored : null));

    render(<TokenTrendChart daily={DAILY} />);
    fireEvent.click(screen.getByTestId("milestone-delete-m1"));

    expect(screen.getByTestId("milestones-empty")).toBeTruthy();
  });
});
