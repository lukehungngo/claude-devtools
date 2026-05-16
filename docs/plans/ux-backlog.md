# UX Backlog

Small, scoped UX/polish tasks. One-liner per item with file pointers.

## Pending

### 1. Auto-refresh when toggling repo filter to "Active Only"

- **Where:** `dashboard/src/components/RepoList.tsx` — `handleSetFilter("active")` path
- **What:** When user clicks **Active Only**, transparently call `onRefresh()` so the list reflects up-to-the-second status. No visible spinner; should feel like the filter is just smart.
- **Why:** Active state is the most volatile dimension. Clicking the filter implies "show me what's live now," and stale data defeats the intent.
- **Acceptance:**
  - Clicking Active Only triggers `onRefresh` once (debounced if rapid toggling)
  - No spin animation on the refresh icon (silent refresh — distinct from explicit button click)
  - Clicking **All** does NOT trigger refresh
  - localStorage persistence of `repoFilter` still works
- **Notes:** Reuse the existing `onRefresh` prop. Skip the `setIsRefreshing(true)` state so the icon doesn't spin — that visual is reserved for the explicit refresh button.
