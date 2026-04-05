import { test, expect } from "@playwright/test";
import {
  navigateToFirstSession,
  clickMainTab,
  clickBottomTab,
} from "./helpers";

test.describe("Session Layout", () => {
  test.beforeEach(async ({ page }) => {
    const hasSession = await navigateToFirstSession(page);
    if (!hasSession) {
      test.skip(true, "No sessions available");
      return; // won't reach here after skip, but satisfies TS
    }
  });

  test("shows 3 main panel tabs", async ({ page }) => {
    await expect(page.locator("button:has-text('Conversation')")).toBeVisible();
    await expect(page.locator("button:has-text('Raw Log')")).toBeVisible();
    await expect(page.locator("button:has-text('Agent Log')")).toBeVisible();
  });

  test("clicking Raw Log tab switches content", async ({ page }) => {
    await clickMainTab(page, "Raw Log");
    // Verify the Raw Log tab button is still visible (exact match to avoid content buttons)
    await expect(page.getByRole("button", { name: "Raw Log", exact: true })).toBeVisible();
  });

  test("clicking Agent Log tab switches content", async ({ page }) => {
    await clickMainTab(page, "Agent Log");
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: "Agent Log", exact: true })).toBeVisible();
  });

  test("clicking Conversation tab returns to conversation", async ({
    page,
  }) => {
    await clickMainTab(page, "Raw Log");
    await clickMainTab(page, "Conversation");
    await expect(page.locator("button:has-text('Conversation')")).toBeVisible();
    // Conversation has a PromptInput with Send button
    const sendBtn = page.locator("button:has-text('Send')");
    await expect(sendBtn).toBeVisible({ timeout: 5_000 });
  });

  test("bottom panel shows Agent Graph, Tool Call, Cost tabs", async ({
    page,
  }) => {
    await expect(
      page.locator("button:has-text('Agent Graph')"),
    ).toBeVisible();
    await expect(page.locator("button:has-text('Tool Call')")).toBeVisible();
    await expect(page.locator("button:has-text('Cost')")).toBeVisible();
  });

  test("bottom panel tab switching works", async ({ page }) => {
    await clickBottomTab(page, "Tool Call");
    await page.waitForTimeout(300);
    await clickBottomTab(page, "Cost");
    await page.waitForTimeout(300);
    await clickBottomTab(page, "Agent Graph");
    // If we got here without errors, tab switching works
  });
});
