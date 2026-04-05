import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("loads and shows title", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Claude DevTools")).toBeVisible();
  });

  test("shows instruction text when no session selected", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator("text=Select a session from the sidebar to begin"),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("sidebar renders repo list", async ({ page }) => {
    await page.goto("/");
    // Sidebar shows REPOSITORIES heading with repo entries
    await expect(page.locator("text=REPOSITORIES")).toBeVisible({ timeout: 10_000 });
  });
});
