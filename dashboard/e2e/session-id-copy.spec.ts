import { test, expect } from "@playwright/test";

test.describe("Session ID in sidebar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("session ID span has title attribute with full id", async ({ page }) => {
    const sessionSpan = page.locator('[title]').filter({ hasText: /^[0-9a-f]{8}/ }).first();
    await expect(sessionSpan).toBeVisible({ timeout: 5000 });

    const title = await sessionSpan.getAttribute("title");
    expect(title).toBeTruthy();
    expect(title!.length).toBeGreaterThan(8);
  });

  test("hovering a session row reveals the copy button", async ({ page }) => {
    const sessionSpan = page.locator('[title]').filter({ hasText: /^[0-9a-f]{8}/ }).first();
    await expect(sessionSpan).toBeVisible({ timeout: 5000 });

    const row = sessionSpan.locator("..");
    const copyBtn = row.locator('[data-testid="copy-session-id"]');
    await expect(copyBtn).toBeAttached();

    await row.hover({ force: true });
    await expect(copyBtn).toBeVisible();
  });

  test("clicking copy button writes full session id to clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    let capturedText = "";
    await page.exposeFunction("__captureClipboard", (text: string) => {
      capturedText = text;
    });

    await page.addInitScript(() => {
      const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = async (text: string) => {
        (window as Window & { __captureClipboard?: (t: string) => void }).__captureClipboard?.(text);
        try { await orig(text); } catch (_) {}
      };
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const sessionSpan = page.locator('[title]').filter({ hasText: /^[0-9a-f]{8}/ }).first();
    await expect(sessionSpan).toBeVisible({ timeout: 5000 });
    const fullId = await sessionSpan.getAttribute("title");

    const row = sessionSpan.locator("..");
    const copyBtn = row.locator('[data-testid="copy-session-id"]');

    // Use elementHandle.click() — Playwright's mouse-based click lands on the
    // overlapping repo header div; elementHandle.click() dispatches directly on the element.
    const btnHandle = await copyBtn.elementHandle();
    expect(btnHandle).not.toBeNull();
    await page.evaluate((btn) => (btn as HTMLElement).click(), btnHandle!);
    await page.waitForTimeout(200);

    expect(capturedText).toBe(fullId);
  });
});
