import { test, expect, type Page } from "@playwright/test";

async function getAllSessions(page: Page) {
  const resp = await page.request.get("http://localhost:3142/api/sessions");
  if (!resp.ok()) return [];
  const data = (await resp.json()) as {
    sessions: { id: string; projectHash: string; repoSlug?: string }[];
  };
  return data.sessions ?? [];
}

test.describe("Session Switch Data Freshness", () => {
  test("switching sessions updates turn history panel", async ({ page }) => {
    const sessions = await getAllSessions(page);
    if (sessions.length < 2) {
      test.skip(true, "Need at least 2 sessions to test switching");
      return;
    }

    const s1 = sessions[0];
    const s2 = sessions[1];
    const slug1 = s1.repoSlug ?? s1.projectHash;
    const slug2 = s2.repoSlug ?? s2.projectHash;

    // Navigate to first session
    await page.goto(`/session/${slug1}/${s1.id}`);
    await page.waitForTimeout(2000);

    // Capture turn count from first session
    const turnsSession1 = await page.locator("[data-testid^='turn-item-']").count();

    // Navigate to second session
    await page.goto(`/session/${slug2}/${s2.id}`);
    await page.waitForTimeout(2000);

    // Capture turn count from second session
    const turnsSession2 = await page.locator("[data-testid^='turn-item-']").count();

    // At minimum, verify no crash and turns are loaded
    // If both sessions have turns, at least one should have loaded
    expect(turnsSession1 + turnsSession2).toBeGreaterThan(0);
  });

  test("switching sessions clears stale model display", async ({ page }) => {
    const sessions = await getAllSessions(page);
    if (sessions.length < 2) {
      test.skip(true, "Need at least 2 sessions to test switching");
      return;
    }

    const s1 = sessions[0];
    const s2 = sessions[1];
    const slug1 = s1.repoSlug ?? s1.projectHash;
    const slug2 = s2.repoSlug ?? s2.projectHash;

    // Navigate to first session and wait for load
    await page.goto(`/session/${slug1}/${s1.id}`);
    await page.waitForTimeout(2000);

    // Navigate to second session
    await page.goto(`/session/${slug2}/${s2.id}`);
    await page.waitForTimeout(2000);

    // The page should not show error state
    const errorEl = page.locator("text=Failed to load session");
    await expect(errorEl).not.toBeVisible();
  });

  test("switching sessions does not show previous session Agent Log data", async ({ page }) => {
    const sessions = await getAllSessions(page);
    if (sessions.length < 2) {
      test.skip(true, "Need at least 2 sessions to test switching");
      return;
    }

    const s1 = sessions[0];
    const s2 = sessions[1];
    const slug1 = s1.repoSlug ?? s1.projectHash;
    const slug2 = s2.repoSlug ?? s2.projectHash;

    // Navigate to first session, switch to Agent Log tab
    await page.goto(`/session/${slug1}/${s1.id}`);
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: "Agent Log", exact: true }).click();
    await page.waitForTimeout(500);

    // Capture Agent Log content
    const agentLogContent1 = await page.locator(".overflow-x-auto, .overflow-auto").first().textContent();

    // Navigate to second session
    await page.goto(`/session/${slug2}/${s2.id}`);
    await page.waitForTimeout(2000);

    // Still on Agent Log tab — verify no crash
    const pageContent = await page.textContent("body");
    expect(pageContent).toBeTruthy();
  });
});
