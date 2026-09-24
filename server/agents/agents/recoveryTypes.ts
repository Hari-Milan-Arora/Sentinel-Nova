/**
 * Recovery Agent Types for Sentinel Nova (Day 5C.3)
 *
 * Self-Correction Layer:
 * Defines failure categories, recovery strategies, execution context,
 * bounded retry policies, strategy deliberation scores, and recovery proposals.
 *
 * SAFETY INVARIANT:
 * RecoveryAgent produces action PROPOSALS ONLY.
 * ZERO autonomous retry. ZERO direct ToolManager execution. ZERO store mutation.
 */

import { AgentAction, RiskLevel } from '../types';

export type FailureCategory =
  | 'VALIDATION_FAILURE'
  | 'AUTHORIZATION_FAILURE'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_CONFLICT'
  | 'TRANSIENT_FAILURE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'DEPENDENCY_FAILURE'
  | 'UNKNOWN_FAILURE';

export type RecoveryStrategyType =
  | 'retry_same_action'
  | 'adjust_parameters'
  | 'find_alternative'
  | 'replan'
  | 'ask_user'
  | 'abort';

export type RetryRisk = 'low' | 'medium' | 'high';

export type SafetyLevel = 'safe' | 'guarded' | 'high_risk' | 'critical';

export const MAX_RECOVERY_ATTEMPTS = 2;
export const MAX_AUTOMATIC_RETRY_ATTEMPTS = 0; // Strictly zero autonomous retries
export const MAX_TOTAL_RECOVERY_ACTIONS = 3;
export const MAX_ATTEMPT_HISTORY = 5;

export interface RecoveryAttemptRecord {
  attemptNumber: number;
  toolId?: string;
  status: 'failed' | 'timeout';
  failureCode: string;
  durationMs?: number;
  timestamp: string;
}

export interface RecoveryContext {
  executionId: string;
  actionId?: string;
  toolId?: string;
  actionType?: string;
  sourceAgentId?: string;
  failureCode: string;
  failureMessage: string;
  failedAt: string;
  attemptNumber: number;
  previousAttempts?: RecoveryAttemptRecord[];
  actionDescription?: string;
  actionParametersSafe?: Record<string, unknown>;
  resourceContextSafe?: Record<string, unknown>;
  userRequest?: string;
}

export interface StrategyScoreBreakdown {
  recoverability: number; // 0.0 - 1.0
  safety: number; // 0.0 - 1.0
  retryRiskScore: number; // 0.0 - 1.0 (1.0 = lowest risk)
  successLikelihood: number; // 0.0 - 1.0
  reversibility: number; // 0.0 - 1.0
  lowUserDisruption: number; // 0.0 - 1.0
  attemptBudget: number; // 0.0 - 1.0
  totalScore: number; // 0.0 - 1.0
}

export interface RecoveryStrategyCandidate {
  strategy: RecoveryStrategyType;
  score: number; // Normalized 0.0 - 1.0
  scoreBreakdown: StrategyScoreBreakdown;
  rationale: string;
  isViable: boolean;
  actionProposal?: AgentAction;
  alternativeDescription?: string;
}

export interface RecoveryDecision {
  failureCategory: FailureCategory;
  recoverable: boolean;
  recommendedRecovery: RecoveryStrategyType;
  confidence: number; // Normalized 0.0 - 1.0
  safetyLevel: SafetyLevel;
  retryRisk: RetryRisk;
  isRetrySafe: boolean;
  requiresUserInput: boolean;
  fingerprint: string;
  repeatedFailureCount: number;
  loopDetected: boolean;
  rationale: string;
  strategies: RecoveryStrategyCandidate[];
  alternatives: string[];
  proposedActions: AgentAction[];
  warnings: string[];
}

export interface RecoveryAgentOutput {
  executionId: string;
  failureCategory: FailureCategory;
  recoverable: boolean;
  recommendedRecovery: RecoveryStrategyType;
  confidence: number;
  requiresUserInput: boolean;
  rationale: string;
  fingerprint: string;
  decision: RecoveryDecision;
  proposedActions: AgentAction[];
  reasoningSource: 'deterministic' | 'gemini_enhanced' | 'deterministic_fallback';
  summary: string;
  warnings: string[];
}
