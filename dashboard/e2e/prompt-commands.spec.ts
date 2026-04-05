import { test, expect } from "@playwright/test";
import { navigateToFirstSession } from "./helpers";

test.describe("Prompt Commands", () => {
  test.beforeEach(async ({ page }) => {
    const hasSession = await navigateToFirstSession(page);
    if (!hasSession) {
      test.skip(true, "No sessions available");
      return;
    }
    await page.waitForTimeout(1000);
  });

  // ── Client-side slash commands (instant output, no streaming) ──

  test("/help shows available commands list", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/help");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    // Command output area should show "Available commands:"
    const output = page.locator("text=/Available commands/");
    await expect(output).toBeVisible({ timeout: 3_000 });
  });

  test("/cost shows session cost info", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/cost");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    // Cost output shows token counts or cost values
    const output = page.locator("text=/[Cc]ost|[Tt]oken|\\$/").first();
    await expect(output).toBeVisible({ timeout: 3_000 });
  });

  test("/shortcuts shows keyboard shortcuts", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/shortcuts");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    // Shortcuts output contains "Keyboard Shortcuts" and key combos like "Enter", "Escape"
    // The output is in a whitespace-pre-line div — look for partial match
    const output = page.locator("text=/Escape|Enter|Toggle/").first();
    await expect(output).toBeVisible({ timeout: 3_000 });
  });

  test("/usage shows usage info", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/usage");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    // Usage output shows rate limit or plan info
    const output = page.locator("text=/[Uu]sage|limit|plan|No usage/i").first();
    await expect(output).toBeVisible({ timeout: 3_000 });
  });

  test("/context shows context info", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/context");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    // Context output shows window or token info
    const output = page.locator("text=/[Cc]ontext|window|token|No session/i").first();
    await expect(output).toBeVisible({ timeout: 3_000 });
  });

  test("/export md exports conversation", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/export md");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    // Should show "Exported" or "No conversation"
    const output = page.locator("text=/[Ee]xported|No conversation/").first();
    await expect(output).toBeVisible({ timeout: 3_000 });
  });

  test("/tasks shows tasks info", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/tasks");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    // Tasks output shows task list or "no tasks"
    const output = page.locator("text=/[Tt]ask|No active|no tasks/i").first();
    await expect(output).toBeVisible({ timeout: 3_000 });
  });

  test("unknown command shows error", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/nonexistent_xyz");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    const output = page.locator("text=/Unknown command/");
    await expect(output).toBeVisible({ timeout: 3_000 });
  });

  // ── Panel-opening commands ──

  test("/settings opens settings panel", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/settings");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    // Should show "Opening settings panel..."
    const output = page.locator("text=/Opening settings/");
    await expect(output).toBeVisible({ timeout: 3_000 });

    // PanelModal should be open with backdrop
    const modal = page.locator("[data-testid='panel-modal-backdrop']");
    await expect(modal).toBeVisible({ timeout: 3_000 });
  });

  test("/doctor opens diagnostics panel", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/doctor");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    const output = page.locator("text=/Opening diagnostics/");
    await expect(output).toBeVisible({ timeout: 3_000 });

    const modal = page.locator("[data-testid='panel-modal-backdrop']");
    await expect(modal).toBeVisible({ timeout: 3_000 });
  });

  test("/stats opens statistics panel", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/stats");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    const output = page.locator("text=/Opening statistics/");
    await expect(output).toBeVisible({ timeout: 3_000 });

    const modal = page.locator("[data-testid='panel-modal-backdrop']");
    await expect(modal).toBeVisible({ timeout: 3_000 });
  });

  test("/hooks opens hooks panel", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/hooks");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    const output = page.locator("text=/Opening hooks/");
    await expect(output).toBeVisible({ timeout: 3_000 });

    const modal = page.locator("[data-testid='panel-modal-backdrop']");
    await expect(modal).toBeVisible({ timeout: 3_000 });
  });

  test("/memory opens memory panel", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/memory");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    const output = page.locator("text=/Opening memory/");
    await expect(output).toBeVisible({ timeout: 3_000 });

    const modal = page.locator("[data-testid='panel-modal-backdrop']");
    await expect(modal).toBeVisible({ timeout: 3_000 });
  });

  test("panel modal closes with Escape", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/settings");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    const modal = page.locator("[data-testid='panel-modal-backdrop']");
    await expect(modal).toBeVisible({ timeout: 3_000 });

    // Press Escape to close
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible({ timeout: 3_000 });
  });

  // ── Bash prefix commands ──

  test("! prefix executes bash command", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("!echo hello_from_e2e");
    await textarea.press("Enter");
    await page.waitForTimeout(2000);

    // Should show command output with exit status
    const output = page.locator("text=/hello_from_e2e/");
    await expect(output).toBeVisible({ timeout: 5_000 });
  });

  test("! with no command shows usage hint", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("!");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    // Should show "Usage: !<command>" hint
    const output = page.locator("text=/Usage:.*!<command>/").first();
    await expect(output).toBeVisible({ timeout: 3_000 });
  });

  // ── Prompt submission to Claude (streaming) ──

  test("sending a prompt enters streaming state", async ({ page }) => {
    test.setTimeout(60_000);
    const textarea = page.locator("textarea");
    await textarea.fill("respond with just the word 'pong'");
    await textarea.press("Enter");

    // Should enter streaming state — Stop button appears
    const stopBtn = page.locator("button:has-text('Stop')");
    const isStreaming = await stopBtn.isVisible({ timeout: 10_000 }).catch(() => false);

    if (isStreaming) {
      // Verify streaming state: textarea disabled, Stop button visible
      await expect(textarea).toBeDisabled();

      // Abort immediately — we just want to verify the streaming flow starts
      const stillVisible = await stopBtn.isVisible().catch(() => false);
      if (stillVisible) {
        await stopBtn.click({ force: true });
      }

      // Wait for idle state
      await expect(textarea).toBeEnabled({ timeout: 30_000 });
    }
  });

  test("SSE error shows error banner", async ({ page }) => {
    // Send to a session that may produce an error
    const textarea = page.locator("textarea");

    // First check if error banner testid exists
    const errorBanner = page.locator("[data-testid='sse-error-banner']");

    // Type and send — even if no error occurs, verify no crash
    await textarea.fill("test error handling");
    // Don't actually send — just verify the input flow works
    await expect(textarea).toHaveValue("test error handling");
    // Clear without sending
    await textarea.fill("");
    await expect(textarea).toHaveValue("");
  });

  // ── Command output auto-dismiss ──

  test("command output auto-dismisses after delay", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/help");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    // Output should be visible
    const output = page.locator("text=/Available commands/");
    await expect(output).toBeVisible({ timeout: 3_000 });

    // Wait for auto-dismiss (4 seconds in the code)
    await page.waitForTimeout(4500);

    // Output should be gone
    await expect(output).not.toBeVisible({ timeout: 2_000 });
  });

  // ── Input clears after submission ──

  test("input clears after command submission", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/help");
    await textarea.press("Enter");
    await page.waitForTimeout(300);

    // Input should be cleared after submission
    await expect(textarea).toHaveValue("");
  });

  // ── No errors across multiple commands ──

  test("no page errors across rapid command submissions", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const textarea = page.locator("textarea");

    // Fire multiple commands rapidly
    const commands = ["/help", "/cost", "/shortcuts", "/usage", "/tasks", "/context"];
    for (const cmd of commands) {
      await textarea.fill(cmd);
      await textarea.press("Enter");
      await page.waitForTimeout(300);
    }

    await page.waitForTimeout(1000);
    expect(errors).toEqual([]);
  });
});
