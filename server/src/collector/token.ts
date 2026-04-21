import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

function tokenPath(): string {
  return process.env.DEVTOOLS_TOKEN_PATH || join(homedir(), ".claude", "devtools.token");
}

export function generateToken(): string {
  return `dt_${randomBytes(16).toString("hex")}`;
}

export function loadOrCreate(): string {
  const path = tokenPath();
  if (existsSync(path)) {
    return readFileSync(path, "utf-8").trim();
  }
  const token = generateToken();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, token, { mode: 0o600 });
  return token;
}
