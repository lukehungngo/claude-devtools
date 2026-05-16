# Phase 5 Spec — Active Only auto-refresh

**Loop step:** 1 of 5 · **Status:** drafting · **Owner:** main session
**Source:** `docs/plans/ux-backlog.md` item #1

---

## Goal

When the user toggles the repo filter to **Active Only**, silently call `onRefresh()` so the displayed "active" list reflects current state — without the user noticing a fetch happened. Spinner animation **not** shown (reserved for the explicit refresh button).

---

## Verified ground truth

- `RepoList.tsx` currently calls `saveRepoFilter(filter)` + `setRepoFilter(filter)` on toggle.
- `onRefresh` prop is already wired (passed from `AppLayout.tsx` as `refreshRepos`).
- `handleRefresh` already implements the explicit button path with `setIsRefreshing(true)` + 600ms timeout for the spin animation.

---

## Scope

### 5.1 — Trigger silent refresh on filter change to "active"

**File:** `dashboard/src/components/RepoList.tsx`

Modify `handleSetFilter`:

```ts
const handleSetFilter = useCallback((filter: RepoFilter) => {
  setRepoFilter(filter);
  saveRepoFilter(filter);
  // Silent refresh when switching to "active" — keeps the list fresh.
  // No spin animation: that's reserved for the explicit refresh button.
  if (filter === "active") {
    onRefresh?.();
  }
}, [onRefresh]);
```

No new state, no debouncing in v1 (toggle clicks are rare).

---

## Acceptance criteria

- [ ] Clicking **Active Only** triggers `onRefresh` once.
- [ ] Clicking **All** does NOT trigger `onRefresh`.
- [ ] Refresh icon does NOT spin during the silent refresh.
- [ ] `localStorage["repo-filter"]` still persists across reloads.
- [ ] Existing `RepoList.test.tsx` 10 tests stay green.
- [ ] New test: clicking Active Only with `onRefresh` mock → mock called once. Clicking All → mock not called.

---

## Risks

- **Rapid toggling.** If the user spam-clicks Active Only/All/Active Only, `onRefresh` could fire repeatedly. v1 accepts this; if user reports, add 300ms debounce.
- **No coordination conflict.** `RepoList.tsx` was modified earlier this session; we own it.

---

## Loop status

- [x] Step 1: Spec drafted (this file)
- [x] Step 2: Self-review (single-component, no architectural surface — skip differential-reviewer)
- [x] Step 3: Implementation plan (below, inline)
- [ ] Step 4: Execute
- [ ] Step 5: Gap review

---

## Implementation plan (inline — micro-change)

### T1 — Modify `handleSetFilter` in `RepoList.tsx`

Edit lines 88-91 of `dashboard/src/components/RepoList.tsx`:

```ts
const handleSetFilter = useCallback((filter: RepoFilter) => {
  setRepoFilter(filter);
  saveRepoFilter(filter);
  if (filter === "active") onRefresh?.();
}, [onRefresh]);
```

### T2 — Add regression test

**File:** `dashboard/src/components/RepoList.test.tsx`

```ts
it("calls onRefresh silently when toggling to Active Only", () => {
  const onRefresh = vi.fn();
  render(
    <RepoList
      repos={[makeRepoGroup()]}
      loading={false}
      selected={null}
      onSelect={vi.fn()}
      onRefresh={onRefresh}
    />,
  );
  fireEvent.click(screen.getByTestId("repo-filter-active"));
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

it("does NOT call onRefresh when toggling back to All", () => {
  const onRefresh = vi.fn();
  render(
    <RepoList
      repos={[makeRepoGroup()]}
      loading={false}
      selected={null}
      onSelect={vi.fn()}
      onRefresh={onRefresh}
    />,
  );
  fireEvent.click(screen.getByTestId("repo-filter-active"));  // first
  onRefresh.mockClear();
  fireEvent.click(screen.getByTestId("repo-filter-all"));
  expect(onRefresh).not.toHaveBeenCalled();
});
```

### T3 — Verify

```bash
cd dashboard
pnpm -C dashboard test src/components/RepoList.test.tsx
npx tsc --noEmit
```

Acceptance: 12 tests green (10 existing + 2 new), zero TS errors.

---

## Execution mode

- ~5 LOC change. No subagent.
- Total time: 5 minutes including tests.
