import type { SessionInfo, SessionEvent } from "../../types.js";

export interface DetectorContext {
  sessions: SessionInfo[];
  priorSessions: SessionInfo[];
  range: "24h" | "7d" | "30d" | "90d";
  nowMs: number;
}

export interface SessionWithEvents {
  info: SessionInfo;
  mainEvents: SessionEvent[];
}

export type HintCategory =
  | "wasted_retries"
  | "blind_edits"
  | "session_fragmentation"
  | "cost_waste"
  | "model_overuse"
  | "cache_misses"
  | "improving_trend";

export interface PatternResult {
  category: HintCategory;
  detected: boolean;
  impact: number;
  punchline: string;
  icon: string;
  evidence: HintEvidenceData;
}

export interface HintEvidenceData {
  sessions: EvidenceSession[];
  recommendation: string;
  stats: Record<string, number | string>;
}

export interface EvidenceSession {
  id: string;
  detail: string;
  cost: number;
  wastedCost?: number;
}

export interface Hint {
  id: string;
  category: HintCategory;
  icon: string;
  punchline: string;
  impact: number;
  trend: "better" | "worse" | "stable" | "new";
  drilldownAvailable: boolean;
}

export interface HintsResponse {
  range: string;
  hints: Hint[];
  sessionCount: number;
  totalCost: number;
}

export interface EvidenceResponse {
  hintId: string;
  category: HintCategory;
  evidence: HintEvidenceData;
}
