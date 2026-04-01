import { spawnSync } from "child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { Router } from "express";
import { logger } from "../../logger.js";
import { readSettingsJson, writeSettingsJson } from "./route-context.js";
export function createSettingsRoutes() {
    const router = Router();
    // Get hooks from ~/.claude/settings.json and ~/.claude/hooks/ directory
    router.get("/settings/hooks", async (_req, res) => {
        try {
            const settings = await readSettingsJson();
            const hooks = settings.hooks ?? {};
            // Read hook files from ~/.claude/hooks/ directory
            const hooksDir = join(homedir(), ".claude", "hooks");
            const directoryHooks = [];
            try {
                const entries = await readdir(hooksDir);
                for (const entry of entries) {
                    if (!entry.endsWith(".json"))
                        continue;
                    try {
                        const content = await readFile(join(hooksDir, entry), "utf-8");
                        const parsed = JSON.parse(content);
                        directoryHooks.push({ filename: entry, hooks: parsed });
                    }
                    catch (fileErr) {
                        logger.warn({ file: entry, error: String(fileErr) }, "Skipping malformed hook file");
                    }
                }
            }
            catch (dirErr) {
                // Directory may not exist — that's fine
                const code = dirErr.code;
                if (code !== "ENOENT") {
                    logger.warn({ error: String(dirErr) }, "Failed to read hooks directory");
                }
            }
            res.json({ hooks, directoryHooks });
        }
        catch {
            res.json({ hooks: {}, directoryHooks: [] });
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
        }
        catch (err) {
            logger.error({ error: String(err) }, "Failed to write hooks");
            res.status(500).json({ error: "Failed to write hooks" });
        }
    });
    // --- Permission Rules (settings.json permissions) ---
    /** Validate that a permission rule matches ToolName(pattern) or ToolName format */
    function isValidPermissionRule(rule) {
        return /^[A-Za-z_][A-Za-z0-9_]*(\(.*\))?$/.test(rule);
    }
    // Get permissions from ~/.claude/settings.json
    router.get("/settings/permissions", async (_req, res) => {
        try {
            const settings = await readSettingsJson();
            const perms = (settings.permissions ?? {});
            res.json({
                allow: Array.isArray(perms.allow) ? perms.allow : [],
                deny: Array.isArray(perms.deny) ? perms.deny : [],
                ask: Array.isArray(perms.ask) ? perms.ask : [],
            });
        }
        catch {
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
        }
        catch (err) {
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
        }
        catch {
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
                existing[key] = body[key];
            }
            await writeSettingsJson(existing);
            res.json({ success: true });
        }
        catch (err) {
            logger.error({ error: String(err) }, "Failed to write settings");
            res.status(500).json({ error: "Failed to write settings" });
        }
    });
    // --- Auth Management (P3-09) ---
    router.get("/auth/status", (_req, res) => {
        try {
            const result = spawnSync("claude", ["auth", "status"], { timeout: 5000 });
            const stdout = result.stdout?.toString() || "";
            const stderr = result.stderr?.toString() || "";
            res.json({ authenticated: result.status === 0, message: stdout || stderr });
        }
        catch {
            res.json({ authenticated: false, message: "Unable to check auth status" });
        }
    });
    router.post("/auth/login", (_req, res) => {
        try {
            const result = spawnSync("claude", ["auth", "login", "--no-open"], { timeout: 10000 });
            const stdout = result.stdout?.toString() || "";
            // Try to extract auth URL from output
            const urlMatch = stdout.match(/https?:\/\/\S+/);
            if (urlMatch) {
                res.json({ authUrl: urlMatch[0] });
            }
            else {
                res.json({ message: stdout || "Login initiated. Check terminal." });
            }
        }
        catch {
            res.status(500).json({ error: "Failed to initiate login" });
        }
    });
    router.post("/auth/logout", (_req, res) => {
        try {
            const result = spawnSync("claude", ["auth", "logout"], { timeout: 5000 });
            const stdout = result.stdout?.toString() || "";
            res.json({ success: result.status === 0, message: stdout || "Logged out" });
        }
        catch {
            res.status(500).json({ error: "Failed to log out" });
        }
    });
    // --- Output Styles (P3-02) ---
    router.get("/output-styles", (_req, res) => {
        try {
            const dirs = [
                join(homedir(), ".claude", "output-styles"),
                join(process.cwd(), ".claude", "output-styles"),
            ];
            const styles = [];
            const seen = new Set();
            for (const dir of dirs) {
                if (!existsSync(dir))
                    continue;
                for (const file of readdirSync(dir)) {
                    if (seen.has(file))
                        continue;
                    seen.add(file);
                    const filePath = join(dir, file);
                    let description;
                    try {
                        const content = readFileSync(filePath, "utf-8");
                        const firstLine = content.split("\n")[0]?.trim();
                        if (firstLine?.startsWith("#") || firstLine?.startsWith("//")) {
                            description = firstLine.replace(/^[#/]+\s*/, "");
                        }
                    }
                    catch { /* ignore */ }
                    styles.push({ name: file.replace(/\.[^.]+$/, ""), description, path: filePath });
                }
            }
            res.json({ styles });
        }
        catch {
            res.json({ styles: [] });
        }
    });
    // --- Agent Definitions (P3-07) ---
    router.get("/agents/definitions", (_req, res) => {
        try {
            const agentDir = join(process.cwd(), ".claude", "agents");
            if (!existsSync(agentDir)) {
                return res.json({ agents: [] });
            }
            const agents = [];
            for (const entry of readdirSync(agentDir, { withFileTypes: true })) {
                if (!entry.isDirectory())
                    continue;
                const claudeMdPath = join(agentDir, entry.name, "CLAUDE.md");
                let description;
                if (existsSync(claudeMdPath)) {
                    try {
                        const content = readFileSync(claudeMdPath, "utf-8");
                        const firstPara = content.split("\n\n")[0]?.replace(/^#.*\n?/, "").trim();
                        description = firstPara?.slice(0, 200);
                    }
                    catch { /* ignore */ }
                }
                agents.push({ name: entry.name, description, path: join(agentDir, entry.name) });
            }
            res.json({ agents });
        }
        catch {
            res.json({ agents: [] });
        }
    });
    return router;
}
//# sourceMappingURL=settings-routes.js.map