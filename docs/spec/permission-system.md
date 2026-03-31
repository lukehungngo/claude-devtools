# Permission System

Security layer between Claude and tool execution. 3 levels of control.

---

## Level 1: Permission Modes (Session-Wide)

| Mode | Behavior | SDK Value |
|------|----------|-----------|
| `default` | Prompt for everything except Read/Glob/Grep | `"default"` |
| `acceptEdits` | Auto-allow Read, Write, Edit; prompt for Bash, Agent | `"acceptEdits"` |
| `plan` | Auto-allow Read, Glob, Grep; auto-deny Edit, Write, Bash | `"plan"` |
| `auto` | Autonomous with safety classifier (Team+ required) | `"auto"` |
| `dontAsk` | Only pre-approved tools; deny everything else | `"dontAsk"` |
| `bypassPermissions` | Allow everything (requires explicit flag) | `"bypassPermissions"` |

**Our status:** Implement 3 modes (default, acceptEdits, plan) with manual auto-resolve logic in `shouldAutoResolve()`. Don't support auto, dontAsk, bypassPermissions.

**SDK approach:** Pass `permissionMode` to `query()` options. Or use `query.setPermissionMode()` mid-session. We don't use either — we manually check mode in our canUseTool callback.

---

## Level 2: Permission Rules (Persistent)

Stored in `settings.json`:

```json
{
  "permissions": {
    "allow": ["Read(*)", "Glob(*)", "Grep(*)"],
    "deny": ["Bash(rm -rf *)"],
    "ask": ["Write(*)"]
  }
}
```

**Rule syntax:** `ToolName(pattern)`

```
Read(*)                    # Allow reading any file
Bash(npm test)            # Allow specific command
Edit(/src/**)             # Allow editing in src/
mcp__github__*            # Allow all GitHub MCP tools
Write(/tmp/*)             # Allow writing to tmp/
```

**Our status:** Not implemented. No UI for viewing or editing permission rules. No integration with settings.json permission rules.

---

## Level 3: canUseTool Callback (Per-Decision)

Called when the SDK needs a permission decision:

```typescript
canUseTool: async (toolName, input, options) => {
  // options includes rich UI data we currently ignore:
  // - title: "Read file /src/index.ts"
  // - displayName: "Read"
  // - description: "Read the contents of a file"
  // - suggestions: [{ tool: "Read", permission: "allow", rule: "Read(*)" }]
  // - blockedPath: "/src/index.ts"
  // - decisionReason: "No matching rule"
  // - toolUseID: "toolu_abc123"
  // - agentID: "agent-xyz" (if in subagent)

  return { behavior: "allow" };
  // or
  return { behavior: "deny", message: "User denied" };
  // or (with persistent rule creation)
  return {
    behavior: "allow",
    updatedPermissions: [{ tool: "Read", permission: "allow", rule: "Read(*)" }]
  };
}
```

### What We Use vs What Exists

| Field | Available | We Use? | Impact |
|-------|-----------|---------|--------|
| `toolName` | Yes | **Yes** | Core permission logic |
| `input` | Yes | **Yes** | Tool-specific previews |
| `title` | Yes | No | Would improve permission prompt text |
| `displayName` | Yes | No | Better button labels |
| `description` | Yes | No | Better permission context |
| `suggestions` | Yes | No | Could auto-create permission rules |
| `blockedPath` | Yes | No | Shows why permission was triggered |
| `decisionReason` | Yes | No | Explains the decision context |
| `toolUseID` | Yes | No | Deduplication |
| `agentID` | Yes | No | Shows which agent requested |

### Our Implementation

```
SDK canUseTool()
  → SessionManager.handlePermission()
    → Check shouldAutoResolve() (manual mode check)
    → If auto: return { behavior: "allow" | "deny" }
    → Check sessionAllowances (allow-for-session)
    → If allowed: return { behavior: "allow" }
    → Create Promise
    → Broadcast permission-request via WebSocket
    → Dashboard shows PermissionBlock
    → User clicks Allow/Deny
    → POST /api/permissions/:id/decide
    → Promise resolves
    → SDK continues
```

**Timeout:** 10 minutes. After timeout, permission is auto-denied.

---

## Session Allowances (Allow for Session)

When user clicks "Allow for Session":
1. Tool name added to `sessionAllowances` Map (in `permission-handler.ts`)
2. Future canUseTool calls for same tool + session are auto-approved
3. Lost on server restart (in-memory only)

**Gap:** Should use `updatedPermissions` in the PermissionResult to create persistent rules via the SDK.

---

## Permission Flow Diagram

```
    Claude wants to use "Edit" on /src/auth.ts
                    │
                    ▼
           ┌───────────────┐
           │ Permission     │
           │ Mode Check     │
           └───────┬───────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
    acceptEdits  default    plan
    (auto-allow) (prompt)  (auto-deny)
        │          │          │
        ▼          ▼          ▼
     ALLOW    ┌─────────┐   DENY
              │ Session  │
              │Allowance?│
              └────┬────┘
                   │
              ┌────┼────┐
              ▼         ▼
           Allowed   Not found
           ALLOW     │
                     ▼
              ┌─────────────┐
              │ Permission   │
              │ Rules Check  │  ← NOT IMPLEMENTED
              └──────┬──────┘
                     │
                     ▼
              ┌─────────────┐
              │ Prompt User  │
              │ via WebSocket│
              └──────┬──────┘
                     │
              ┌──────┼──────┐
              ▼             ▼
           Allow          Deny
              │
        ┌─────┼──────┐
        ▼            ▼
    Allow Once   Allow for
                 Session
```
