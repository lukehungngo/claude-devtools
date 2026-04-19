import { useState, useEffect, useCallback } from "react";
import type { RepoGroup } from "../lib/types";

export function useRepos() {
  const [repos, setRepos] = useState<RepoGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/repos")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setRepos(data.repos || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const refresh = useCallback(() => {
    fetch("/api/repos")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setRepos(data.repos || []))
      .catch(() => {});
  }, []);

  return { repos, loading, refresh };
}
