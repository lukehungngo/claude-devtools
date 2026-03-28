import { createContext, useContext } from "react";
import type { RepoGroup, PermissionRequest, UsageInfo, CostSummary, SessionEvent, SessionMetrics } from "../lib/types";
import type { ReactNode } from "react";

export interface SessionWsHandlers {
  onNewEvents: (sessionId: string, filePath: string, events: SessionEvent[]) => void;
}

export interface QuestionItem {
  questionId: string;
  questionText: string;
  status: "pending" | "answered";
  answer?: string;
  timestamp?: string;
}

export interface LayoutContextValue {
  repos: RepoGroup[];
  reposLoading: boolean;
  refreshRepos: () => void;
  permissions: PermissionRequest[];
  decidePermission: (id: string, decision: "approved" | "denied") => Promise<void>;
  usage: UsageInfo | null;
  costs: CostSummary | null;
  isLive: boolean;
  registerSessionHandlers: (handlers: SessionWsHandlers | null) => void;

  // Session-scoped state bridged through layout
  currentMetrics: SessionMetrics | null;
  setCurrentMetrics: (m: SessionMetrics | null) => void;
  toolFilter: string | null;
  setToolFilter: (f: string | null | ((prev: string | null) => string | null)) => void;
  requestedRightTab: "graph" | "log" | undefined;
  setRequestedRightTab: (tab: "graph" | "log" | undefined) => void;
  rightPanelContent: ReactNode;
  setRightPanelContent: (content: ReactNode) => void;
  questions: QuestionItem[];
  submitAnswer: (questionId: string, answer: string) => Promise<void>;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  selected: { projectHash: string; sessionId: string } | null;
  setSelected: (s: { projectHash: string; sessionId: string } | null) => void;
}

export const LayoutContext = createContext<LayoutContextValue | null>(null);

export function useLayoutContext(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayoutContext must be used within LayoutContext.Provider");
  return ctx;
}
