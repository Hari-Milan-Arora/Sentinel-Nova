/**
 * Research-Grade Decision Telemetry & Explainability Models for Sentinel Nova (Day 7)
 *
 * Provides structured, auditable decision metadata without exposing chain-of-thought,
 * raw LLM prompts, model responses, OAuth tokens, or user credentials.
 */

export type DecisionType =
  | 'PRIORITIZATION'
  | 'PLANNING'
  | 'SCHEDULING'
  | 'REVIEW'
  | 'CONFIRMATION'
  | 'EXECUTION'
  | 'RECOVERY'
  | 'REPLANNING';

export type DecisionOutcome =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EDITED'
  | 'EXPIRED'
  | 'STALE'
  | 'EXECUTED'
  | 'EXECUTION_FAILED'
  | 'RECOVERED'
  | 'ABORTED';

export type RejectionCategory =
  | 'SLEEP_CONFLICT'
  | 'CALENDAR_CONFLICT'
  | 'FIXED_COMMITMENT'
  | 'INSUFFICIENT_DURATION'
  | 'DEPENDENCY_NOT_READY'
  | 'DEADLINE_INFEASIBLE'
  | 'OUTSIDE_PLANNING_HORIZON'
  | 'INVALID_TASK_STATE'
  | 'CAPACITY_EXCEEDED'
  | 'RISK_THRESHOLD_EXCEEDED'
  | 'UNAUTHORIZED_TARGET'
  | 'STALE_STATE'
  | 'EXPIRED_CONFIRMATION'
  | 'PARAMETER_TAMPERING';

export interface StructuredExplanation {
  whyThis: string[];
  whyNow: string[];
  whyThisTime?: string[];
  whyNotAlternative?: string[];
}

export interface CandidateSummary {
  id: string;
  rank: number;
  title?: string;
  score?: number;
  fit?: 'exact' | 'comfortable' | 'tight';
  window?: {
    start: string;
    end: string;
    durationMinutes: number;
  };
  rejected?: boolean;
  rejectionCategory?: RejectionCategory;
  rejectionReason?: string;
}

export interface HardConstraintsAudit {
  sleepSatisfied: boolean;
  calendarConflictFree: boolean;
  fixedCommitmentFree: boolean;
  dependencyReady: boolean;
  capacityFeasible: boolean;
  withinWorkingHours?: boolean;
  chronologyValid?: boolean;
  parameterHashVerified?: boolean;
}

export interface DecisionRecord {
  decisionId: string;
  userId: string;
  workflowId: string;
  timestamp: string; // ISO 8601
  decisionType: DecisionType;
  agentId: string;
  agentVersion: string;
  strategy: string;
  inputSummary: {
    taskCount?: number;
    goalCount?: number;
    projectCount?: number;
    targetDate?: string;
    taskId?: string;
    actionType?: string;
  };
  factorScores: Record<string, number>;
  hardConstraints: HardConstraintsAudit;
  candidateCount: number;
  candidateSummaries: CandidateSummary[];
  selectedCandidate: CandidateSummary | null;
  alternatives: CandidateSummary[];
  rejectedCandidates?: Array<{
    candidateId: string;
    category: RejectionCategory;
    reason: string;
  }>;
  confidence: number; // Strictly bounded [0.0, 1.0]
  confidenceLevel: 'High' | 'Medium' | 'Low';
  explanation: StructuredExplanation;
  outcome: DecisionOutcome;
  outcomeDetails?: {
    confirmedAt?: number;
    executedAt?: number;
    rejectedReason?: string;
    editCategory?: string;
    toolExecutionSuccess?: boolean;
    recoveryAttempts?: number;
  };
  latencyMs: number;
  recoveryCycle?: number;
  createdAt: number;
}

export interface ResearchMetricsSummary {
  periodStart: string;
  periodEnd: string;
  totalDecisions: number;
  totalRecommendations: number;
  recommendationAcceptanceRate: number; // accepted / total actionable
  recommendationRejectionRate: number; // rejected / total actionable
  proposalEditRate: number; // edited / total actionable
  schedulingFeasibilityRate: number; // feasible / requested
  hardConstraintViolationRate: number; // expected 0.0
  staleProposalPreventionRate: number; // stale blocked / stale detected
  confirmationReplayPreventionRate: number; // replays blocked / replay attempts
  recoverySuccessRate: number; // recovered / recovery attempts
  averageDecisionLatencyMs: number;
  p95DecisionLatencyMs: number;
  averageCandidateCount: number;
  replanningRate: number;
  executionSuccessRate: number;
  userEditToAcceptRate: number;
  strategyDistribution: Record<string, number>;
  agentActivityDistribution: Record<string, number>;
  decisionTypeDistribution: Record<DecisionType, number>;
}

export interface BaselineComparisonResult {
  mode: 'BASELINE_A' | 'BASELINE_B' | 'BASELINE_C' | 'BASELINE_D' | 'SENTINEL_NOVA';
  modeName: string;
  taskOrdering: Array<{ taskId: string; title: string; rank: number; score: number }>;
  feasibleSchedulesCount: number;
  hardConstraintViolations: number;
  averageConfidence: number;
  decisionLatencyMs: number;
}

export interface DecisionReplayResult {
  originalDecisionId: string;
  reproducedSuccessfully: boolean;
  matchScores: boolean;
  matchSelectedCandidate: boolean;
  matchStrategy: boolean;
  originalCandidateId?: string;
  replayedCandidateId?: string;
  scoreDifferenceDelta: number;
  latencyMs: number;
}
