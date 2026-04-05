import { test, expect } from "@playwright/test";

test.describe("Error Resilience", () => {
  test("invalid session URL shows error state", async ({ page }) => {
    // Navigate to a non-existent session
    await page.goto("/session/fake-repo/fake-session-id-12345");

    // Should show error message, not crash
    const errorState = page.locator("text=Failed to load session");
    await expect(errorState).toBeVisible({ timeout: 10_000 });
  });

  test("can navigate back to homepage after error", async ({ page }) => {
    await page.goto("/session/fake-repo/fake-session-id-12345");
    await page.locator("text=Failed to load session").waitFor({ timeout: 10_000 });

    // Navigate back to homepage
    await page.goto("/");
    await expect(page.locator("text=Claude DevTools")).toBeVisible({ timeout: 5_000 });
  });

  test("no unhandled exceptions across page transitions", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => {
      errors.push(err.message);
    });

    // Homepage
    await page.goto("/");
    await page.waitForTimeout(1000);

    // Invalid session
    await page.goto("/session/fake-repo/nonexistent");
    await page.waitForTimeout(2000);

    // Back to homepage
    await page.goto("/");
    await page.waitForTimeout(1000);

    expect(errors).toEqual([]);
  });

  test("no console errors on homepage load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForTimeout(2000);

    // Filter benign errors (connection refused when backend not running)
    const realErrors = errors.filter(
      (e) =>
        !e.includes("ERR_CONNECTION_REFUSED") &&
        !e.includes("Failed to fetch") &&
        !e.includes("net::ERR_"),
    );
    expect(realErrors).toEqual([]);
  });
});
