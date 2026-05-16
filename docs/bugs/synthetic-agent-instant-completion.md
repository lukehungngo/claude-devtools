# Bug: Background Agents marked "done" 0s after dispatch while still running

**Severity:** P0 — wrong data on the headline state of every backgrounded subagent
**Filed:** 2026-05-16, post-execute pass
**Screenshot:** `Screenshot 2026-05-16 at 19.13.47.png`

## Symptom (three-layer inconsistency)

In one frame:

| Surface | Says |
|---|---|
| Background Agents block | `Background agents ×2 ✓ 2 done` — both R3A and R3B labeled `✓ done`, **0s duration each** |
| Main agent narration text | "R3A + R3B **running**. R3C/R3D/R3E queued." |
| Bottom Tasks panel (T33/T34) | `● RUNNING` for both |
| Turn footer | `✓ Completed in 3m 38s · opus-4-7` |

Three of our surfaces disagree about the same two agents. The TaskUpdate-driven Tasks panel is **correct** (Phase 1 fix did its job). Everything else is wrong, including the turn-completion check.

## Root cause (verified — not hypothesis)

**The tool_result for any `Agent` tool_use with `run_in_background: true` is a dispatch handle that fires within ~0.3s, NOT the subagent's final result.** Subagent then runs separately; its actual completion lives somewhere else (daemon task state or a notification event).

### Verified evidence

Direct scan of session `23ba0306-1ae7-4890-b6bc-08c5c49ace13.jsonl` (the screenshot's session):

| Measurement | Value |
|---|---|
| Total Agent dispatches | 26 |
| Dispatches with `run_in_background: true` | **26 / 26** |
| Dispatches with `run_in_background: false` (sync) | 0 |
| Matched `tool_result` per dispatch | 26 / 26 (100%) |
| `tool_result` arrival Δ from dispatch (min) | **221 ms** |
| `tool_result` arrival Δ from dispatch (median) | **275 ms** |
| `tool_result` arrival Δ from dispatch (max) | **571 ms** |
| `tool_result.content` starts with `"Async agent launched successfully"` | **26 / 26** |

Sample tool_result content for R3A (dispatched at 12:07:51.736Z, ack at 12:07:52.122Z, Δ=386ms):

```
[{"type":"text","text":"Async agent launched successfully.
agentId: a2226affd2d2e0971 (internal ID - do not mention to user.
  Use SendMessage with to: 'a2226affd2d2e0971' to continue this agent.)
The agent is working in the background.
You will be notified automatically when it completes.
Do not duplicate this agent's work …"}]
```

The tool_result literally says **"is working in the background"** and **"You will be notified automatically when it completes"** — the result is the dispatch acknowledgement, with an `agentId` handle for follow-up. The subagent's real completion arrives later, through a different channel.

### What broke

Our Phase 3 / 3.5 synthetic-agent logic in:

- `dashboard/src/lib/agentStatus.ts#isAgentCompleted` (top-of-function synthetic short-circuit)
- `dashboard/src/components/conversation/TurnCard.tsx` (per-turn derivation of `backgroundAgents`)
- `server/src/analyzer/dag-builder.ts#buildAgentDAG` (synthetic node creation)

…all use **"matching `tool_result` exists by `tool_use_id` → completed"**. That premise holds for **sync** Agent dispatches (`run_in_background: false`) but is wrong for **async** ones. In this corpus 26/26 dispatches were async, so the bug fires on every dispatch.

The `0s` duration in the Background Agents block is the smoking gun: `endTime` = `tool_result.timestamp` = `dispatch.timestamp + 275ms` (rounded to 0s in the display).

## Real completion signal — verified

The completion event for an async Agent dispatch is a **`<task-notification>` user event** keyed by the original `tool-use-id`. Direct trace of R3A (`toolu_014Cn4f6CNESEkXqPb5NT53R`, agentId `a2226affd2d2e0971`) in session `23ba0306`:

| When | What | Δ from dispatch |
|---|---|---|
| `12:07:51.736Z` | Agent dispatched (`run_in_background: true`) | 0 |
| `12:07:52.122Z` | tool_result = dispatch ack | +386ms ← we wrongly use this as "completed" |
| `12:08:35.449Z` | Main agent issues `TaskCreate` to track the subagent | +44s |
| **`12:14:36.353Z`** | **`queue-operation enqueue` carrying `<task-notification>` with matching `<tool-use-id>`** | **+6m 44s — real completion** |
| `12:14:36.406Z` | Notification surfaced as a `user` event with subagent's actual output | +6m 44s |

The detection pattern, verified against this session:

```
event.type === "user" (or "queue-operation" with operation="enqueue")
AND content includes  "<task-notification>"
AND content includes  `<tool-use-id>${dispatchToolUseId}</tool-use-id>`
```

So fix path is now precise (not speculative):

1. **Server-side**: in `dag-builder.ts`, when synthesizing a node for an async Agent dispatch, scan main `user` events (or `queue-operation` events) for a `<task-notification>` whose `<tool-use-id>` matches. Found → completed; not found → still running.
2. **Dashboard**: same in `agentStatus.ts#isAgentCompleted` synthetic branch and `TurnCard.tsx#backgroundAgents`.
3. **Duration**: end-time = notification timestamp (`12:14:36`), not the dispatch-ack timestamp.

The existing dispatch-ack `tool_result` match remains valid for **sync** Agent dispatches (`run_in_background !== true`) where the tool_result IS the actual result. Distinguish by either (a) checking the tool_result's content for `"Async agent launched successfully"` OR (b) reading the Agent tool_use's `input.run_in_background` flag. Option (b) is the cleaner discriminator — known at dispatch time.

## Knock-on effects

- **Turn completion logic** treats main `end_turn` as turn-done. With Agent dispatches in flight, turn footer should remain "running". Today it flips to "Completed in Xm Xs" the moment main finishes its assistant text — even though 2+ subagents are still working.
- **DAG status** ("active"/"completed"/"error") on synthetic nodes is wrong → Agent Graph timeline bars don't pulse, look stale.
- **Background Agents block** counts "done" with `✓` icon → user thinks work is finished, closes the dashboard, comes back later to find it stale.

## Reproduce

1. Open a live session in dashboard.
2. Issue a prompt that dispatches ≥1 Agent (e.g. anything that triggers the `Agent` tool).
3. Within ~1s of dispatch, observe the Background Agents block: agent appears as `✓ done` with `0s` duration.
4. Cross-check `~/.claude/tasks/<sessionId>/<n>.json` — status is still `in_progress`.

## Acceptance criteria for the fix

- [ ] Synthetic agents with a daemon `TaskCreate` match remain in `running` until that task's daemon JSON flips to `completed` (or `error`).
- [ ] Synthetic agents WITHOUT a matching daemon task (no Task tool dispatched alongside the Agent) fall back to the current tool_result-presence heuristic — but only after a minimum-duration threshold (e.g., 2s) to filter out instant-ack matches.
- [ ] Turn footer shows "Running" while any dispatched Agent's daemon task is still in-flight, even after main agent's `end_turn`.
- [ ] DAG node status reflects the same join.
- [ ] Regression fixture in `dag-builder.synthetic.test.ts`: Agent dispatch + immediate tool_result + daemon task `in_progress` → node status = `active`, not `completed`.
- [ ] Visual smoke: while a subagent runs, the Background Agents block shows `● running` with a live duration ticker, not `✓ done 0s`.

## Related history

- Phase 3 (`docs/specs/phase-3-subagent-join.md`) — built the synthetic-id system on the (wrong, for live sessions) premise that `tool_result.tool_use_id` match means completion. Verified on 21 **closed** sessions. The bug only surfaces live.
- Phase 1.5 / NEW-2 — daemon task state read from `~/.claude/tasks/...`. Already provides the correct signal; just not joined to the synthetic-agent system yet.
- `docs/bugs/subagent-execution-missed.md` — same family of bugs ("turn says done while subagents running"). Updates to that doc's "Fix path" section need amending: tool_result match is not sufficient.

## Why this slipped through testing

All Phase 3/3.5 fixtures used synthetic dispatch + tool_result in the SAME test, with no notion of "the tool_result came back instantly because it's a dispatch handle." The dag-builder unit tests model the closed-session shape where tool_result === completion. They never modelled the daemon-queued shape where tool_result === ack. A new fixture is required (see acceptance criteria).
