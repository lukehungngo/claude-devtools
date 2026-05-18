import { calculateTokenCost } from "../metrics.js";
import type {
  EvidenceSession,
  QuickWinCategory,
  QuickWinEvidence,
  QuickWinPattern,
  QuickWinResult,
  SessionWithEvents,
  SignalConfidence,
  SignalSeverity,
  SignalStatus,
} from "./types.js";

export function asSessionArray(sessions: SessionWithEvents[] | SessionWithEvents): SessionWithEvents[] {
  return Array.isArray(sessions) ? sessions : [sessions];
}

export function buildQuickWin(args: {
  pattern: QuickWinPattern;
  status?: SignalStatus;
  category: QuickWinCategory;
  severity?: SignalSeverity;
  confidence?: SignalConfidence;
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
}): QuickWinResult {
  return {
    id: args.pattern,
    pattern: args.pattern,
    status: args.status ?? "warn",
    category: args.category,
    severity: args.severity ?? "medium",
    confidence: args.confidence ?? "medium",
    detected: args.detected,
    impact: args.impact,
    title: args.title,
    punchline: args.punchline,
    impactLabel: args.impactLabel,
    impactValue: args.impactValue,
    recommendation: args.recommendation,
    rule: args.rule,
    icon: args.icon,
    evidence: args.evidence,
  };
}

export function emptyEvidence(recommendation: string, stats: Record<string, number | string> = {}): QuickWinEvidence {
  return { sessions: [], recommendation, stats, chips: [] };
}

export function calculateSessionCost(session: SessionWithEvents): number {
  let cost = 0;
  for (const event of session.mainEvents) {
    if (event.type !== "assistant") continue;
    cost += calculateTokenCost(event.message.model, {
      inputTokens: event.message.usage.input_tokens ?? 0,
      outputTokens: event.message.usage.output_tokens ?? 0,
      cacheWriteTokens: event.message.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: event.message.usage.cache_read_input_tokens ?? 0,
    });
  }
  return cost;
}

export function sumSessionCosts(sessions: SessionWithEvents[]): number {
  return sessions.reduce((sum, session) => sum + calculateSessionCost(session), 0);
}

export function evidenceSession(session: SessionWithEvents, detail: string, wastedCost?: number): EvidenceSession {
  const cost = calculateSessionCost(session);
  return wastedCost === undefined
    ? { id: session.info.id, detail, cost }
    : { id: session.info.id, detail, cost, wastedCost };
}

export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function seconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

export function friendlyDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const secondsPart = totalSeconds % 60;
  if (secondsPart === 0) return `${minutes}m`;
  return `${minutes}m ${secondsPart}s`;
}
