import { Router } from "express";
import { logger } from "../../logger.js";
import { readSettingsJson, writeSettingsJson } from "./route-context.js";

export function createSettingsRoutes(): Router {
  const router = Router();

  // Get hooks from ~/.claude/settings.json
  router.get("/settings/hooks", async (_req, res) => {
    try {
      const settings = await readSettingsJson();
      res.json({ hooks: settings.hooks ?? {} });
    } catch {
      res.json({ hooks: {} });
    }
  });

  // Update hooks in ~/.claude/settings.json
  router.put("/settings/hooks", async (req, res) => {
    try {
      const { hooks } = req.body;
      if (hooks === undefined || hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) {
        return res.status(400).json({ error: "hooks must be an object" });
      }

      const settings = await readSettingsJson();
      settings.hooks = hooks;
      await writeSettingsJson(settings);

      res.json({ success: true });
    } catch (err) {
      logger.error({ error: String(err) }, "Failed to write hooks");
      res.status(500).json({ error: "Failed to write hooks" });
    }
  });

  // --- Permission Rules (settings.json permissions) ---

  /** Validate that a permission rule matches ToolName(pattern) or ToolName format */
  function isValidPermissionRule(rule: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*(\(.*\))?$/.test(rule);
  }

  // Get permissions from ~/.claude/settings.json
  router.get("/settings/permissions", async (_req, res) => {
    try {
      const settings = await readSettingsJson();
      const perms = (settings.permissions ?? {}) as Record<string, unknown>;
      res.json({
        allow: Array.isArray(perms.allow) ? perms.allow : [],
        deny: Array.isArray(perms.deny) ? perms.deny : [],
        ask: Array.isArray(perms.ask) ? perms.ask : [],
      });
    } catch {
      res.json({ allow: [], deny: [], ask: [] });
    }
  });

  // Write permissions to ~/.claude/settings.json
  router.put("/settings/permissions", async (req, res) => {
    try {
      const { allow, deny, ask } = req.body;
      if (!Array.isArray(allow) || !Array.isArray(deny) || !Array.isArray(ask)) {
        return res.status(400).json({ error: "allow, deny, and ask must be arrays" });
      }

      const allRules = [...allow, ...deny, ...ask];
      for (const rule of allRules) {
        if (typeof rule !== "string" || !isValidPermissionRule(rule)) {
          return res.status(400).json({
            error: `Invalid rule format: "${rule}". Expected ToolName(pattern) or ToolName`,
          });
        }
      }

      const existing = await readSettingsJson();
      existing.permissions = { allow, deny, ask };
      await writeSettingsJson(existing);
      res.json({ success: true });
    } catch (err) {
      logger.error({ error: String(err) }, "Failed to write permissions");
      res.status(500).json({ error: "Failed to write permissions" });
    }
  });

  // --- Full Settings Editor (safe fields only) ---

  const SAFE_SETTINGS_FIELDS = new Set(["model", "effort", "permissions", "env", "permissionMode"]);

  // Get full settings.json (user-level)
  router.get("/settings", async (_req, res) => {
    try {
      const settings = await readSettingsJson();
      res.json(settings);
    } catch {
      res.json({});
    }
  });

  // Write safe fields to settings.json
  router.put("/settings", async (req, res) => {
    try {
      const body = req.body;
      if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
        return res.status(400).json({ error: "Body must be a non-empty object" });
      }

      const keys = Object.keys(body);
      const disallowed = keys.filter((k) => !SAFE_SETTINGS_FIELDS.has(k));
      if (disallowed.length > 0) {
        return res.status(400).json({
          error: `Fields not allowed: ${disallowed.join(", ")}. Only ${[...SAFE_SETTINGS_FIELDS].join(", ")} can be modified.`,
        });
      }

      const existing = await readSettingsJson();
      for (const key of keys) {
        (existing as Record<string, unknown>)[key] = body[key];
      }
      await writeSettingsJson(existing);
      res.json({ success: true });
    } catch (err) {
      logger.error({ error: String(err) }, "Failed to write settings");
      res.status(500).json({ error: "Failed to write settings" });
    }
  });

  return router;
}
