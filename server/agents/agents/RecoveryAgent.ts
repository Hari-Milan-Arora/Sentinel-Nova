/**
 * Recovery Agent for Sentinel Nova (Day 5C.3)
 *
 * "What should Nova do when an approved execution fails, becomes invalid, or cannot safely complete?"
 *
 * Self-Correction & Diagnosis Layer:
 * 1. Analyzes execution failures and classifies them deterministically.
 * 2. Enforces bounded retry budgets (MAX_RECOVERY_ATTEMPTS = 2).
 * 3. Detects repeated failures via failure fingerprints to prevent infinite loops.
 * 4. Produces action PROPOSALS ONLY.
 *
 * SAFETY INVARIANTS:
 * - RecoveryAgent MUST NOT autonomously retry.
 * - RecoveryAgent MUST NOT directly invoke ToolManager or ToolRegistry.
 * - RecoveryAgent MUST NOT mutate tasks, goals, projects, memory, planning profile, or calendar.
 * - All proposed actions require explicit user confirmation (requiresConfirmation: true).
 */

import { BaseAgent } from '../Agent';
import { AgentCapability, AgentContext, AgentResult, AgentAction } from '../types';
import { createErrorResult } from '../AgentResult';
import { RecoveryEngine, recoveryEngine } from './RecoveryEngine';
import { RecoveryReasoningService, recoveryReasoningService } from '../services/RecoveryReasoningService';
import { RecoveryAgentOutput, RecoveryAttemptRecord, RecoveryContext, RecoveryDecision } from './recoveryTypes';

export class RecoveryAgent extends BaseAgent {
  public readonly id = 'agent.recovery';
  public readonly name = 'Recovery Agent';
  public readonly description =
    'Self-correction and failure diagnosis agent for analyzing execution errors, determining recoverability, and generating bounded recovery proposals.';
  public readonly version = '1.0.0';

  public readonly capabilities: AgentCapability[] = [
    'failure_analysis',
    'failure_classification',
    'recovery_planning',
    'retry_analysis',
    'alternative_action',
    'execution_recovery',
    'self_correction',
    'recovery_decision_support',
  ];

  private engine: RecoveryEngine;
  private reasoningService: RecoveryReasoningService;

  constructor(
    customTimeoutMs: number = 8000,
    engine?: RecoveryEngine,
    reasoningService?: RecoveryReasoningService
  ) {
    super(customTimeoutMs);
    this.engine = engine || recoveryEngine;
    this.reasoningService = reasoningService || recoveryReasoningService;
  }

  /**
   * Evaluates if this agent can handle the context.
   * Safety requirement: RecoveryAgent ONLY handles requests where a structured
   * execution failure context is explicitly present. It never hijacks normal workflows.
   */
  public canHandle(context: AgentContext): boolean {
    const params = context.parameters;
    if (!params || typeof params !== 'object') return false;

    // Must have structured failure parameters
    const failureCandidate =
      params.recoveryContext ||
      params.failureContext ||
      params.failure ||
      params.executionFailure;

    if (!failureCandidate || typeof failureCandidate !== 'object') return false;

    const hasFailureCode =
      typeof (failureCandidate as Record<string, unknown>).failureCode === 'string' &&
      Boolean((failureCandidate as Record<string, unknown>).failureCode);

    const hasExecutionId =
      typeof (failureCandidate as Record<string, unknown>).executionId === 'string' &&
      Boolean((failureCandidate as Record<string, unknown>).executionId);

    return hasFailureCode || hasExecutionId;
  }

  /**
   * Internal execution logic.
   * Diagnoses failure, deliberates bounded strategies, and produces proposals only.
   */
  protected async run(context: AgentContext): Promise<AgentResult> {
    const rawFailure =
      context.parameters?.recoveryContext ||
      context.parameters?.failureContext ||
      context.parameters?.failure ||
      context.parameters?.executionFailure;

    if (!rawFailure || typeof rawFailure !== 'object') {
      return createErrorResult({
        agentId: this.id,
        executionId: context.executionId,
        error: {
          code: 'MISSING_FAILURE_CONTEXT',
          message:
            'RecoveryAgent requires a valid structured failure context in parameters (e.g. parameters.recoveryContext).',
        },
        durationMs: 0,
      });
    }

    const raw = rawFailure as Record<string, unknown>;

    // Validate and sanitize incoming RecoveryContext
    const executionId =
      typeof raw.executionId === 'string' && raw.executionId.trim()
        ? raw.executionId.trim()
        : context.executionId;

    const failureCode =
      typeof raw.failureCode === 'string' && raw.failureCode.trim()
        ? raw.failureCode.trim()
        : 'UNKNOWN_FAILURE';

    const failureMessage =
      typeof raw.failureMessage === 'string'
        ? this.engine.sanitizeMessage(raw.failureMessage)
        : 'Unknown execution error';

    const failedAt =
      typeof raw.failedAt === 'string' && raw.failedAt.trim()
        ? raw.failedAt.trim()
        : new Date().toISOString();

    const attemptNumber =
      typeof raw.attemptNumber === 'number' && raw.attemptNumber >= 1
        ? Math.floor(raw.attemptNumber)
        : 1;

    const toolId = typeof raw.toolId === 'string' ? raw.toolId.trim() : undefined;
    const actionId = typeof raw.actionId === 'string' ? raw.actionId.trim() : undefined;
    const actionType = typeof raw.actionType === 'string' ? raw.actionType.trim() : undefined;
    const sourceAgentId = typeof raw.sourceAgentId === 'string' ? raw.sourceAgentId.trim() : undefined;
    const actionDescription =
      typeof raw.actionDescription === 'string'
        ? this.engine.sanitizeMessage(raw.actionDescription)
        : undefined;

    const previousAttempts: RecoveryAttemptRecord[] = Array.isArray(raw.previousAttempts)
      ? (raw.previousAttempts as any[]).map((att) => ({
          attemptNumber: typeof att.attemptNumber === 'number' ? att.attemptNumber : 1,
          toolId: typeof att.toolId === 'string' ? att.toolId : undefined,
          status: (att.status === 'timeout' ? 'timeout' : 'failed') as 'failed' | 'timeout',
          failureCode: typeof att.failureCode === 'string' ? att.failureCode : 'UNKNOWN',
          durationMs: typeof att.durationMs === 'number' ? att.durationMs : undefined,
          timestamp: typeof att.timestamp === 'string' ? att.timestamp : new Date().toISOString(),
        }))
      : [];

    const actionParametersSafe = this.engine.sanitizeParameters(
      raw.actionParametersSafe as Record<string, unknown> | undefined
    );

    const resourceContextSafe = this.engine.sanitizeParameters(
      raw.resourceContextSafe as Record<string, unknown> | undefined
    );

    const recoveryContext: RecoveryContext = {
      executionId,
      actionId,
      toolId,
      actionType,
      sourceAgentId,
      failureCode,
      failureMessage,
      failedAt,
      attemptNumber,
      previousAttempts,
      actionDescription,
      actionParametersSafe,
      resourceContextSafe,
      userRequest: context.userRequest,
    };

    // 1. Run deterministic deliberation engine
    const decision: RecoveryDecision = this.engine.deliberate(recoveryContext, context);

    // 2. Optional Gemini reasoning enhancement
    let finalStrategy = decision.recommendedRecovery;
    let finalConfidence = decision.confidence;
    let finalRationale = decision.rationale;
    let reasoningSource: 'deterministic' | 'gemini_enhanced' | 'deterministic_fallback' =
      'deterministic';
    const warnings: string[] = [...decision.warnings];

    if (!decision.loopDetected) {
      try {
        const enhanced = await this.reasoningService.enhanceDeliberation(decision, attemptNumber);
        if (enhanced.enhanced) {
          finalStrategy = enhanced.recommendedStrategy;
          finalConfidence = enhanced.confidence;
          finalRationale = enhanced.refinedRationale;
          reasoningSource = enhanced.reasoningSource;
        } else if (enhanced.reasoningSource === 'deterministic_fallback') {
          reasoningSource = 'deterministic_fallback';
          warnings.push(...enhanced.warnings);
        }
      } catch {
        reasoningSource = 'deterministic_fallback';
      }
    }

    // 3. Assemble proposals
    // Strict safety invariant: Every action must have requiresConfirmation: true
    const sanitizedActions: AgentAction[] = decision.proposedActions.map((action) => ({
      ...action,
      requiresConfirmation: true, // Non-negotiable confirmation gate
    }));

    const summary = decision.loopDetected
      ? `Execution failed with ${decision.failureCategory}. Bounded retry limit reached. Recommended safe action: ${finalStrategy}.`
      : `Diagnosed ${decision.failureCategory} on ${toolId || 'action'}. Recommended recovery: ${finalStrategy} (${Math.round(finalConfidence * 100)}% confidence).`;

    const output: RecoveryAgentOutput = {
      executionId,
      failureCategory: decision.failureCategory,
      recoverable: decision.recoverable,
      recommendedRecovery: finalStrategy,
      confidence: finalConfidence,
      requiresUserInput: decision.requiresUserInput,
      rationale: finalRationale,
      fingerprint: decision.fingerprint,
      decision: {
        ...decision,
        recommendedRecovery: finalStrategy,
        confidence: finalConfidence,
        rationale: finalRationale,
      },
      proposedActions: sanitizedActions,
      reasoningSource,
      summary,
      warnings,
    };

    return this.createSuccess(context, output, {
      confidence: finalConfidence,
      actions: sanitizedActions,
      warnings,
      metadata: {
        failureCategory: decision.failureCategory,
        recommendedRecovery: finalStrategy,
        fingerprint: decision.fingerprint,
        loopDetected: decision.loopDetected,
        requiresUserInput: decision.requiresUserInput,
      },
    });
  }
}

export const recoveryAgent = new RecoveryAgent();
