import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ContextPressureChart } from "./ContextPressureChart";
import type { SessionEvent, AssistantEvent, SystemEvent } from "../../lib/types";

function assistantEvt(
  index: number,
  tokensUsed: { input?: number; cacheR?: number; cacheW?: number; output?: number } = {},
): AssistantEvent {
  return {
    type: "assistant",
    uuid: `a-${index}`,
    timestamp: `2026-05-16T10:0${index}:00Z`,
    sessionId: "s1",
    message: {
      role: "assistant",
      content: [],
      model: "claude-sonnet-4-6",
      id: `m${index}`,
      type: "message",
      stop_reason: "end_turn",
      usage: {
        input_tokens: tokensUsed.input ?? 0,
        output_tokens: tokensUsed.output ?? 0,
        cache_creation_input_tokens: tokensUsed.cacheW ?? 0,
        cache_read_input_tokens: tokensUsed.cacheR ?? 0,
      },
    },
  };
}

function compactEvt(index: number, meta: { trigger: string; preTokens: number; postTokens?: number }): SystemEvent {
  return {
    type: "system",
    subtype: "compact_boundary",
    uuid: `c-${index}`,
    timestamp: `2026-05-16T10:0${index}:30Z`,
    sessionId: "s1",
    // Real CC v2.1.143 shape — camelCase, top-level on the event.
    compactMetadata: meta,
  } as unknown as SystemEvent;
}

describe("ContextPressureChart", () => {
  afterEach(() => cleanup());

  it("suppresses chart when peak context is below threshold", () => {
    // 10K / 200K = 5% — well below 30% default threshold
    const events: SessionEvent[] = [
      assistantEvt(1, { input: 5000, cacheR: 5000 }),
      assistantEvt(2, { input: 5000, cacheR: 5000 }),
    ];
    const { container } = render(
      <ContextPressureChart events={events} contextWindowSize={200_000} />,
    );
    expect(container.querySelector('[data-testid="context-pressure-chart"]')).toBeNull();
  });

  it("suppresses chart when fewer than 2 turns", () => {
    const events: SessionEvent[] = [assistantEvt(1, { input: 100_000, cacheR: 100_000 })];
    const { container } = render(
      <ContextPressureChart events={events} contextWindowSize={200_000} />,
    );
    expect(container.querySelector('[data-testid="context-pressure-chart"]')).toBeNull();
  });

  it("renders chart when context pressure crosses threshold", () => {
    // Each turn uses 100K of 200K = 50%, peak above 30%
    const events: SessionEvent[] = [
      assistantEvt(1, { input: 50_000, cacheR: 50_000 }),
      assistantEvt(2, { input: 60_000, cacheR: 60_000 }),
      assistantEvt(3, { input: 80_000, cacheR: 80_000 }),
    ];
    const { container, getByTestId } = render(
      <ContextPressureChart events={events} contextWindowSize={200_000} />,
    );
    expect(getByTestId("context-pressure-chart")).toBeDefined();
    // 3 turns → at least the line path plus area
    expect(container.querySelectorAll("path").length).toBeGreaterThanOrEqual(2);
  });

  it("renders a compact marker for each compact_boundary event", () => {
    const events: SessionEvent[] = [
      assistantEvt(1, { input: 50_000, cacheR: 50_000 }),
      assistantEvt(2, { input: 80_000, cacheR: 80_000 }),
      compactEvt(3, { trigger: "auto", preTokens: 168_000, postTokens: 9_000 }),
      assistantEvt(4, { input: 5_000, cacheR: 4_000 }),
      compactEvt(5, { trigger: "manual", preTokens: 150_000, postTokens: 7_000 }),
      assistantEvt(6, { input: 70_000, cacheR: 70_000 }),
    ];
    const { container, getByTestId } = render(
      <ContextPressureChart events={events} contextWindowSize={200_000} />,
    );
    expect(getByTestId("context-pressure-chart")).toBeDefined();
    expect(container.querySelectorAll('[data-testid^="compact-marker-"]').length).toBe(2);
  });

  it("uses red line color when peak context >= 85%", () => {
    const events: SessionEvent[] = [
      assistantEvt(1, { input: 90_000, cacheR: 90_000 }),
      assistantEvt(2, { input: 95_000, cacheR: 95_000 }),
    ];
    const { container } = render(
      <ContextPressureChart events={events} contextWindowSize={200_000} />,
    );
    const paths = container.querySelectorAll("path");
    const linePath = paths[paths.length - 1];
    expect(linePath.getAttribute("stroke")).toContain("err");
  });

  it("has accessible aria-label summarizing pressure", () => {
    const events: SessionEvent[] = [
      assistantEvt(1, { input: 60_000, cacheR: 60_000 }),
      assistantEvt(2, { input: 80_000, cacheR: 80_000 }),
      compactEvt(3, { trigger: "auto", preTokens: 160_000 }),
      assistantEvt(4, { input: 10_000, cacheR: 10_000 }),
    ];
    const { getByTestId } = render(
      <ContextPressureChart events={events} contextWindowSize={200_000} />,
    );
    const label = getByTestId("context-pressure-chart").getAttribute("aria-label");
    expect(label).toContain("Context pressure");
    expect(label).toContain("1 compaction");
  });
});
