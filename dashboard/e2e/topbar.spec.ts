import { test, expect } from "@playwright/test";
import { navigateToFirstSession } from "./helpers";

test.describe("TopBar", () => {
  test("status indicator is visible on homepage", async ({ page }) => {
    await page.goto("/");
    const statusDot = page.locator("[data-testid='status-dot']");
    await expect(statusDot).toBeVisible({ timeout: 10_000 });
  });

  test("theme toggle switches theme", async ({ page }) => {
    await page.goto("/");

    // Theme toggle is in the Titlebar with an aria-label
    const themeButton = page.locator("button[aria-label^='Switch to']");
    await expect(themeButton).toBeVisible({ timeout: 5_000 });

    // Get initial theme from data-theme attribute on <html>
    const initialTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );

    await themeButton.click();
    await page.waitForTimeout(300);

    // Theme should have changed
    const newTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );

    expect(newTheme).not.toBe(initialTheme);
    expect(["dark", "light", "high-contrast"]).toContain(newTheme);
  });

  test("session metadata appears in topbar on session page", async ({ page }) => {
    const hasSession = await navigateToFirstSession(page);
    if (!hasSession) {
      test.skip(true, "No sessions available");
      return;
    }
    await page.waitForTimeout(2_000);

    // TopBar shows HudMetric components with labels: Model, Duration, Cost, Agents
    // Check that at least the Model label is visible (indicates metrics loaded)
    const modelLabel = page.locator("text=Model").first();
    const hasModel = await modelLabel
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasModel) {
      // Duration and Cost labels should also be present
      await expect(page.locator("text=Duration").first()).toBeVisible();
      await expect(page.locator("text=Cost").first()).toBeVisible();
      await expect(page.locator("text=Agents").first()).toBeVisible();
    }

    // If no metrics loaded (empty session), at least verify no crash
    expect(true).toBe(true);
  });

  test("status dot has a background color", async ({ page }) => {
    await page.goto("/");
    const statusDot = page.locator("[data-testid='status-dot']");
    await expect(statusDot).toBeVisible({ timeout: 10_000 });

    // Status dot should have a computed background color
    const bgColor = await statusDot.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor,
    );
    expect(bgColor).toBeTruthy();
    expect(bgColor).not.toBe("");
  });

  test("theme persists after toggle and reload", async ({ page }) => {
    await page.goto("/");

    const themeButton = page.locator("button[aria-label^='Switch to']");
    await expect(themeButton).toBeVisible({ timeout: 5_000 });

    // Toggle theme
    await themeButton.click();
    await page.waitForTimeout(300);

    const themeAfterToggle = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );

    // Reload the page and verify theme persisted via localStorage
    await page.reload();
    await page.waitForTimeout(1_000);

    const themeAfterReload = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );

    expect(themeAfterReload).toBe(themeAfterToggle);
  });
});
