import { useState, useEffect } from "react";
import type { RepoGroup } from "../lib/types";

export function useRepos() {
  const [repos, setRepos] = useState<RepoGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/repos")
      .then((r) => r.json())
      .then((data) => {
        setRepos(data.repos || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const refresh = () => {
    fetch("/api/repos")
      .then((r) => r.json())
      .then((data) => setRepos(data.repos || []))
      .catch(() => {});
  };

  return { repos, loading, refresh };
}
