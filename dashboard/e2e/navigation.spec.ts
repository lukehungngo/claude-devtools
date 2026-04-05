import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("topbar shows status indicator", async ({ page }) => {
    await page.goto("/");
    const topbar = page.locator("[data-testid='status-dot']");
    await expect(topbar).toBeVisible({ timeout: 10_000 });
  });

  test("clicking a session navigates to session page", async ({ page }) => {
    await page.goto("/");

    // Wait for sidebar to load sessions
    const sessionLink = page.locator("a[href*='/session/']").first();
    const hasSession = await sessionLink.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!hasSession) {
      test.skip(true, "No sessions available to test navigation");
      return;
    }

    await sessionLink.click();
    await expect(page).toHaveURL(/\/session\//);
  });

  test("session page renders conversation view", async ({ page }) => {
    await page.goto("/");

    const sessionLink = page.locator("a[href*='/session/']").first();
    const hasSession = await sessionLink.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!hasSession) {
      test.skip(true, "No sessions available to test conversation view");
      return;
    }

    await sessionLink.click();
    await expect(page).toHaveURL(/\/session\//);

    // Conversation area should render with turns or empty state
    const conversation = page.locator(".conversation-view, [data-testid='conversation']");
    await expect(conversation.first()).toBeVisible({ timeout: 10_000 });
  });
});
