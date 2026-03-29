/** Permission modes matching the SDK PermissionMode type.
 *  'bypassPermissions' requires allowDangerouslySkipPermissions on the server.
 *  'dontAsk' denies any tool not pre-approved. */
export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";
