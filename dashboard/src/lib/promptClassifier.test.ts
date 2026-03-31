import { describe, it, expect } from "vitest";
import { classifyPrompt, detectBlobType } from "./promptClassifier";

describe("classifyPrompt", () => {
  // --- Priority 1: Command/trigger ---
  describe("command type", () => {
    it("classifies slash command with args", () => {
      const result = classifyPrompt("/dev-loop implement auth");
      expect(result).toEqual({
        type: "command",
        command: "/dev-loop",
        args: "implement auth",
      });
    });

    it("classifies slash command without args", () => {
      const result = classifyPrompt("/help");
      expect(result).toEqual({ type: "command", command: "/help", args: "" });
    });

    it("classifies <next> as command", () => {
      const result = classifyPrompt("<next>");
      expect(result).toEqual({ type: "command", command: "<next>", args: "" });
    });

    it("classifies <continue> as command", () => {
      const result = classifyPrompt("<continue>");
      expect(result).toEqual({
        type: "command",
        command: "<continue>",
        args: "",
      });
    });

    it("classifies bang command", () => {
      const result = classifyPrompt("!git status");
      expect(result).toEqual({
        type: "command",
        command: "!git",
        args: "status",
      });
    });

    it("classifies bang command without args", () => {
      const result = classifyPrompt("!ls");
      expect(result).toEqual({ type: "command", command: "!ls", args: "" });
    });

    it("trims whitespace around commands", () => {
      const result = classifyPrompt("  /help  ");
      expect(result).toEqual({ type: "command", command: "/help", args: "" });
    });
  });

  // --- Priority 2: Short intent ---
  describe("short_intent type", () => {
    it("classifies short single-line text", () => {
      const result = classifyPrompt("fix the bug");
      expect(result).toEqual({ type: "short_intent" });
    });

    it("classifies empty string as short_intent", () => {
      const result = classifyPrompt("");
      expect(result).toEqual({ type: "short_intent" });
    });

    it("classifies 5 short lines as short_intent", () => {
      const text = "line 1\nline 2\nline 3\nline 4\nline 5";
      const result = classifyPrompt(text);
      expect(result).toEqual({ type: "short_intent" });
    });

    it("classifies text at exactly 500 chars as short_intent", () => {
      const text = "a".repeat(500);
      expect(text.split("\n").length).toBe(1);
      const result = classifyPrompt(text);
      expect(result).toEqual({ type: "short_intent" });
    });

    it("does not classify 501 chars as short_intent", () => {
      const text = "a".repeat(501);
      const result = classifyPrompt(text);
      expect(result.type).not.toBe("short_intent");
    });
  });

  // --- Priority 3: Task list ---
  describe("task_list type", () => {
    it("classifies numbered list with 6+ items (exceeds short_intent threshold)", () => {
      const text =
        "1. Build the auth module\n2. Add tests\n3. Deploy to staging\n4. Monitor logs\n5. Update docs\n6. Notify team";
      const result = classifyPrompt(text);
      expect(result).toEqual({
        type: "task_list",
        items: [
          "Build the auth module",
          "Add tests",
          "Deploy to staging",
          "Monitor logs",
          "Update docs",
          "Notify team",
        ],
        visibleCount: 3,
      });
    });

    it("short task list (<=5 lines) is short_intent per priority", () => {
      const text = "1. Build it\n2. Test it\n3. Ship it";
      const result = classifyPrompt(text);
      expect(result.type).toBe("short_intent");
    });

    it("classifies 7 numbered tasks", () => {
      const lines = Array.from(
        { length: 7 },
        (_, i) => `${i + 1}. Task ${i + 1}`,
      );
      const result = classifyPrompt(lines.join("\n"));
      expect(result.type).toBe("task_list");
      if (result.type === "task_list") {
        expect(result.items).toHaveLength(7);
        expect(result.visibleCount).toBe(3);
      }
    });

    it("classifies dash list items (6+ to exceed short_intent)", () => {
      const text =
        "- First thing\n- Second thing\n- Third thing\n- Fourth thing\n- Fifth thing\n- Sixth thing";
      const result = classifyPrompt(text);
      expect(result.type).toBe("task_list");
      if (result.type === "task_list") {
        expect(result.items).toHaveLength(6);
        expect(result.items[0]).toBe("First thing");
        expect(result.visibleCount).toBe(3);
      }
    });

    it("classifies asterisk list items (6+ to exceed short_intent)", () => {
      const text =
        "* Alpha\n* Beta\n* Gamma\n* Delta\n* Epsilon\n* Zeta";
      const result = classifyPrompt(text);
      expect(result.type).toBe("task_list");
      if (result.type === "task_list") {
        expect(result.items).toHaveLength(6);
        expect(result.items[0]).toBe("Alpha");
      }
    });

    it("does not classify 2 list items as task_list", () => {
      const text = "1. First\n2. Second";
      const result = classifyPrompt(text);
      expect(result.type).not.toBe("task_list");
    });

    it("handles mixed content with list items (6+ lines total)", () => {
      const text =
        "Please do these:\n1. Build auth\n2. Add tests\n3. Deploy\n4. Monitor\n5. Review\n6. Merge";
      const result = classifyPrompt(text);
      expect(result.type).toBe("task_list");
      if (result.type === "task_list") {
        expect(result.items).toHaveLength(6);
      }
    });
  });

  // --- Priority 4: Intent + blob ---
  describe("intent_blob type", () => {
    it("classifies short intent + stack trace as intent_blob", () => {
      const stackTrace = Array.from(
        { length: 50 },
        (_, i) => `    at Module._compile (module.js:${i + 100})`,
      ).join("\n");
      const text = `fix this:\n${stackTrace}`;
      const result = classifyPrompt(text);
      expect(result.type).toBe("intent_blob");
      if (result.type === "intent_blob") {
        expect(result.intent).toBe("fix this:");
        expect(result.blobType).toBe("error log");
        expect(result.blobLines).toBe(50);
      }
    });

    it("classifies intent + code blob", () => {
      const code = Array.from(
        { length: 10 },
        (_, i) => `  const val${i} = ${i};`,
      ).join("\n");
      const text = `refactor this function\n${code}`;
      const result = classifyPrompt(text);
      expect(result.type).toBe("intent_blob");
      if (result.type === "intent_blob") {
        expect(result.intent).toBe("refactor this function");
        expect(result.blobType).toBe("code");
        expect(result.blobLines).toBe(10);
      }
    });

    it("classifies intent + JSON blob", () => {
      const json = `{\n  "name": "test",\n  "value": 1,\n  "nested": {\n    "a": true\n  }\n}`;
      const text = `parse this JSON:\n${json}`;
      const result = classifyPrompt(text);
      expect(result.type).toBe("intent_blob");
      if (result.type === "intent_blob") {
        expect(result.blobType).toBe("JSON");
      }
    });

    it("does not classify when remainder is < 5 lines", () => {
      const text = "fix this:\nline1\nline2\nline3";
      const result = classifyPrompt(text);
      // Should be short_intent since total is 4 lines and under 500 chars
      expect(result.type).not.toBe("intent_blob");
    });
  });

  // --- Priority 5: Long prose ---
  describe("long_prose type", () => {
    it("classifies long text as long_prose when first line is long", () => {
      const firstLine =
        "This is a very long first line that exceeds one hundred characters so it cannot be classified as an intent_blob because the intent threshold is 100 chars.";
      const restLines = Array.from(
        { length: 19 },
        (_, i) => `Paragraph line ${i + 2} with enough text.`,
      );
      const lines = [firstLine, ...restLines];
      const text = lines.join("\n");
      const result = classifyPrompt(text);
      expect(result.type).toBe("long_prose");
      if (result.type === "long_prose") {
        expect(result.visibleLines).toHaveLength(3);
        expect(result.visibleLines[0]).toBe(firstLine);
        expect(result.remainingLines).toBe(17);
      }
    });

    it("501 chars single line falls to long_prose", () => {
      const text = "a".repeat(501);
      const result = classifyPrompt(text);
      expect(result.type).toBe("long_prose");
      if (result.type === "long_prose") {
        expect(result.visibleLines).toHaveLength(1);
        expect(result.remainingLines).toBe(0);
      }
    });
  });

  // --- Edge cases ---
  describe("edge cases", () => {
    it("<next> is always command, never collapsed", () => {
      const result = classifyPrompt("<next>");
      expect(result.type).toBe("command");
    });

    it("under 5 lines is always short_intent if under 500 chars", () => {
      const text = "line 1\nline 2\nline 3\nline 4";
      expect(classifyPrompt(text).type).toBe("short_intent");
    });

    it("task list with intro text extracts only list items", () => {
      const text =
        "Here are the tasks:\n- Build it\n- Test it\n- Ship it\n- Deploy it\n- Monitor it";
      const result = classifyPrompt(text);
      expect(result.type).toBe("task_list");
      if (result.type === "task_list") {
        expect(result.items).toEqual([
          "Build it",
          "Test it",
          "Ship it",
          "Deploy it",
          "Monitor it",
        ]);
      }
    });

    it("whitespace-only lines are handled gracefully", () => {
      const result = classifyPrompt("   \n  \n ");
      expect(result.type).toBe("short_intent");
    });
  });
});

describe("detectBlobType", () => {
  it("detects error log from stack trace lines", () => {
    const text = "Error: something failed\n    at foo (bar.js:1:2)\n    at baz (qux.js:3:4)";
    expect(detectBlobType(text)).toBe("error log");
  });

  it("detects error log from TypeError", () => {
    const text = "TypeError: Cannot read property 'x' of undefined\n    at Object.<anonymous>";
    expect(detectBlobType(text)).toBe("error log");
  });

  it("detects error log from Traceback", () => {
    const text = "Traceback (most recent call last):\n  File \"test.py\", line 1";
    expect(detectBlobType(text)).toBe("error log");
  });

  it("detects code from keywords", () => {
    const text = "import React from 'react';\nfunction App() {\n  const x = 1;\n  return null;\n}";
    expect(detectBlobType(text)).toBe("code");
  });

  it("detects JSON from opening brace", () => {
    const text = '{\n  "key": "value",\n  "num": 42\n}';
    expect(detectBlobType(text)).toBe("JSON");
  });

  it("detects JSON from opening bracket", () => {
    const text = '[\n  {"id": 1},\n  {"id": 2}\n]';
    expect(detectBlobType(text)).toBe("JSON");
  });

  it("detects markup from angle brackets", () => {
    const text = "<div>\n  <span>Hello</span>\n</div>";
    expect(detectBlobType(text)).toBe("markup");
  });

  it("returns empty string for plain text", () => {
    const text = "This is just regular text\nwith multiple lines\nnothing special";
    expect(detectBlobType(text)).toBe("");
  });
});
