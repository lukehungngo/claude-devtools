import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PanelModal } from "./PanelModal";

// Mock all lazy-loaded panel components
vi.mock("./panels/SettingsPanel", () => ({
  SettingsPanel: () => <div>settings-content</div>,
}));
vi.mock("./panels/HookEditor", () => ({
  HookEditor: () => <div>hooks-content</div>,
}));
vi.mock("./panels/MemoryEditor", () => ({
  MemoryEditor: () => <div>memory-content</div>,
}));
vi.mock("./panels/PermissionRulesEditor", () => ({
  PermissionRulesEditor: () => <div>permissions-content</div>,
}));
vi.mock("./panels/McpManager", () => ({
  McpManager: () => <div>mcp-content</div>,
}));
vi.mock("./panels/AgentManager", () => ({
  AgentManager: () => <div>agents-content</div>,
}));
vi.mock("./panels/DoctorPanel", () => ({
  DoctorPanel: () => <div>doctor-content</div>,
}));
vi.mock("./panels/StatsPanel", () => ({
  StatsPanel: () => <div>stats-content</div>,
}));

const mockPermissionHistory = vi.fn();
vi.mock("./panels/PermissionHistory", () => ({
  PermissionHistory: (props: { permissions: unknown[]; onDecide?: unknown }) => {
    mockPermissionHistory(props);
    return <div>permission-history-content</div>;
  },
}));

describe("PanelModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when panel is null", () => {
    const { container } = render(
      <PanelModal panel={null} onClose={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders overlay and title when panel is 'settings'", async () => {
    render(<PanelModal panel="settings" onClose={vi.fn()} />);
    expect(screen.getByText("Settings")).toBeTruthy();
    // Close button should exist (the X icon button)
    expect(screen.getByRole("button", { name: /close/i })).toBeTruthy();
    // Panel content should render inside Suspense
    expect(await screen.findByText("settings-content")).toBeTruthy();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(<PanelModal panel="settings" onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on backdrop click", async () => {
    const onClose = vi.fn();
    render(<PanelModal panel="settings" onClose={onClose} />);
    // The backdrop is the outermost fixed overlay
    const backdrop = screen.getByTestId("panel-modal-backdrop");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking modal content", async () => {
    const onClose = vi.fn();
    render(<PanelModal panel="settings" onClose={onClose} />);
    const content = screen.getByTestId("panel-modal-content");
    fireEvent.click(content);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("passes onDecide to PermissionHistory when panel is 'permission-history'", async () => {
    mockPermissionHistory.mockClear();
    const onDecide = vi.fn();
    render(
      <PanelModal
        panel="permission-history"
        onClose={vi.fn()}
        permissions={[]}
        onDecide={onDecide}
      />,
    );
    await screen.findByText("permission-history-content");
    expect(mockPermissionHistory).toHaveBeenCalledWith(
      expect.objectContaining({ onDecide }),
    );
  });
});
