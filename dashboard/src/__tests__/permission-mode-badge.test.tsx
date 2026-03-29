import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PermissionModeBadge, cyclePermissionMode } from "../components/conversation/PermissionModeBadge";

describe("cyclePermissionMode", () => {
  it("cycles default -> acceptEdits", () => {
    expect(cyclePermissionMode("default")).toBe("acceptEdits");
  });

  it("cycles acceptEdits -> plan", () => {
    expect(cyclePermissionMode("acceptEdits")).toBe("plan");
  });

  it("cycles plan -> auto", () => {
    expect(cyclePermissionMode("plan")).toBe("auto");
  });

  it("cycles auto -> dontAsk", () => {
    expect(cyclePermissionMode("auto")).toBe("dontAsk");
  });

  it("cycles dontAsk -> bypassPermissions", () => {
    expect(cyclePermissionMode("dontAsk")).toBe("bypassPermissions");
  });

  it("cycles bypassPermissions -> default", () => {
    expect(cyclePermissionMode("bypassPermissions")).toBe("default");
  });

  it("treats unknown mode as default", () => {
    expect(cyclePermissionMode("unknown")).toBe("acceptEdits");
  });
});

describe("PermissionModeBadge", () => {
  let onModeChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onModeChange = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the current mode", () => {
    render(<PermissionModeBadge mode="default" onModeChange={onModeChange} />);
    expect(screen.getByText("default")).toBeTruthy();
  });

  it("clicking cycles to next mode", () => {
    render(<PermissionModeBadge mode="default" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onModeChange).toHaveBeenCalledWith("acceptEdits");
  });

  it("clicking acceptEdits cycles to plan", () => {
    render(<PermissionModeBadge mode="acceptEdits" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onModeChange).toHaveBeenCalledWith("plan");
  });

  it("clicking plan cycles to auto", () => {
    render(<PermissionModeBadge mode="plan" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onModeChange).toHaveBeenCalledWith("auto");
  });

  it("displays acceptEdits mode", () => {
    render(<PermissionModeBadge mode="acceptEdits" onModeChange={onModeChange} />);
    expect(screen.getByText("acceptEdits")).toBeTruthy();
  });

  it("displays plan mode", () => {
    render(<PermissionModeBadge mode="plan" onModeChange={onModeChange} />);
    expect(screen.getByText("plan")).toBeTruthy();
  });
});
