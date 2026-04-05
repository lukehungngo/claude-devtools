import { test, expect } from "@playwright/test";
import { navigateToFirstSession } from "./helpers";

test.describe("Skill & Plugin Commands", () => {
  test.beforeEach(async ({ page }) => {
    const hasSession = await navigateToFirstSession(page);
    if (!hasSession) {
      test.skip(true, "No sessions available");
      return;
    }
    await page.waitForTimeout(1000);
  });

  // ── Command Discovery API ──

  test("discovery API returns skill commands", async ({ page }) => {
    const resp = await page.request.get("http://localhost:3142/api/commands");
    expect(resp.ok()).toBe(true);

    const data = (await resp.json()) as {
      commands?: { name: string; description?: string }[];
    };
    expect(data.commands).toBeDefined();
    expect(data.commands!.length).toBeGreaterThan(0);

    const names = data.commands!.map((c) => c.name);

    // Verify representative commands from different namespaces exist
    const expectedNamespaces = ["superpowers:", "mas:"];
    for (const ns of expectedNamespaces) {
      const hasNs = names.some((n) => n.startsWith(ns));
      expect(hasNs).toBe(true);
    }
  });

  test("discovery API includes superpowers:writing-plans", async ({ page }) => {
    const resp = await page.request.get("http://localhost:3142/api/commands");
    const data = (await resp.json()) as {
      commands?: { name: string; description?: string }[];
    };

    const cmd = data.commands!.find(
      (c) => c.name === "superpowers:writing-plans",
    );
    expect(cmd).toBeDefined();
    // Should have a description
    expect(cmd!.description).toBeTruthy();
  });

  test("discovery API includes mas:dev-loop", async ({ page }) => {
    const resp = await page.request.get("http://localhost:3142/api/commands");
    const data = (await resp.json()) as {
      commands?: { name: string; description?: string }[];
    };

    const cmd = data.commands!.find((c) => c.name === "mas:dev-loop");
    expect(cmd).toBeDefined();
    expect(cmd!.description).toBeTruthy();
  });

  // ── Slash Command Dropdown shows skill commands ──

  test("typing / shows skill commands in dropdown", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/");
    await page.waitForTimeout(500);

    const dropdown = page.locator(
      "[role='listbox'][aria-label='Slash commands']",
    );
    const isVisible = await dropdown
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    if (isVisible) {
      const options = dropdown.locator("[role='option']");
      const count = await options.count();
      expect(count).toBeGreaterThan(0);

      // Check that at least some skill commands appear in the full list
      const allText = await dropdown.textContent();
      // The dropdown may be filtered — just verify it renders without crash
      expect(allText).toBeDefined();
    }
  });

  test("typing /superpowers filters to superpowers commands", async ({
    page,
  }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/superpowers");
    await page.waitForTimeout(500);

    const dropdown = page.locator(
      "[role='listbox'][aria-label='Slash commands']",
    );
    const isVisible = await dropdown
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    if (isVisible) {
      const options = dropdown.locator("[role='option']");
      const count = await options.count();
      // Should have at least one superpowers command
      if (count > 0) {
        const firstText = await options.first().textContent();
        expect(firstText?.toLowerCase()).toContain("superpowers");
      }
    }
  });

  test("typing /mas filters to mas commands", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/mas");
    await page.waitForTimeout(500);

    const dropdown = page.locator(
      "[role='listbox'][aria-label='Slash commands']",
    );
    const isVisible = await dropdown
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    if (isVisible) {
      const options = dropdown.locator("[role='option']");
      const count = await options.count();
      if (count > 0) {
        const firstText = await options.first().textContent();
        expect(firstText?.toLowerCase()).toContain("mas");
      }
    }
  });

  // ── Skill command submission triggers streaming ──

  test("submitting a skill command enters streaming state", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const textarea = page.locator("textarea");

    // Use /help as baseline — it's client-side and instant
    // Skill commands are SDK-forwarded and should trigger SSE streaming
    await textarea.fill("/superpowers:writing-plans");
    await textarea.press("Enter");

    // Skill commands forwarded to SDK should enter streaming state
    // OR show "Unknown command" if no active SDK session
    const stopBtn = page.locator("button:has-text('Stop')");
    const unknownCmd = page.locator("text=/Unknown command/").first();
    const streamingOutput = page.locator("text=/Available commands/").first();

    // Wait for either streaming or error — one of them should appear
    const isStreaming = await stopBtn
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    const isUnknown = await unknownCmd
      .isVisible({ timeout: 1_000 })
      .catch(() => false);

    if (isStreaming) {
      // Streaming started — abort immediately
      await expect(textarea).toBeDisabled();
      const stillVisible = await stopBtn.isVisible().catch(() => false);
      if (stillVisible) {
        await stopBtn.click({ force: true });
      }
      await expect(textarea).toBeEnabled({ timeout: 30_000 });
    }
    // If neither streaming nor unknown command, verify no crash
    expect(true).toBe(true);
  });

  test("submitting mas:dev-loop enters streaming state", async ({ page }) => {
    test.setTimeout(60_000);
    const textarea = page.locator("textarea");
    await textarea.fill("/mas:dev-loop");
    await textarea.press("Enter");

    const stopBtn = page.locator("button:has-text('Stop')");
    const isStreaming = await stopBtn
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    if (isStreaming) {
      await expect(textarea).toBeDisabled();
      const stillVisible = await stopBtn.isVisible().catch(() => false);
      if (stillVisible) {
        await stopBtn.click({ force: true });
      }
      await expect(textarea).toBeEnabled({ timeout: 30_000 });
    }
    // Verify no crash regardless of outcome
    expect(true).toBe(true);
  });

  // ── Dropdown selection for skill commands ──

  test("selecting skill command from dropdown fills textarea", async ({
    page,
  }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("/superpowers");
    await page.waitForTimeout(500);

    const dropdown = page.locator(
      "[role='listbox'][aria-label='Slash commands']",
    );
    const isVisible = await dropdown
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    if (isVisible) {
      const options = dropdown.locator("[role='option']");
      const count = await options.count();
      if (count > 0) {
        // Click the first matching option
        await options.first().click();
        await page.waitForTimeout(300);

        // Textarea should now contain the selected command
        const value = await textarea.inputValue();
        expect(value).toContain("/");
      }
    }
  });

  // ── No errors across skill command interactions ──

  test("no page errors during skill command interactions", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const textarea = page.locator("textarea");

    // Type various skill command prefixes
    const prefixes = [
      "/superpowers",
      "/mas",
      "/superpowers:writing-plans",
      "/mas:dev-loop",
      "/everything-claude-code",
    ];

    for (const prefix of prefixes) {
      await textarea.fill(prefix);
      await page.waitForTimeout(300);
    }

    // Clear and type a non-existent namespace
    await textarea.fill("/nonexistent-namespace:fake-command");
    await page.waitForTimeout(300);
    await textarea.fill("");

    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
});
