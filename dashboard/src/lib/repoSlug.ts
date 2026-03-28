import type { RepoGroup } from "./types";

/**
 * Extract repo slug from a cwd path.
 * "/Users/soh/working/ai/claude-devtools" -> "claude-devtools"
 */
export function makeRepoSlug(cwd: string): string {
  const trimmed = cwd.replace(/\/+$/, "");
  const parts = trimmed.split("/").filter(Boolean);
  return parts[parts.length - 1] || "root";
}

/**
 * Build a Map<slug, projectHash> from repos.
 * If two repos have the same basename, disambiguate by appending a short hash suffix.
 */
export function buildSlugMap(repos: RepoGroup[]): Map<string, string> {
  // First pass: group by basename
  const byBasename = new Map<string, Array<{ cwd: string; projectHash: string }>>();

  for (const repo of repos) {
    if (repo.sessions.length === 0) continue;
    const projectHash = repo.sessions[0].projectHash;
    const basename = makeRepoSlug(repo.cwd);
    const list = byBasename.get(basename) || [];
    list.push({ cwd: repo.cwd, projectHash });
    byBasename.set(basename, list);
  }

  // Second pass: build slug map, disambiguating collisions
  const slugMap = new Map<string, string>();

  for (const [basename, entries] of byBasename) {
    if (entries.length === 1) {
      slugMap.set(basename, entries[0].projectHash);
    } else {
      // Collision: append short hash of projectHash for uniqueness
      for (const entry of entries) {
        const suffix = simpleHash(entry.projectHash).slice(0, 6);
        slugMap.set(`${basename}_${suffix}`, entry.projectHash);
      }
    }
  }

  return slugMap;
}

/**
 * Resolve a URL slug back to a projectHash using the slug map.
 */
export function resolveSlugToProjectHash(
  slug: string,
  slugMap: Map<string, string>,
): string | null {
  return slugMap.get(slug) ?? null;
}

/**
 * Build the inverse map: projectHash -> slug.
 */
export function buildProjectHashToSlugMap(
  slugMap: Map<string, string>,
): Map<string, string> {
  const inverse = new Map<string, string>();
  for (const [slug, hash] of slugMap) {
    inverse.set(hash, slug);
  }
  return inverse;
}

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
