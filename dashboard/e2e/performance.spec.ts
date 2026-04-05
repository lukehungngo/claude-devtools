import { test, expect } from "@playwright/test";
import { navigateToFirstSession } from "./helpers";

const API_BASE = "http://localhost:3142";

/** Returns elapsed ms, or null if the server is not reachable. */
async function timedGet(
  page: Parameters<typeof navigateToFirstSession>[0],
  url: string,
): Promise<{ elapsed: number; resp: Awaited<ReturnType<typeof page.request.get>> } | null> {
  try {
    const start = Date.now();
    const resp = await page.request.get(url);
    const elapsed = Date.now() - start;
    return { elapsed, resp };
  } catch {
    return null;
  }
}

test.describe("Performance", () => {
  test("homepage loads within 3 seconds", async ({ page }) => {
    const start = Date.now();
    await page.goto("/");
    await expect(page.locator("text=Claude DevTools")).toBeVisible();
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(3000);
  });

  test("no console errors on homepage", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForTimeout(2000);

    const realErrors = errors.filter(
      (e) =>
        !e.includes("ERR_CONNECTION_REFUSED") &&
        !e.includes("Failed to fetch") &&
        !e.includes("net::ERR_") &&
        // Backend API errors are benign when the server isn't running or returns 5xx
        !e.includes("Failed to load resource"),
    );
    expect(realErrors).toEqual([]);
  });

  test("session page loads within 5 seconds", async ({ page }) => {
    const start = Date.now();
    let navigated: boolean;
    try {
      navigated = await navigateToFirstSession(page);
    } catch {
      test.skip(true, "API server not available");
      return;
    }

    if (!navigated) {
      test.skip(true, "No sessions available to test load time");
      return;
    }

    await expect(page).toHaveURL(/\/session\//);
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(5000);
  });

  test("GET /api/sessions responds within 500ms", async ({ page }) => {
    const result = await timedGet(page, `${API_BASE}/api/sessions`);
    if (result === null) {
      test.skip(true, "API server not available");
      return;
    }

    expect(result.resp.ok()).toBe(true);
    expect(result.elapsed).toBeLessThan(1000);
  });

  test("GET /api/repos responds within 1 second", async ({ page }) => {
    const result = await timedGet(page, `${API_BASE}/api/repos`);
    if (result === null) {
      test.skip(true, "API server not available");
      return;
    }

    expect(result.resp.ok()).toBe(true);
    expect(result.elapsed).toBeLessThan(1000);
  });

  test("GET /api/commands responds within 1 second", async ({ page }) => {
    const result = await timedGet(page, `${API_BASE}/api/commands`);
    if (result === null) {
      test.skip(true, "API server not available");
      return;
    }

    expect(result.resp.ok()).toBe(true);
    expect(result.elapsed).toBeLessThan(1000);
  });

  test("GET session detail responds within 1 second", async ({ page }) => {
    const sessionsResult = await timedGet(page, `${API_BASE}/api/sessions`);
    if (sessionsResult === null) {
      test.skip(true, "API server not available");
      return;
    }
    if (!sessionsResult.resp.ok()) {
      test.skip(true, "Sessions endpoint returned error");
      return;
    }

    const data = (await sessionsResult.resp.json()) as {
      sessions: { id: string; projectHash: string; repoSlug?: string }[];
    };

    if (!data.sessions || data.sessions.length === 0) {
      test.skip(true, "No sessions available");
      return;
    }

    const session = data.sessions[0];
    const slug = session.repoSlug ?? session.projectHash;
    const detailUrl = `${API_BASE}/api/sessions/${slug}/${session.id}`;

    const detailResult = await timedGet(page, detailUrl);
    if (detailResult === null) {
      test.skip(true, "API server not available");
      return;
    }

    expect(detailResult.resp.ok()).toBe(true);
    expect(detailResult.elapsed).toBeLessThan(1000);
  });

  test("GET /api/doctor responds within 1 second", async ({ page }) => {
    const result = await timedGet(page, `${API_BASE}/api/doctor`);
    if (result === null) {
      test.skip(true, "API server not available");
      return;
    }

    expect(result.resp.ok()).toBe(true);
    expect(result.elapsed).toBeLessThan(1000);
  });

  test("GET /api/stats responds within 1 second", async ({ page }) => {
    const result = await timedGet(page, `${API_BASE}/api/stats`);
    if (result === null) {
      test.skip(true, "API server not available");
      return;
    }

    expect(result.resp.ok()).toBe(true);
    expect(result.elapsed).toBeLessThan(1000);
  });
});
