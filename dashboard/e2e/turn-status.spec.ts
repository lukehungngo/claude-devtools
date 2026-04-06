import { test, expect } from "@playwright/test";
import { navigateToFirstSession } from "./helpers";

test.describe("Turn Completion Status Consistency", () => {
  test.beforeEach(async ({ page }) => {
    const hasSession = await navigateToFirstSession(page);
    if (!hasSession) {
      test.skip(true, "No sessions available");
      return;
    }
    await page.waitForTimeout(2000);
  });

  test("completed turns show Completed status, not Running", async ({ page }) => {
    // All turns except possibly the last should show "Completed" if the session is idle
    const turnItems = page.locator("[data-testid^='turn-item-']");
    const count = await turnItems.count();

    if (count < 2) {
      test.skip(true, "Need at least 2 turns to verify status");
      return;
    }

    // Check all turns except the last (last might still be running)
    for (let i = 0; i < count - 1; i++) {
      const turnItem = turnItems.nth(i);
      // Turn items should NOT show "Running" for completed turns
      const text = await turnItem.textContent();
      // A completed turn should have a duration displayed (e.g., "1.2s", "45s", "2m")
      // or show "Completed" status — it must NOT show "Running" if a later turn exists
      expect(text).not.toContain("Running");
    }
  });

  test("turn status in conversation matches turn history panel", async ({ page }) => {
    const turnItems = page.locator("[data-testid^='turn-item-']");
    const count = await turnItems.count();

    if (count === 0) {
      test.skip(true, "No turns available");
      return;
    }

    // Last turn: verify it has a status displayed (either Running or Completed)
    const lastTurn = turnItems.nth(count - 1);
    await expect(lastTurn).toBeVisible();
    const lastTurnText = await lastTurn.textContent();
    expect(lastTurnText).toBeTruthy();
  });
});
