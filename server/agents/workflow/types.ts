/**
 * Chief of Staff Workflow Engine Types (Day 5C.5)
 *
 * Implements the end-to-end Chief of Staff execution loop:
 * AGENTS THINK -> REVIEWER REVIEWS -> USER CONFIRMS -> TOOL MANAGER EXECUTES -> RECOVERY PROPOSES CORRECTION.
 */

import { AgentAction, AgentResult, RiskLevel } from '../types';
import { ActionReviewResult } from '../agents/ReviewerAgent';
import { ToolExecutionResult } from '../tools/types';

export type WorkflowState =
  | 'REQUESTED'
  | 'CONTEXT_BUILDING'
  | 'INTENT_RESOLVED'
  | 'MEMORY_RETRIEVED'
  | 'PRIORITIZED'
  | 'PLANNED'
  | 'SCHEDULED'
  | 'PROPOSED'
  | 'REVIEWING'
  | 'AWAITING_CONFIRMATION'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'FAILED'
  | 'RECOVERING'
  | 'RECOVERY_PROPOSED'
  | 'COMPLETED'
  | 'ABORTED';

export type WorkflowIntent =
  | 'DIAGNOSTIC'
  | 'MEMORY_RECALL'
  | 'PRIORITIZATION'
  | 'PLANNING'
  | 'SCHEDULING'
  | 'EXECUTION'
  | 'RECOVERY';

export type WorkflowComponent =
  | 'orchestrator'
  | 'memory'
  | 'prioritizer'
  | 'planner'
  | 'scheduler'
  | 'reviewer'
  | 'toolManager'
  | 'recovery';

export interface WorkflowTrace {
  workflowId: string;
  timestamp: string; // ISO 8601
  state: WorkflowState;
  component: WorkflowComponent;
  durationMs: number;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  message?: string;
}

/**
 * Server-side cryptographic/structural confirmation binding.
 * Binds the exact reviewed action, user identity, parameter hash, and TTL.
 * Modifying parameters after review strictly invalidates this binding.
 */
export interface ConfirmationBinding {
  bindingId: string;
  workflowId: string;
  actionId: string;
  userId: string;
  toolId: string;
  actionType: string;
  parameterHash: string; // SHA-256 of canonical JSON serialized parameters
  reviewedParameters: Record<string, unknown>; // Snapshot of reviewed parameters
  expiresAt: number; // Unix timestamp in ms
  reviewedAt: number; // Unix timestamp in ms
  confirmed: boolean;
  confirmedAt?: number;
  reviewApproved: boolean;
  reviewerRiskLevel: RiskLevel | 'critical';
  reasons: string[];
}

export interface ChiefOfStaffWorkflowContext {
  workflowId: string;
  executionId: string;
  userId: string;
  userRequest: string;
  intent: WorkflowIntent;
  state: WorkflowState;
  agentResults: AgentResult[];
  actions: AgentAction[];
  activeAction?: AgentAction | null;
  reviewResult?: ActionReviewResult | null;
  confirmationBinding?: ConfirmationBinding | null;
  executionResult?: ToolExecutionResult | null;
  recoveryContext?: Record<string, unknown> | null;
  recoveryCycleCount: number; // Enforced upper bound: <= MAX_WORKFLOW_RECOVERY_CYCLES (2)
  traces: WorkflowTrace[];
  createdAt: number;
  updatedAt: number;
  abortReason?: string;
  summary: string;
}

export interface WorkflowStartRequest {
  userRequest: string;
  preferredIntent?: WorkflowIntent;
  targetDate?: string;
  taskId?: string;
  parameters?: Record<string, unknown>;
}

export interface WorkflowConfirmRequest {
  actionId: string;
  bindingId?: string;
  parameters?: Record<string, unknown>;
}

export interface WorkflowEditRequest {
  actionId: string;
  updatedParameters: Record<string, unknown>;
}

export interface WorkflowRejectRequest {
  actionId?: string;
  reason?: string;
}

// Bounded constants
export const CONFIRMATION_TTL_MS = 5 * 60 * 1000; // 5 minutes (300,000 ms)
export const MAX_WORKFLOW_RECOVERY_CYCLES = 2; // Hard upper bound
export const MAX_WORKFLOW_DURATION_MS = 60 * 1000; // 60 seconds
export const MAX_ACTIONS_PER_WORKFLOW = 10;
