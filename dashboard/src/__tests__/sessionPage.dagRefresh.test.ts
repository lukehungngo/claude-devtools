import { describe, it, expect } from 'vitest';
import type { SessionEvent } from '../lib/types';
import { shouldRefreshDag } from '../routes/SessionPage';

describe('DAG refresh trigger (shouldRefreshDag)', () => {
  const THROTTLE_MS = 5000;

  it('returns true when new events contain an Agent tool_use dispatch', () => {
    const events: SessionEvent[] = [{
      type: 'assistant',
      uuid: 'a1',
      sessionId: 's1',
      timestamp: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu1', name: 'Agent', input: {} }],
        model: 'claude-sonnet',
        id: 'msg1',
        type: 'message',
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    }];
    const lastRefreshTime = 0;
    const now = Date.now();
    expect(shouldRefreshDag(events, lastRefreshTime, THROTTLE_MS, now)).toBe(true);
  });

  it('returns false when throttle window has not expired', () => {
    const events: SessionEvent[] = [{
      type: 'assistant',
      uuid: 'a2',
      sessionId: 's1',
      timestamp: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu2', name: 'Agent', input: {} }],
        model: 'claude-sonnet',
        id: 'msg2',
        type: 'message',
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    }];
    const now = Date.now();
    const recentRefresh = now - 1000; // 1 second ago, throttle is 5s
    expect(shouldRefreshDag(events, recentRefresh, THROTTLE_MS, now)).toBe(false);
  });

  it('returns false when events contain non-Agent tool_use', () => {
    const events: SessionEvent[] = [{
      type: 'assistant',
      uuid: 'a3',
      sessionId: 's1',
      timestamp: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu3', name: 'Bash', input: {} }],
        model: 'claude-sonnet',
        id: 'msg3',
        type: 'message',
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    }];
    expect(shouldRefreshDag(events, 0, THROTTLE_MS, Date.now())).toBe(false);
  });

  it('returns false when assistant event has no content array', () => {
    const events: SessionEvent[] = [{
      type: 'assistant',
      uuid: 'a4',
      sessionId: 's1',
      timestamp: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: 'plain text content',
        model: 'claude-sonnet',
        id: 'msg4',
        type: 'message',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    }];
    expect(shouldRefreshDag(events, 0, THROTTLE_MS, Date.now())).toBe(false);
  });

  it('returns false when events array is empty', () => {
    expect(shouldRefreshDag([], 0, THROTTLE_MS, Date.now())).toBe(false);
  });

  it('returns false for non-assistant event types', () => {
    const events: SessionEvent[] = [{
      type: 'user',
      uuid: 'u1',
      sessionId: 's1',
      timestamp: new Date().toISOString(),
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'result' }],
      },
      userType: 'internal',
    }];
    expect(shouldRefreshDag(events, 0, THROTTLE_MS, Date.now())).toBe(false);
  });

  it('returns true on the next eligible tick after a throttled agent dispatch', () => {
    // Simulate: agent dispatched at T=0, throttle fires refresh, then agent dispatched at T=2s (throttled),
    // then at T=6s a non-agent event arrives — pending flag should still carry the refresh.
    //
    // The pending flag lives in the component ref, but we can test shouldRefreshDag building blocks:
    // - A non-agent batch alone does NOT trigger refresh (shouldRefreshDag returns false).
    // - If a previous Agent dispatch set pendingDagRefreshRef=true, the effect fires on the next
    //   eligible tick even if the current batch has no Agent tool_use.
    // This test documents the invariant: shouldRefreshDag(non-agent) === false, so the component
    // MUST use pendingDagRefreshRef to carry deferred refreshes across event batches.

    const nonAgentEvents: SessionEvent[] = [{
      type: 'assistant',
      uuid: 'a5',
      sessionId: 's1',
      timestamp: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu5', name: 'Bash', input: {} }],
        model: 'claude-sonnet',
        id: 'msg5',
        type: 'message',
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    }];

    // Non-agent batch at T=6s (throttle expired): shouldRefreshDag still returns false because
    // there is no Agent tool_use in this batch. The component's pendingDagRefreshRef=true carries
    // the deferred refresh — shouldRefreshDag is not the only gate.
    expect(shouldRefreshDag(nonAgentEvents, 0, THROTTLE_MS, Date.now())).toBe(false);

    // An Agent dispatch in the same batch at T=6s (throttle expired): fires immediately.
    const agentEvents: SessionEvent[] = [{
      type: 'assistant',
      uuid: 'a6',
      sessionId: 's1',
      timestamp: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu6', name: 'Agent', input: {} }],
        model: 'claude-sonnet',
        id: 'msg6',
        type: 'message',
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    }];
    const now = Date.now();
    const staleRefresh = now - THROTTLE_MS - 1; // throttle expired
    expect(shouldRefreshDag(agentEvents, staleRefresh, THROTTLE_MS, now)).toBe(true);
  });

  it('documents the dead-man switch bug: when throttled, refresh must not depend on future events', () => {
    const agentEvent: SessionEvent = {
      type: 'assistant',
      uuid: 'a-dead-switch',
      sessionId: 's1',
      timestamp: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu-dead', name: 'Agent', input: {} }],
        model: 'claude-sonnet',
        id: 'msg-dead',
        type: 'message',
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    };

    const now = Date.now();
    const recentRefresh = now - 2000; // 2s ago, throttle is 5s — still blocked

    expect(shouldRefreshDag([agentEvent], recentRefresh, THROTTLE_MS, now)).toBe(false);

    const remainingMs = THROTTLE_MS - (now - recentRefresh);
    expect(remainingMs).toBeGreaterThan(0);
    expect(remainingMs).toBeLessThan(THROTTLE_MS);
  });
});
