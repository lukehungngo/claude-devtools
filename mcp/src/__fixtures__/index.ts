import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** Root dir matching the layout discoverSessions expects: <root>/<projectHash>/<session>.jsonl */
export const FIXTURE_DIR = path.join(dir, "sessions");

export type FixtureName = "tiny" | "medium" | "long" | "corrupt" | "unfinished";

export function fixturePath(name: FixtureName): string {
  return path.join(FIXTURE_DIR, "test-project", `${name}.jsonl`);
}
