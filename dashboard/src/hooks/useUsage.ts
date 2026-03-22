import { useState, useEffect } from "react";
import type { UsageInfo } from "../lib/types";

export function useUsage() {
  const [usage, setUsage] = useState<UsageInfo | null>(null);

  const fetchUsage = () => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((data) => setUsage(data.usage || null))
      .catch(() => {});
  };

  useEffect(() => {
    fetchUsage();
    const interval = setInterval(fetchUsage, 5 * 60_000); // refresh every 5 min
    return () => clearInterval(interval);
  }, []);

  return { usage };
}
