# Brainstorm: Per-repo Insights filtering

**Date:** 2026-04-20
**Input type:** Idea
**Input:** the insight now work on all repo, can u add repo specific along with all repo, so i can look into each repo individually

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| Server filtering isn't implemented yet | WRONG | computeInsightsAggregate(sessions, timeRange, repo) filters s.cwd !== repo — all 5 endpoints accept repo param |
| A separate repos API is needed | QUESTIONED | InsightsTopRepoRow[] from /insights/top-consumers already lists repos with cwd + repoName. Can reuse. |
| REPO_OPTIONS is dynamic | WRONG | Line 26 InsightsPage: REPO_OPTIONS = [{ value: "all", label: "All repos" }] — hardcoded |
| Repo = project root (cwd) | CONFIRMED | SessionInfo.cwd is the project directory; RepoGroup.repoName is its basename |

## Fundamentals

- TRUTH: 5 Insights API endpoints already filter by repo query param
- TRUTH: InsightsPage already has repo state and passes it to all hooks
- TRUTH: SegPill filter already renders from REPO_OPTIONS — just has only 1 option
- TRUTH: Top consumers already returns InsightsTopRepoRow[] with { repoName, cwd } — we know which repos have data
- CONSTRAINT: Repo list must be scoped to selected timeRange (repos active in last 7d differ from last 90d)

## Output

Validated YES — solution direction is clear. The gap is one piece: dynamically populate REPO_OPTIONS.

### Recommended approach (no new server code)

Extract repo list from InsightsTopRepoRow[] that top-consumers already returns.
Wire topConsumers.repos[] → REPO_OPTIONS in the dashboard.

Steps:
1. In InsightsPage, read repos from useInsightsTopConsumers().data.repos
2. Build REPO_OPTIONS: [{ value: "all", label: "All repos" }, ...repos.map(r => ({ value: r.cwd, label: r.repoName }))]
3. When repo state changes, all existing hooks already re-fetch with the new repo param

Zero new server code. Zero new endpoints. All filtering is already working.

## Next Steps

/mas:dev-loop implement per-repo filter for Insights page — see docs/brainstorms/2026-04-20-insights-per-repo-filter.md
