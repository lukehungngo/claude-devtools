import { useState, useEffect } from "react";
import type { CostSummary } from "../lib/types";

export function useCosts() {
  const [costs, setCosts] = useState<CostSummary | null>(null);

  useEffect(() => {
    const fetchCosts = async () => {
      try {
        const res = await fetch("/api/costs");
        if (res.ok) {
          const data = await res.json();
          setCosts(data.costs || null);
        }
      } catch {
        /* silent — costs endpoint may be unavailable */
      }
    };
    fetchCosts();
    const interval = setInterval(fetchCosts, 300_000);
    return () => clearInterval(interval);
  }, []);

  return { costs };
}
