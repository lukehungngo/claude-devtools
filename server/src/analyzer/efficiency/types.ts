import type { SessionInfo, SessionEvent } from "../../types.js";

export type EfficiencyRange = "24h" | "7d" | "30d" | "90d";
export type QuickWinCategory = "quality" | "cost" | "latency";
export type DiagnosticCategory = "quality" | "cost" | "latency" | "workflow" | "model" | "context";
export type SignalStatus = "warn" | "praise";
export type SignalSeverity = "high" | "medium" | "low" | "positive";
export type SignalConfidence = "high" | "medium" | "low";
export type DiagnosticKind = "proven" | "observation";

export type QuickWinPattern =
  | "edit_rejection_rate"
  | "tool_failure_storm"
  | "cache_hit_ratio"
  | "cost_per_loc_outlier"
  | "long_turn_durations"
  | "high_context_duration_tax";

export interface DetectorContext {
  sessions: SessionInfo[];
  priorSessions: SessionInfo[];
  range: EfficiencyRange;
  repo: string;
  nowMs: number;
}

export interface SessionWithEvents {
  info: SessionInfo;
  mainEvents: SessionEvent[];
}

export interface PeriodSummary {
  range: EfficiencyRange;
  spend: number;
  tokens: number;
  sessions: number;
  turns: number;
}

export interface EvidenceSession {
  id: string;
  detail: string;
  cost: number;
  wastedCost?: number;
}

export interface QuickWinEvidence {
  sessions: EvidenceSession[];
  recommendation: string;
  stats: Record<string, number | string>;
  chips: string[];
}

export interface QuickWinResult {
  id: string;
  pattern: QuickWinPattern;
  status: SignalStatus;
  category: QuickWinCategory;
  severity: SignalSeverity;
  confidence: SignalConfidence;
  detected: boolean;
  impact: number;
  title: string;
  punchline: string;
  impactLabel: string;
  impactValue: string;
  recommendation: string;
  rule: string;
  icon: string;
  evidence: QuickWinEvidence;
}

export interface DiagnosticResult {
  id: string;
  kind: DiagnosticKind;
  rank: number;
  sourcePattern: QuickWinPattern;
  category: DiagnosticCategory;
  severity: SignalSeverity;
  confidence: SignalConfidence;
  title: string;
  summary: string;
  impactLabel: string;
  impactValue: string;
  impactDetail: string;
  changeThisWeek: string;
  evidenceChips: string[];
  evidenceSessions?: EvidenceSession[];
  evidenceSessionIds: string[];
  whyFlagged: string[];
  aiGeneratedFields: string[];
  tellMeMore: {
    whatHappened: string;
    whyItMatters: string;
    recommendedChanges: Array<{
      priority: number;
      change: string;
      expectedEffect: string;
    }>;
  };
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

export interface Hint {
  id: string;
  category: QuickWinPattern;
  icon: string;
  punchline: string;
  impact: number;
  trend: "better" | "worse" | "stable" | "new";
  drilldownAvailable: boolean;
}

export interface HintsResponse {
  range: EfficiencyRange;
  period: PeriodSummary;
  diagnostics: DiagnosticResult[];
  quickWins: QuickWinResult[];
  hints: Hint[];
  sessionCount: number;
  totalCost: number;
}

export interface EvidenceResponse {
  hintId: string;
  category: QuickWinPattern;
  evidence: QuickWinEvidence;
}
