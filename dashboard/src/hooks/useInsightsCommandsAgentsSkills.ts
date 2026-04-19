import { useState, useEffect } from "react";

export type CasTrend = "improving" | "stable" | "regressing";

export interface CommandRowClient {
  name: string;
  count: number;
  share: number;
  daily: number[];
  trend: CasTrend;
  tokensIn: number;
  tokensOut: number;
  avgTokensIn: number;
  avgTokensOut: number;
}

export interface AgentRowClient {
  type: string;
  count: number;
  share: number;
  daily: number[];
  trend: CasTrend;
  tokensIn: number;
  tokensOut: number;
  avgTokensIn: number;
  avgTokensOut: number;
}

export interface SkillRowClient {
  name: string;
  count: number;
  share: number;
  daily: number[];
  trend: CasTrend;
  tokensIn: number;
  tokensOut: number;
  avgTokensIn: number;
  avgTokensOut: number;
}

export interface CommandsAgentsSkillsClient {
  commands: CommandRowClient[];
  agents: AgentRowClient[];
  skills: SkillRowClient[];
}

export interface UseInsightsCommandsAgentsSkillsResult {
  data: CommandsAgentsSkillsClient | null;
  loading: boolean;
  error: string | null;
}

export function useInsightsCommandsAgentsSkills(
  timeRange: string,
  repo: string,
  refreshCount = 0
): UseInsightsCommandsAgentsSkillsResult {
  const [data, setData] = useState<CommandsAgentsSkillsClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/insights/commands-agents-skills?timeRange=${timeRange}&repo=${repo}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<CommandsAgentsSkillsClient>;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load commands/agents/skills"
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [timeRange, repo, refreshCount]);

  return { data, loading, error };
}
