import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { EChartsOption } from "echarts";

// Capture the ResizeObserver callback so tests can fire it manually
let capturedResizeCallback: ResizeObserverCallback | null = null;
const MockResizeObserver = vi.fn().mockImplementation((cb: ResizeObserverCallback) => {
  capturedResizeCallback = cb;
  return {
    observe: vi.fn(),
    disconnect: vi.fn(),
  };
});

// ResizeObserver is not available in jsdom — install the capturing mock
beforeAll(() => {
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
});

const { mockSetOption, mockResize, mockDispose, mockInit } = vi.hoisted(() => {
  const mockSetOption = vi.fn();
  const mockResize = vi.fn();
  const mockDispose = vi.fn();
  const mockChart = {
    setOption: mockSetOption,
    resize: mockResize,
    dispose: mockDispose,
  };
  const mockInit = vi.fn(() => mockChart);
  return { mockSetOption, mockResize, mockDispose, mockInit };
});

vi.mock("echarts/core", () => ({
  init: mockInit,
  use: vi.fn(),
}));

vi.mock("./echarts-init.js", () => ({}));

import { EChartsWrapper } from "./EChartsWrapper";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  capturedResizeCallback = null;
});

const OPTION: EChartsOption = { series: [{ type: "line", data: [1, 2, 3] }] };

describe("EChartsWrapper", () => {
  it("calls echarts.init with the container div on mount", () => {
    render(<EChartsWrapper option={OPTION} />);
    expect(mockInit).toHaveBeenCalledTimes(1);
    // justification: vi.fn() returns unknown-typed calls — cast to access first arg
    const firstArg = (mockInit.mock.calls[0] as unknown[])[0];
    expect(firstArg).toBeInstanceOf(HTMLElement);
  });

  it("calls setOption with the provided option on mount", () => {
    render(<EChartsWrapper option={OPTION} />);
    expect(mockSetOption).toHaveBeenCalledWith(OPTION, { notMerge: true });
  });

  it("calls dispose on unmount", () => {
    const { unmount } = render(<EChartsWrapper option={OPTION} />);
    unmount();
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

  it("calls setOption again when option prop changes", () => {
    const { rerender } = render(<EChartsWrapper option={OPTION} />);
    const newOption: EChartsOption = { series: [{ type: "bar", data: [4, 5, 6] }] };
    rerender(<EChartsWrapper option={newOption} />);
    expect(mockSetOption).toHaveBeenCalledWith(newOption, { notMerge: true });
  });

  it("renders a div container", () => {
    const { container } = render(
      <EChartsWrapper option={OPTION} className="my-chart" />
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div.tagName).toBe("DIV");
    expect(div.className).toContain("my-chart");
  });

  it("calls chart.resize when ResizeObserver fires", () => {
    render(<EChartsWrapper option={OPTION} />);
    // justification: capturedResizeCallback is set in the MockResizeObserver above; safe to assert non-null after render
    capturedResizeCallback!([{} as ResizeObserverEntry], {} as ResizeObserver);
    expect(mockResize).toHaveBeenCalledTimes(1);
  });
});
