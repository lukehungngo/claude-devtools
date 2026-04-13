import { test, expect } from "@playwright/test";

test.describe("Session event isolation", () => {
  test.beforeEach(async ({ page }) => {
    // Wrap WebSocket so tests can inject fake messages after the page loads
    await page.addInitScript(() => {
      const OriginalWS = window.WebSocket;
      let captured: WebSocket | null = null;

      (window as unknown as Record<string, unknown>).__injectWsMessage = (json: string) => {
        if (!captured) return;
        const evt = new MessageEvent("message", { data: json });
        captured.dispatchEvent(evt);
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).WebSocket = class extends OriginalWS {
        constructor(url: string, protocols?: string | string[]) {
          super(url, protocols);
          captured = this;
        }
      };
    });
  });

  test("WS events for a different session are ignored", async ({ page }) => {
    const resp = await page.request.get("http://localhost:3142/api/sessions");
    if (!resp.ok()) {
      test.skip(true, "Server not available");
      return;
    }
    const data = (await resp.json()) as {
      sessions: { id: string; projectHash: string; repoSlug?: string }[];
    };
    if (!data.sessions || data.sessions.length === 0) {
      test.skip(true, "No sessions available");
      return;
    }

    const session = data.sessions[0];
    const slug = session.repoSlug ?? session.projectHash;

    await page.goto(`/session/${slug}/${session.id}`);
    await page.waitForTimeout(2000);

    // Inject a fake event for a DIFFERENT sessionId with a unique sentinel string
    const sentinel = `ISOLATION_SENTINEL_${Date.now()}`;
    const otherSessionId = `other-session-${Date.now()}`;

    await page.evaluate(
      ([json]) => {
        (window as unknown as Record<string, (j: string) => void>).__injectWsMessage(json);
      },
      [
        JSON.stringify({
          type: "new-events",
          sessionId: otherSessionId,
          filePath: `/fake/${otherSessionId}.jsonl`,
          events: [
            {
              type: "user",
              uuid: `uuid-${Date.now()}`,
              timestamp: new Date().toISOString(),
              agentId: "main",
              message: { role: "user", content: [{ type: "text", text: sentinel }] },
            },
          ],
        }),
      ],
    );

    await page.waitForTimeout(500);

    // The sentinel text must NOT appear anywhere in the page
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain(sentinel);
  });

  test("WS events with empty sessionId are rejected when viewing a session", async ({ page }) => {
    const resp = await page.request.get("http://localhost:3142/api/sessions");
    if (!resp.ok()) {
      test.skip(true, "Server not available");
      return;
    }
    const data = (await resp.json()) as {
      sessions: { id: string; projectHash: string; repoSlug?: string }[];
    };
    if (!data.sessions || data.sessions.length === 0) {
      test.skip(true, "No sessions available");
      return;
    }

    const session = data.sessions[0];
    const slug = session.repoSlug ?? session.projectHash;

    await page.goto(`/session/${slug}/${session.id}`);
    await page.waitForTimeout(2000);

    // Inject event with EMPTY sessionId and a non-matching filePath
    const sentinel = `EMPTY_ID_SENTINEL_${Date.now()}`;

    await page.evaluate(
      ([json]) => {
        (window as unknown as Record<string, (j: string) => void>).__injectWsMessage(json);
      },
      [
        JSON.stringify({
          type: "new-events",
          sessionId: "",                         // empty — was coerced from undefined
          filePath: `/unrelated/fake.jsonl`,     // non-matching path
          events: [
            {
              type: "user",
              uuid: `uuid-empty-${Date.now()}`,
              timestamp: new Date().toISOString(),
              agentId: "main",
              message: { role: "user", content: [{ type: "text", text: sentinel }] },
            },
          ],
        }),
      ],
    );

    await page.waitForTimeout(500);

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain(sentinel);
  });

  test("WS events with matching sessionId DO appear", async ({ page }) => {
    const resp = await page.request.get("http://localhost:3142/api/sessions");
    if (!resp.ok()) {
      test.skip(true, "Server not available");
      return;
    }
    const data = (await resp.json()) as {
      sessions: { id: string; projectHash: string; repoSlug?: string }[];
    };
    if (!data.sessions || data.sessions.length === 0) {
      test.skip(true, "No sessions available");
      return;
    }

    const session = data.sessions[0];
    const slug = session.repoSlug ?? session.projectHash;

    // Get the real file path for this session
    const sessionResp = await page.request.get(
      `http://localhost:3142/api/sessions/${session.projectHash}/${session.id}`,
    );
    if (!sessionResp.ok()) {
      test.skip(true, "Could not load session details");
      return;
    }
    const sessionData = (await sessionResp.json()) as { metrics?: { session?: { path?: string } } };
    const filePath = sessionData.metrics?.session?.path ?? `fake/${session.id}.jsonl`;

    await page.goto(`/session/${slug}/${session.id}`);
    await page.waitForTimeout(2000);

    // Record initial live-events count via DOM (turn items in turn-history panel)
    const countBefore = await page.locator("[data-testid^='turn-item-']").count();

    const ts = new Date().toISOString();
    const userUuid = `injected-user-${Date.now()}`;
    const assistantUuid = `injected-asst-${Date.now()}`;

    // Inject user + assistant events (a complete turn) WITH the correct sessionId
    await page.evaluate(
      ([json]) => {
        (window as unknown as Record<string, (j: string) => void>).__injectWsMessage(json);
      },
      [
        JSON.stringify({
          type: "new-events",
          sessionId: session.id,
          filePath,
          events: [
            {
              type: "user",
              uuid: userUuid,
              timestamp: ts,
              agentId: "main",
              userType: "external",
              message: { role: "user", content: [{ type: "text", text: "Hello from injected user event" }] },
            },
            {
              type: "assistant",
              uuid: assistantUuid,
              timestamp: ts,
              agentId: "main",
              message: { role: "assistant", content: [{ type: "text", text: "Hello from injected assistant event" }] },
            },
          ],
        }),
      ],
    );

    await page.waitForTimeout(800);

    // A complete user+assistant pair should create a new turn in TurnHistoryPanel
    const countAfter = await page.locator("[data-testid^='turn-item-']").count();

    // Turn count should have increased (new turn formed) since these UUIDs are novel
    expect(countAfter).toBeGreaterThan(countBefore);
  });
});
