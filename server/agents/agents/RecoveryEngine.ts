/**
 * Recovery Engine for Sentinel Nova (Day 5C.3)
 *
 * Deterministic self-correction engine that classifies execution failures,
 * enforces bounded retry policies, calculates failure fingerprints to prevent loops,
 * scores recovery strategies, and synthesizes safe action proposals.
 *
 * SAFETY INVARIANTS:
 * 1. Proposes actions only. ZERO direct tool execution.
 * 2. ZERO store mutation (tasks, goals, projects, calendar, profile, memory).
 * 3. Bounded retry budget: MAX_RECOVERY_ATTEMPTS = 2.
 * 4. Strictly redacts sensitive tokens, credentials, and stack traces.
 * 5. Tenant isolated: uses only verified items from AgentContext.
 */

import crypto from 'crypto';
import { AgentAction, AgentContext, RiskLevel } from '../types';
import {
  FailureCategory,
  MAX_ATTEMPT_HISTORY,
  MAX_RECOVERY_ATTEMPTS,
  MAX_TOTAL_RECOVERY_ACTIONS,
  RecoveryAttemptRecord,
  RecoveryContext,
  RecoveryDecision,
  RecoveryStrategyCandidate,
  RecoveryStrategyType,
  RetryRisk,
  SafetyLevel,
  StrategyScoreBreakdown,
} from './recoveryTypes';

// Sanitization regexes
const SENSITIVE_PATTERNS = [
  { pattern: /bearer\s+[a-zA-Z0-9_\-\.]+/gi, replacement: '[REDACTED_BEARER_TOKEN]' },
  { pattern: /ya29\.[a-zA-Z0-9_\-\.]+/gi, replacement: '[REDACTED_GOOGLE_TOKEN]' },
  { pattern: /ghp_[a-zA-Z0-9]{10,}/gi, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /github_pat_[a-zA-Z0-9_]{10,}/gi, replacement: '[REDACTED_GITHUB_PAT]' },
  { pattern: /\bsk[-_](?:live|test)?[-_]?[a-zA-Z0-9]{8,}\b/gi, replacement: '[REDACTED_API_KEY]' },
  { pattern: /\beyJh[a-zA-Z0-9_\-]{15,}\.[a-zA-Z0-9_\-]{15,}/gi, replacement: '[REDACTED_JWT]' },
  { pattern: /(?:password|client_secret|auth_secret|secret)\s*[:=]\s*["']?[^"'}\s,]+/gi, replacement: '[REDACTED_SECRET]' },
  { pattern: /(?:authorization|cookie)\s*[:=]\s*["']?[^"'}\s,]+/gi, replacement: '[REDACTED_AUTH_HEADER]' },
  { pattern: /(?:\/[a-zA-Z0-9_\-]+){3,}/g, replacement: '[REDACTED_PATH]' },
];

export class RecoveryEngine {
  /**
   * Sanitizes a failure message or string by redacting credentials, tokens,
   * absolute file paths, and stripping exception stack traces.
   */
  public sanitizeMessage(rawMessage: string): string {
    if (!rawMessage || typeof rawMessage !== 'string') return 'Unknown failure';

    // 1. Remove JavaScript stack trace frames ("at Object.run (...)")
    let cleaned = rawMessage
      .split('\n')
      .filter((line) => !/^\s*at\s+.*\(?.*:\d+:\d+\)?/i.test(line))
      .join(' ')
      .trim();

    // 2. Redact credentials, tokens, secrets, and paths
    for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
      cleaned = cleaned.replace(pattern, replacement);
    }

    // Limit length to prevent memory amplification
    return cleaned.slice(0, 1000).trim();
  }

  /**
   * Sanitizes a parameters object by recursively removing or redacting sensitive keys.
   */
  public sanitizeParameters(params?: Record<string, unknown>): Record<string, unknown> {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return {};

    const safe: Record<string, unknown> = {};
    const sensitiveKeys = new Set([
      'accesstoken',
      'access_token',
      'refreshtoken',
      'refresh_token',
      'token',
      'secret',
      'clientsecret',
      'client_secret',
      'password',
      'authorization',
      'auth_secret',
      'cookie',
      'credentials',
    ]);

    for (const [key, value] of Object.entries(params)) {
      const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (
        sensitiveKeys.has(lowerKey) ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('password') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('credential')
      ) {
        safe[key] = '[REDACTED_SECRET]';
        continue;
      }

      if (typeof value === 'string') {
        safe[key] = this.sanitizeMessage(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        safe[key] = value;
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        safe[key] = this.sanitizeParameters(value as Record<string, unknown>);
      } else if (Array.isArray(value)) {
        safe[key] = value.slice(0, 10).map((v) =>
          typeof v === 'string'
            ? this.sanitizeMessage(v)
            : typeof v === 'object' && v !== null
            ? this.sanitizeParameters(v as Record<string, unknown>)
            : v
        );
      }
    }

    return safe;
  }

  /**
   * Deterministically classifies a failure code and message into a canonical category.
   */
  public classifyFailure(
    failureCode: string,
    failureMessage: string,
    toolId?: string
  ): FailureCategory {
    const code = (failureCode || '').toUpperCase().trim();
    const msg = (failureMessage || '').toLowerCase();

    // 1. Validation failure
    if (
      code.includes('VALIDATION') ||
      code.includes('INVALID_PARAM') ||
      code.includes('INVALID_TIMESTAMPS') ||
      code.includes('INVALID_TIME') ||
      code.includes('DURATION_MISMATCH') ||
      code.includes('SCHEMA') ||
      code.includes('MALFORMED') ||
      msg.includes('validation') ||
      msg.includes('must be a string') ||
      msg.includes('iso 8601') ||
      msg.includes('invalid parameters') ||
      msg.includes('schema validation failed')
    ) {
      return 'VALIDATION_FAILURE';
    }

    // 2. Authorization failure
    if (
      code.includes('CONFIRMATION_REQUIRED') ||
      code.includes('UNAUTHORIZED') ||
      code.includes('UNAUTHENTICATED') ||
      code.includes('AUTH') ||
      code.includes('FORBIDDEN') ||
      code.includes('PERMISSION') ||
      code.includes('ACCESS_DENIED') ||
      code.includes('TENANT') ||
      msg.includes('confirmation required') ||
      msg.includes('unauthorized') ||
      msg.includes('permission denied') ||
      msg.includes('access denied') ||
      msg.includes('tenant')
    ) {
      return 'AUTHORIZATION_FAILURE';
    }

    // 3. Resource not found
    if (
      code.includes('NOT_FOUND') ||
      code.includes('MISSING_RESOURCE') ||
      code.includes('NO_SUCH') ||
      msg.includes('not found') ||
      msg.includes('does not exist') ||
      msg.includes('no task found')
    ) {
      return 'RESOURCE_NOT_FOUND';
    }

    // 4. Resource conflict
    if (
      code.includes('CONFLICT') ||
      code.includes('OVERLAP') ||
      code.includes('OCCUPIED') ||
      code.includes('WINDOW_UNAVAILABLE') ||
      code.includes('STATE_CONFLICT') ||
      code.includes('ALREADY_') ||
      msg.includes('conflict') ||
      msg.includes('already scheduled') ||
      msg.includes('already completed') ||
      msg.includes('window unavailable')
    ) {
      return 'RESOURCE_CONFLICT';
    }

    // 5. Timeout
    if (
      code.includes('TIMEOUT') ||
      code.includes('DEADLINE') ||
      code.includes('TIMED_OUT') ||
      msg.includes('timed out') ||
      msg.includes('deadline exceeded')
    ) {
      return 'TIMEOUT';
    }

    // 6. Rate limited
    if (
      code.includes('RATE_LIMIT') ||
      code.includes('429') ||
      code.includes('TOO_MANY_REQUESTS') ||
      code.includes('QUOTA') ||
      msg.includes('rate limit') ||
      msg.includes('quota exceeded') ||
      msg.includes('too many requests')
    ) {
      return 'RATE_LIMITED';
    }

    // 7. Transient failure
    if (
      code.includes('TRANSIENT') ||
      code.includes('NETWORK') ||
      code.includes('CONNECTION') ||
      code.includes('ECONNRESET') ||
      code.includes('ECONNREFUSED') ||
      code.includes('TEMPORARY') ||
      code.includes('SERVER_BUSY') ||
      msg.includes('temporary failure') ||
      msg.includes('connection reset') ||
      msg.includes('network error')
    ) {
      return 'TRANSIENT_FAILURE';
    }

    // 8. Dependency failure
    if (
      code.includes('DEPENDENCY') ||
      code.includes('DOWNSTREAM') ||
      code.includes('SERVICE_UNAVAILABLE') ||
      code.includes('UPSTREAM') ||
      msg.includes('service unavailable') ||
      msg.includes('downstream service')
    ) {
      return 'DEPENDENCY_FAILURE';
    }

    return 'UNKNOWN_FAILURE';
  }

  /**
   * Computes a deterministic failure fingerprint from sanitized attributes
   * to detect repeated execution failures and prevent infinite loops.
   */
  public generateFingerprint(
    toolId: string = 'none',
    actionType: string = 'none',
    failureCategory: FailureCategory = 'UNKNOWN_FAILURE',
    safeParams: Record<string, unknown> = {}
  ): string {
    const stableKeys = ['taskId', 'scheduledStart', 'durationMinutes', 'status'];
    const stableSegments: string[] = [];

    for (const k of stableKeys) {
      if (safeParams[k] !== undefined && safeParams[k] !== null) {
        stableSegments.push(`${k}=${String(safeParams[k])}`);
      }
    }

    const rawKey = [
      toolId.trim().toLowerCase(),
      actionType.trim().toUpperCase(),
      failureCategory.trim().toUpperCase(),
      stableSegments.sort().join('&'),
    ].join('|');

    return crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 16);
  }

  /**
   * Evaluates idempotency and retry risk for a given tool and action.
   */
  public evaluateRetrySafety(
    toolId?: string,
    actionType?: string,
    failureCategory?: FailureCategory
  ): { isRetrySafe: boolean; retryRisk: RetryRisk; safetyLevel: SafetyLevel } {
    const normTool = (toolId || '').toLowerCase();
    const normAction = (actionType || '').toUpperCase();

    // Authorization failures are never safe to retry
    if (failureCategory === 'AUTHORIZATION_FAILURE') {
      return { isRetrySafe: false, retryRisk: 'high', safetyLevel: 'critical' };
    }

    // Task complete & task reopen are inherently idempotent
    if (normTool.includes('task.complete') || normAction === 'COMPLETE_TASK') {
      return { isRetrySafe: true, retryRisk: 'low', safetyLevel: 'safe' };
    }
    if (normTool.includes('task.reopen') || normAction === 'REOPEN_TASK') {
      return { isRetrySafe: true, retryRisk: 'low', safetyLevel: 'safe' };
    }

    // Scheduling a task to a specific window is guarded/idempotent if window unchanged
    if (normTool.includes('task.schedule') || normAction === 'SCHEDULE_TASK') {
      return { isRetrySafe: true, retryRisk: 'medium', safetyLevel: 'guarded' };
    }

    // Default unknown actions or destructive mutations are high risk
    return { isRetrySafe: false, retryRisk: 'high', safetyLevel: 'high_risk' };
  }

  /**
   * Main deterministic deliberation entry point.
   */
  public deliberate(
    recoveryContext: RecoveryContext,
    agentContext: AgentContext
  ): RecoveryDecision {
    const warnings: string[] = [];
    const sanitizedMsg = this.sanitizeMessage(recoveryContext.failureMessage);
    const sanitizedParams = this.sanitizeParameters(recoveryContext.actionParametersSafe);

    // 1. Classification
    const failureCategory = this.classifyFailure(
      recoveryContext.failureCode,
      sanitizedMsg,
      recoveryContext.toolId
    );

    // 2. Failure Fingerprint & Repeated Failure Counting
    const fingerprint = this.generateFingerprint(
      recoveryContext.toolId || 'none',
      recoveryContext.actionType || 'none',
      failureCategory,
      sanitizedParams
    );

    const boundedHistory = (recoveryContext.previousAttempts || []).slice(-MAX_ATTEMPT_HISTORY);
    const repeatedFailureCount = boundedHistory.filter((att) => {
      const attCat = this.classifyFailure(att.failureCode, '', att.toolId);
      return attCat === failureCategory && att.toolId === recoveryContext.toolId;
    }).length;

    // 3. Loop Detection & Bounded Retry Threshold
    const attemptNumber = Math.max(1, recoveryContext.attemptNumber || 1);
    const loopDetected =
      attemptNumber >= MAX_RECOVERY_ATTEMPTS ||
      repeatedFailureCount >= 1 ||
      (boundedHistory.length >= MAX_RECOVERY_ATTEMPTS && failureCategory !== 'UNKNOWN_FAILURE');

    if (loopDetected) {
      warnings.push(
        `Recovery loop guard triggered: Attempt ${attemptNumber} exceeds safe retry budget (${MAX_RECOVERY_ATTEMPTS}). Automated retries are suppressed.`
      );
    }

    // 4. Retry Safety & Risk Assessment
    const { isRetrySafe, retryRisk, safetyLevel } = this.evaluateRetrySafety(
      recoveryContext.toolId,
      recoveryContext.actionType,
      failureCategory
    );

    // 5. Deliberate Strategies
    const strategies = this.scoreStrategies({
      failureCategory,
      attemptNumber,
      loopDetected,
      isRetrySafe,
      retryRisk,
      recoveryContext,
      agentContext,
      sanitizedParams,
    });

    // 6. Select Top Recommended Strategy
    const viableStrategies = strategies.filter((s) => s.isViable);
    const topCandidate =
      viableStrategies.length > 0
        ? viableStrategies.reduce((prev, curr) => (curr.score > prev.score ? curr : prev))
        : strategies.find((s) => s.strategy === 'abort') || strategies[0];

    const recommendedRecovery = topCandidate.strategy;
    const confidence = topCandidate.score;

    // 7. Extract Verified Alternatives (strictly from AgentContext, zero fabrication)
    const alternatives = this.extractVerifiedAlternatives(
      failureCategory,
      agentContext,
      sanitizedParams
    );

    // 8. Generate AgentAction Proposals
    const proposedActions = this.synthesizeProposals({
      recommendedRecovery,
      recoveryContext,
      sanitizedParams,
      retryRisk,
      alternatives,
      rationale: topCandidate.rationale,
      attemptNumber,
    });

    // Determine if recoverability is possible
    const recoverable =
      failureCategory !== 'AUTHORIZATION_FAILURE' &&
      failureCategory !== 'UNKNOWN_FAILURE' &&
      !loopDetected;

    const requiresUserInput =
      recommendedRecovery === 'ask_user' ||
      recommendedRecovery === 'abort' ||
      failureCategory === 'AUTHORIZATION_FAILURE' ||
      loopDetected ||
      topCandidate.strategy === 'find_alternative';

    return {
      failureCategory,
      recoverable,
      recommendedRecovery,
      confidence,
      safetyLevel: loopDetected ? 'high_risk' : safetyLevel,
      retryRisk,
      isRetrySafe,
      requiresUserInput,
      fingerprint,
      repeatedFailureCount,
      loopDetected,
      rationale: topCandidate.rationale,
      strategies,
      alternatives,
      proposedActions,
      warnings,
    };
  }

  /**
   * Deterministically scores the 6 recovery strategies with normalized dimensions.
   */
  private scoreStrategies(params: {
    failureCategory: FailureCategory;
    attemptNumber: number;
    loopDetected: boolean;
    isRetrySafe: boolean;
    retryRisk: RetryRisk;
    recoveryContext: RecoveryContext;
    agentContext: AgentContext;
    sanitizedParams: Record<string, unknown>;
  }): RecoveryStrategyCandidate[] {
    const {
      failureCategory,
      attemptNumber,
      loopDetected,
      isRetrySafe,
      retryRisk,
      sanitizedParams,
      agentContext,
    } = params;

    const candidates: RecoveryStrategyCandidate[] = [];

    // --- 1. retry_same_action ---
    const canRetry =
      !loopDetected &&
      attemptNumber < MAX_RECOVERY_ATTEMPTS &&
      failureCategory !== 'AUTHORIZATION_FAILURE' &&
      failureCategory !== 'UNKNOWN_FAILURE' &&
      (failureCategory === 'TIMEOUT' ||
        failureCategory === 'TRANSIENT_FAILURE' ||
        (failureCategory === 'RESOURCE_CONFLICT' && isRetrySafe));

    const retryBreakdown: StrategyScoreBreakdown = {
      recoverability: canRetry ? 0.9 : 0.0,
      safety: isRetrySafe ? 0.95 : 0.4,
      retryRiskScore: retryRisk === 'low' ? 1.0 : retryRisk === 'medium' ? 0.6 : 0.0,
      successLikelihood: canRetry ? (attemptNumber === 1 ? 0.85 : 0.5) : 0.0,
      reversibility: isRetrySafe ? 1.0 : 0.4,
      lowUserDisruption: 0.95,
      attemptBudget: canRetry ? (attemptNumber === 1 ? 1.0 : 0.5) : 0.0,
      totalScore: 0.0,
    };
    retryBreakdown.totalScore = this.calculateTotalScore(retryBreakdown);
    candidates.push({
      strategy: 'retry_same_action',
      score: retryBreakdown.totalScore,
      scoreBreakdown: retryBreakdown,
      isViable: canRetry,
      rationale: canRetry
        ? `Transient or timeout condition on idempotent operation (${params.recoveryContext.toolId}). Proposing single confirmed retry.`
        : loopDetected
        ? 'Retry budget exhausted or loop detected. Automated retry is unsafe.'
        : 'Action or failure category is not eligible for safe retry.',
    });

    // --- 2. adjust_parameters ---
    const canAdjust =
      !loopDetected &&
      (failureCategory === 'VALIDATION_FAILURE' ||
        failureCategory === 'RESOURCE_CONFLICT' ||
        failureCategory === 'RATE_LIMITED');

    const isValidationPrime = failureCategory === 'VALIDATION_FAILURE';
    const adjustBreakdown: StrategyScoreBreakdown = {
      recoverability: isValidationPrime ? 0.95 : canAdjust ? 0.85 : 0.2,
      safety: isValidationPrime ? 0.95 : 0.85,
      retryRiskScore: isValidationPrime ? 0.90 : 0.75,
      successLikelihood: isValidationPrime ? 0.92 : canAdjust ? 0.8 : 0.3,
      reversibility: isValidationPrime ? 0.95 : 0.8,
      lowUserDisruption: isValidationPrime ? 0.85 : 0.7,
      attemptBudget: attemptNumber <= MAX_RECOVERY_ATTEMPTS ? (isValidationPrime ? 1.0 : 0.8) : 0.2,
      totalScore: 0.0,
    };
    adjustBreakdown.totalScore = this.calculateTotalScore(adjustBreakdown);
    candidates.push({
      strategy: 'adjust_parameters',
      score: adjustBreakdown.totalScore,
      scoreBreakdown: adjustBreakdown,
      isViable: canAdjust,
      rationale: canAdjust
        ? 'Parameter adjustment (e.g. valid timestamps or sanitized payload) can satisfy execution constraints.'
        : 'Parameter adjustment is not applicable for this failure mode.',
    });

    // --- 3. find_alternative ---
    const verifiedTasks = (agentContext.tasks || []).filter(
      (t) => t.status !== 'completed' && t.id !== sanitizedParams.taskId
    );
    const hasAlternatives = verifiedTasks.length > 0;
    const canFindAlternative =
      (failureCategory === 'RESOURCE_NOT_FOUND' || failureCategory === 'RESOURCE_CONFLICT') &&
      hasAlternatives;

    const altBreakdown: StrategyScoreBreakdown = {
      recoverability: canFindAlternative ? 0.85 : 0.1,
      safety: 0.9,
      retryRiskScore: 0.85,
      successLikelihood: canFindAlternative ? 0.80 : 0.2,
      reversibility: 0.9,
      lowUserDisruption: 0.6,
      attemptBudget: 0.8,
      totalScore: 0.0,
    };
    altBreakdown.totalScore = this.calculateTotalScore(altBreakdown);
    candidates.push({
      strategy: 'find_alternative',
      score: altBreakdown.totalScore,
      scoreBreakdown: altBreakdown,
      isViable: canFindAlternative,
      rationale: canFindAlternative
        ? `Found ${verifiedTasks.length} verified alternative task candidate(s) in context.`
        : 'No verified alternative resources available in current context.',
    });

    // --- 4. replan ---
    const isConflictPrime = failureCategory === 'RESOURCE_CONFLICT';
    const canReplan =
      isConflictPrime ||
      failureCategory === 'TIMEOUT' ||
      (loopDetected && failureCategory !== 'AUTHORIZATION_FAILURE');

    const replanBreakdown: StrategyScoreBreakdown = {
      recoverability: isConflictPrime ? 0.95 : 0.75,
      safety: isConflictPrime ? 0.95 : 0.9,
      retryRiskScore: isConflictPrime ? 0.90 : 0.8,
      successLikelihood: isConflictPrime ? 0.90 : 0.7,
      reversibility: isConflictPrime ? 0.95 : 0.9,
      lowUserDisruption: isConflictPrime ? 0.80 : 0.5,
      attemptBudget: isConflictPrime ? 1.0 : 0.7,
      totalScore: 0.0,
    };
    replanBreakdown.totalScore = this.calculateTotalScore(replanBreakdown);
    candidates.push({
      strategy: 'replan',
      score: replanBreakdown.totalScore,
      scoreBreakdown: replanBreakdown,
      isViable: canReplan,
      rationale: canReplan
        ? 'Schedule or state conflict indicates plan re-evaluation is necessary.'
        : 'Replanning is secondary for this failure category.',
    });

    // --- 5. ask_user ---
    // Top choice for authorization failures, unknown failures, or loop triggers
    const isAskUserPrime =
      failureCategory === 'AUTHORIZATION_FAILURE' ||
      failureCategory === 'RESOURCE_NOT_FOUND' ||
      loopDetected ||
      retryRisk === 'high';

    const askBreakdown: StrategyScoreBreakdown = {
      recoverability: isAskUserPrime ? 0.75 : 0.4,
      safety: 1.0, // Safest possible: hands control back to user
      retryRiskScore: 1.0,
      successLikelihood: 0.9,
      reversibility: 1.0,
      lowUserDisruption: isAskUserPrime ? 0.5 : 0.15, // Non-prime user interruption is high disruption
      attemptBudget: 1.0,
      totalScore: 0.0,
    };
    askBreakdown.totalScore = this.calculateTotalScore(askBreakdown);
    if (isAskUserPrime) {
      // Boost total score when safety requires user intervention
      askBreakdown.totalScore = Math.min(1.0, Number((askBreakdown.totalScore + 0.35).toFixed(3)));
    }
    candidates.push({
      strategy: 'ask_user',
      score: askBreakdown.totalScore,
      scoreBreakdown: askBreakdown,
      isViable: true,
      rationale: isAskUserPrime
        ? `Direct user intervention required due to ${failureCategory}${loopDetected ? ' (loop prevention active)' : ''}.`
        : 'User clarification provides safe fallback.',
    });

    // --- 6. abort ---
    const isAbortPrime = loopDetected && failureCategory === 'UNKNOWN_FAILURE';
    const abortBreakdown: StrategyScoreBreakdown = {
      recoverability: 0.1,
      safety: 1.0,
      retryRiskScore: 1.0,
      successLikelihood: 1.0,
      reversibility: 1.0,
      lowUserDisruption: 0.2,
      attemptBudget: 1.0,
      totalScore: 0.0,
    };
    abortBreakdown.totalScore = this.calculateTotalScore(abortBreakdown);
    if (isAbortPrime) {
      abortBreakdown.totalScore = 0.95;
    }
    candidates.push({
      strategy: 'abort',
      score: abortBreakdown.totalScore,
      scoreBreakdown: abortBreakdown,
      isViable: true,
      rationale: 'Safe termination of execution pipeline without mutations.',
    });

    return candidates;
  }

  /**
   * Calculates a bounded, normalized total score [0.0 - 1.0] from weighted dimensions.
   */
  private calculateTotalScore(b: StrategyScoreBreakdown): number {
    const raw =
      b.recoverability * 0.25 +
      b.safety * 0.25 +
      b.retryRiskScore * 0.20 +
      b.successLikelihood * 0.15 +
      b.reversibility * 0.10 +
      b.attemptBudget * 0.05;

    if (isNaN(raw) || !isFinite(raw)) return 0.0;
    return Number(Math.max(0.0, Math.min(1.0, raw)).toFixed(3));
  }

  /**
   * Identifies verified alternative resources strictly within AgentContext.
   */
  private extractVerifiedAlternatives(
    failureCategory: FailureCategory,
    agentContext: AgentContext,
    sanitizedParams: Record<string, unknown>
  ): string[] {
    const alternatives: string[] = [];
    if (failureCategory !== 'RESOURCE_NOT_FOUND' && failureCategory !== 'RESOURCE_CONFLICT') {
      return alternatives;
    }

    const currentTaskId = sanitizedParams.taskId;
    const availableTasks = (agentContext.tasks || []).filter(
      (t) => t.status !== 'completed' && t.id !== currentTaskId
    );

    for (const task of availableTasks.slice(0, 3)) {
      alternatives.push(`Task: "${task.title}" (ID: ${task.id})`);
    }

    return alternatives;
  }

  /**
   * Synthesizes safe AgentAction proposals based on the recommended recovery strategy.
   * Safety requirement: requiresConfirmation = true is strictly enforced.
   */
  private synthesizeProposals(params: {
    recommendedRecovery: RecoveryStrategyType;
    recoveryContext: RecoveryContext;
    sanitizedParams: Record<string, unknown>;
    retryRisk: RetryRisk;
    alternatives: string[];
    rationale: string;
    attemptNumber: number;
  }): AgentAction[] {
    const {
      recommendedRecovery,
      recoveryContext,
      sanitizedParams,
      retryRisk,
      alternatives,
      rationale,
      attemptNumber,
    } = params;

    const proposals: AgentAction[] = [];
    const targetId = (sanitizedParams.taskId as string) || recoveryContext.toolId || 'execution';

    switch (recommendedRecovery) {
      case 'retry_same_action':
        proposals.push({
          actionId: `act_rec_retry_${crypto.randomUUID().slice(0, 8)}`,
          type: 'RECOVERY_RETRY',
          description: `Retry execution of tool ${recoveryContext.toolId || 'previous action'} (Attempt ${attemptNumber + 1})`,
          target: targetId,
          parameters: {
            toolId: recoveryContext.toolId,
            originalActionId: recoveryContext.actionId,
            parameters: sanitizedParams,
            attemptNumber: attemptNumber + 1,
            rationale,
          },
          riskLevel: retryRisk,
          requiresConfirmation: true, // MANDATORY
          sourceAgentId: 'agent.recovery',
        });
        break;

      case 'adjust_parameters':
        proposals.push({
          actionId: `act_rec_adj_${crypto.randomUUID().slice(0, 8)}`,
          type: 'RECOVERY_ADJUST',
          description: `Adjust execution parameters for ${recoveryContext.toolId || 'action'} to satisfy validation requirements`,
          target: targetId,
          parameters: {
            toolId: recoveryContext.toolId,
            originalActionId: recoveryContext.actionId,
            adjustedParameters: sanitizedParams,
            rationale,
          },
          riskLevel: 'medium',
          requiresConfirmation: true, // MANDATORY
          sourceAgentId: 'agent.recovery',
        });
        break;

      case 'find_alternative':
        proposals.push({
          actionId: `act_rec_alt_${crypto.randomUUID().slice(0, 8)}`,
          type: 'RECOVERY_ALTERNATIVE',
          description: `Select verified alternative candidate: ${alternatives[0] || 'alternative task'}`,
          target: targetId,
          parameters: {
            originalTaskId: sanitizedParams.taskId,
            alternatives,
            rationale,
          },
          riskLevel: 'medium',
          requiresConfirmation: true, // MANDATORY
          sourceAgentId: 'agent.recovery',
        });
        break;

      case 'replan':
        proposals.push({
          actionId: `act_rec_rep_${crypto.randomUUID().slice(0, 8)}`,
          type: 'RECOVERY_REPLAN',
          description: 'Trigger replanning cycle to resolve scheduling or resource conflict',
          target: targetId,
          parameters: {
            taskId: sanitizedParams.taskId,
            reason: rationale,
          },
          riskLevel: 'low',
          requiresConfirmation: true, // MANDATORY
          sourceAgentId: 'agent.recovery',
        });
        break;

      case 'ask_user':
        proposals.push({
          actionId: `act_rec_ask_${crypto.randomUUID().slice(0, 8)}`,
          type: 'RECOVERY_ASK_USER',
          description: 'Request user guidance to resolve execution failure',
          target: 'user',
          parameters: {
            failureCode: recoveryContext.failureCode,
            failureMessage: this.sanitizeMessage(recoveryContext.failureMessage),
            prompt: `Execution failed: ${this.sanitizeMessage(recoveryContext.failureMessage)}. Please provide guidance on how you would like to proceed.`,
            rationale,
          },
          riskLevel: 'low',
          requiresConfirmation: true, // MANDATORY
          sourceAgentId: 'agent.recovery',
        });
        break;

      case 'abort':
      default:
        proposals.push({
          actionId: `act_rec_abt_${crypto.randomUUID().slice(0, 8)}`,
          type: 'RECOVERY_ABORT',
          description: 'Safely terminate execution without performing mutations',
          target: 'execution',
          parameters: {
            executionId: recoveryContext.executionId,
            reason: rationale,
          },
          riskLevel: 'low',
          requiresConfirmation: true, // MANDATORY
          sourceAgentId: 'agent.recovery',
        });
        break;
    }

    return proposals.slice(0, MAX_TOTAL_RECOVERY_ACTIONS);
  }
}

export const recoveryEngine = new RecoveryEngine();
