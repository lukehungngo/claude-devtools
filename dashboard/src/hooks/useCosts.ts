import { useState, useEffect } from "react";
import type { CostSummary } from "../lib/types";

export function useCosts() {
  const [costs, setCosts] = useState<CostSummary | null>(null);

  useEffect(() => {
    fetch("/api/costs")
      .then((r) => r.json())
      .then((data) => setCosts(data.costs || null))
      .catch(() => {});
  }, []);

  return { costs };
}
