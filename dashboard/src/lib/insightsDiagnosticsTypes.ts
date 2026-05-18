export type EfficiencyRange = "24h" | "7d" | "30d" | "90d";

export type SignalStatus = "warn" | "praise";
export type SignalSeverity = "high" | "medium" | "low" | "positive";
export type SignalConfidence = "high" | "medium" | "low";
export type QuickWinCategory = "quality" | "cost" | "latency";
export type DiagnosticCategory =
  | "quality"
  | "cost"
  | "latency"
  | "workflow"
  | "model"
  | "context";

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
  pattern: string;
  status: SignalStatus;
  category: QuickWinCategory;
  severity: SignalSeverity;
  confidence: SignalConfidence;
  detected?: boolean;
  impact?: number;
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
  rank: number;
  sourcePattern: string;
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
  evidenceSessionIds: string[];
  whyFlagged: string[];
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

export interface Hint {
  id: string;
  category: string;
  icon: string;
  punchline: string;
  impact: number;
  trend: "better" | "worse" | "stable" | "new";
  drilldownAvailable: boolean;
}

export interface EfficiencyDiagnosticsResponse {
  range: string;
  period: PeriodSummary;
  diagnostics: DiagnosticResult[];
  quickWins: QuickWinResult[];
  hints?: Hint[];
  sessionCount: number;
  totalCost: number;
}
