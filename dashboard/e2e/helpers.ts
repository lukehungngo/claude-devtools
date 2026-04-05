import { type Page, type TestType, expect } from "@playwright/test";

/**
 * Fetch the first session's URL path from the API,
 * then navigate directly to it.
 *
 * Returns true if navigation succeeded, false if no sessions exist.
 */
export async function navigateToFirstSession(page: Page): Promise<boolean> {
  // Use the REST API to find a session URL — avoids fragile sidebar DOM selectors
  const resp = await page.request.get("http://localhost:3142/api/sessions");
  if (!resp.ok()) return false;

  const data = await resp.json() as {
    sessions: { id: string; projectHash: string; repoSlug?: string }[];
  };
  if (!data.sessions || data.sessions.length === 0) return false;

  const session = data.sessions[0];
  const slug = session.repoSlug ?? session.projectHash;
  const url = `/session/${slug}/${session.id}`;

  await page.goto(url);
  await page.waitForTimeout(1500);

  // Verify we're on a session page
  return /\/session\//.test(page.url());
}

/**
 * Skip test if no sessions are available.
 * Call at the start of tests that require session data.
 */
export async function skipIfNoSessions(
  page: Page,
  test: TestType<any, any>,
  reason = "No sessions available",
): Promise<void> {
  const resp = await page.request.get("http://localhost:3142/api/sessions");
  if (!resp.ok()) {
    test.skip(true, reason);
    return;
  }
  const data = await resp.json() as { sessions: unknown[] };
  if (!data.sessions || data.sessions.length === 0) {
    test.skip(true, reason);
  }
}

/**
 * Wait for the conversation view to be visible on a session page.
 */
export async function waitForConversation(page: Page): Promise<void> {
  await page
    .locator(".conversation-view, [data-testid='conversation']")
    .first()
    .waitFor({ timeout: 10_000 });
}

/**
 * Wait for the main tab area to settle after a tab click.
 */
export async function clickMainTab(
  page: Page,
  tabName: "Conversation" | "Raw Log" | "Agent Log",
): Promise<void> {
  // Use exact text matching to avoid substring matches in content area
  await page.getByRole("button", { name: tabName, exact: true }).click();
  // Small wait for React render
  await page.waitForTimeout(300);
}

/**
 * Wait for the bottom panel tab to settle after a tab click.
 */
export async function clickBottomTab(
  page: Page,
  tabName: "Agent Graph" | "Tool Call" | "Cost",
): Promise<void> {
  await page.locator(`button:has-text("${tabName}")`).click();
  await page.waitForTimeout(300);
}
