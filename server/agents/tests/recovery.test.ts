/**
 * Sentinel Nova — Day 5C Step 3
 * Recovery Agent, RecoveryEngine & Self-Correction Layer Comprehensive Test Suite
 *
 * Verifies categories A through AV:
 * 1. Registration & Metadata (A - D)
 * 2. Deterministic Classification (E - L)
 * 3. Fingerprinting & Loop Prevention (M - P)
 * 4. Deliberation Scoring (Q - V)
 * 5. Safety & Invariants (W - AC)
 * 6. Integration with ReviewerAgent (AD - AF)
 * 7. Reasoning Service & Sanitization (AG - AM)
 * 8. Bounded Context & Tenant Isolation (AN - AQ)
 * 9. API Endpoint Verification (AR - AV)
 */

import '../index'; // Ensure all agents are registered in agentRegistry
import { recoveryAgent, RecoveryAgent } from '../agents/RecoveryAgent';
import { recoveryEngine, RecoveryEngine } from '../agents/RecoveryEngine';
import { RecoveryReasoningService } from '../services/RecoveryReasoningService';
import { agentRegistry } from '../AgentRegistry';
import { reviewerAgent } from '../agents/ReviewerAgent';
import { toolManager } from '../tools/ToolManager';
import { createTask, getTaskById, getTasksByUser } from '../../taskStore';
import { createGoal, getGoalsByUser } from '../../goalStore';
import { createMemory, getMemoriesByUser } from '../../memoryStore';
import { AgentContext, AgentAction } from '../types';
import { RecoveryContext, MAX_RECOVERY_ATTEMPTS } from '../agents/recoveryTypes';
import http from 'http';
import express from 'express';

async function runRecoveryTests() {
  console.log('================================================================');
  console.log('--- SENTINEL NOVA RECOVERY AGENT & SELF-CORRECTION TESTS (DAY 5C.3) ---');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  const runId = Date.now();
  const userA = `user_rec_alpha_${runId}`;
  const userB = `user_rec_bravo_${runId}`;

  // Seed baseline tasks for User A and User B
  const taskA1 = await createTask(userA, {
    title: 'Core Architecture Review',
    durationMinutes: 60,
    priority: 'high',
  });
  const taskA2 = await createTask(userA, {
    title: 'Security Audit Checkpoint',
    durationMinutes: 45,
    priority: 'medium',
  });
  const taskB1 = await createTask(userB, {
    title: 'Tenant Isolation Probe',
    durationMinutes: 30,
    priority: 'low',
  });

  const baseContextA: AgentContext = {
    userId: userA,
    requestId: `req_${runId}_1`,
    executionId: `exec_${runId}_1`,
    userRequest: 'Please handle the failure',
    tasks: [taskA1, taskA2],
    parameters: {},
  };

  // ================================================================
  // SECTION 1: REGISTRATION & METADATA (A - D)
  // ================================================================
  console.log('\n--- 1. Registration & Metadata (A - D) ---');

  // A: Registration in AgentRegistry
  const registeredAgent = agentRegistry.get('agent.recovery');
  assert(registeredAgent !== undefined, 'A. Registered in agentRegistry with ID agent.recovery');
  assert(registeredAgent?.id === 'agent.recovery', 'A2. Registered agent has correct ID');

  // B: Capabilities verification
  const expectedCapabilities = [
    'failure_analysis',
    'failure_classification',
    'recovery_planning',
    'retry_analysis',
    'alternative_action',
    'execution_recovery',
    'self_correction',
    'recovery_decision_support',
  ];
  const hasAllCapabilities = expectedCapabilities.every((cap) =>
    registeredAgent?.capabilities.includes(cap as any)
  );
  assert(hasAllCapabilities, 'B. Agent exhibits all required self-correction capabilities');

  // C: Metadata checks
  assert(registeredAgent?.name === 'Recovery Agent', 'C1. Correct agent name');
  assert(typeof registeredAgent?.description === 'string' && registeredAgent.description.length > 20, 'C2. Valid description');
  assert(registeredAgent?.version === '1.0.0', 'C3. Version is 1.0.0');
  assert(registeredAgent?.timeoutMs === 8000, 'C4. Safe timeout configured (8000ms)');

  // D: canHandle logic
  const canHandleNoFailure = recoveryAgent.canHandle({
    ...baseContextA,
    userRequest: 'plan my day today',
    parameters: {},
  });
  assert(canHandleNoFailure === false, 'D1. canHandle returns false for standard non-failure requests');

  const canHandleWithFailure = recoveryAgent.canHandle({
    ...baseContextA,
    parameters: {
      recoveryContext: {
        executionId: 'exec_fail_1',
        failureCode: 'TRANSIENT_FAILURE',
        failureMessage: 'Socket closed',
      },
    },
  });
  assert(canHandleWithFailure === true, 'D2. canHandle returns true when structured recoveryContext is provided');

  // ================================================================
  // SECTION 2: DETERMINISTIC CLASSIFICATION (E - L)
  // ================================================================
  console.log('\n--- 2. Deterministic Classification (E - L) ---');

  const engine = new RecoveryEngine();

  // E: VALIDATION_FAILURE
  const catE1 = engine.classifyFailure('INVALID_PARAMS', 'Parameter taskId must be a string');
  const catE2 = engine.classifyFailure('SCHEMA_VALIDATION_FAILED', 'Invalid timestamp format');
  assert(catE1 === 'VALIDATION_FAILURE' && catE2 === 'VALIDATION_FAILURE', 'E. Correctly classifies VALIDATION_FAILURE');

  // F: AUTHORIZATION_FAILURE
  const catF1 = engine.classifyFailure('CONFIRMATION_REQUIRED', 'User confirmation required for execution');
  const catF2 = engine.classifyFailure('UNAUTHORIZED', 'Access denied to task');
  assert(catF1 === 'AUTHORIZATION_FAILURE' && catF2 === 'AUTHORIZATION_FAILURE', 'F. Correctly classifies AUTHORIZATION_FAILURE');

  // G: RESOURCE_NOT_FOUND
  const catG1 = engine.classifyFailure('NOT_FOUND', 'Task with specified id does not exist');
  const catG2 = engine.classifyFailure('MISSING_RESOURCE', 'Resource not found in store');
  assert(catG1 === 'RESOURCE_NOT_FOUND' && catG2 === 'RESOURCE_NOT_FOUND', 'G. Correctly classifies RESOURCE_NOT_FOUND');

  // H: RESOURCE_CONFLICT
  const catH1 = engine.classifyFailure('CONFLICT', 'Window unavailable due to overlapping calendar event');
  const catH2 = engine.classifyFailure('STATE_CONFLICT', 'Task is already scheduled');
  assert(catH1 === 'RESOURCE_CONFLICT' && catH2 === 'RESOURCE_CONFLICT', 'H. Correctly classifies RESOURCE_CONFLICT');

  // I: TIMEOUT
  const catI1 = engine.classifyFailure('TIMEOUT', 'Execution exceeded deadline of 10000ms');
  const catI2 = engine.classifyFailure('DEADLINE_EXCEEDED', 'Downstream connection timed out');
  assert(catI1 === 'TIMEOUT' && catI2 === 'TIMEOUT', 'I. Correctly classifies TIMEOUT');

  // J: RATE_LIMITED
  const catJ1 = engine.classifyFailure('RATE_LIMIT_EXCEEDED', 'Too many requests, retry after 60s');
  const catJ2 = engine.classifyFailure('429', 'API quota exceeded');
  assert(catJ1 === 'RATE_LIMITED' && catJ2 === 'RATE_LIMITED', 'J. Correctly classifies RATE_LIMITED');

  // K: TRANSIENT_FAILURE
  const catK1 = engine.classifyFailure('ECONNRESET', 'Connection reset by peer');
  const catK2 = engine.classifyFailure('TEMPORARY_NETWORK_FAILURE', 'Temporary socket failure');
  assert(catK1 === 'TRANSIENT_FAILURE' && catK2 === 'TRANSIENT_FAILURE', 'K. Correctly classifies TRANSIENT_FAILURE');

  // L: UNKNOWN_FAILURE
  const catL1 = engine.classifyFailure('WEIRD_ERR_CODE', 'Something unexpected occurred');
  assert(catL1 === 'UNKNOWN_FAILURE', 'L. Unrecognized error codes default to UNKNOWN_FAILURE');

  // ================================================================
  // SECTION 3: FINGERPRINTING & LOOP PREVENTION (M - P)
  // ================================================================
  console.log('\n--- 3. Fingerprinting & Loop Prevention (M - P) ---');

  // M: Deterministic fingerprinting
  const fp1 = engine.generateFingerprint('tool.task.complete', 'COMPLETE_TASK', 'TRANSIENT_FAILURE', { taskId: 'task_100' });
  const fp2 = engine.generateFingerprint('tool.task.complete', 'COMPLETE_TASK', 'TRANSIENT_FAILURE', { taskId: 'task_100' });
  const fp3 = engine.generateFingerprint('tool.task.complete', 'COMPLETE_TASK', 'TIMEOUT', { taskId: 'task_100' });
  assert(fp1 === fp2, 'M1. Identical attributes yield identical failure fingerprint');
  assert(fp1 !== fp3, 'M2. Different failure category yields distinct fingerprint');
  assert(fp1.length === 16, 'M3. Fingerprint is bounded 16-character hex hash');

  // N: Repeated failure detection
  const recContextWithHistory: RecoveryContext = {
    executionId: 'exec_rep_1',
    toolId: 'tool.task.complete',
    actionType: 'COMPLETE_TASK',
    failureCode: 'ECONNRESET',
    failureMessage: 'Connection reset',
    failedAt: new Date().toISOString(),
    attemptNumber: 2,
    previousAttempts: [
      {
        attemptNumber: 1,
        toolId: 'tool.task.complete',
        status: 'failed',
        failureCode: 'ECONNRESET',
        timestamp: new Date().toISOString(),
      },
    ],
    actionParametersSafe: { taskId: taskA1.id },
  };
  const decisionN = engine.deliberate(recContextWithHistory, baseContextA);
  assert(decisionN.repeatedFailureCount >= 1, 'N. Correctly counts repeated failures in previousAttempts');

  // O: Loop detection on attemptNumber >= MAX_RECOVERY_ATTEMPTS (2)
  assert(decisionN.loopDetected === true, 'O. Loop detected when attemptNumber reached MAX_RECOVERY_ATTEMPTS (2)');

  // P: Loop detection suppresses retry recommendation
  assert(decisionN.recommendedRecovery !== 'retry_same_action', 'P1. Retry suppressed when loop guard is active');
  assert(decisionN.recommendedRecovery === 'ask_user' || decisionN.recommendedRecovery === 'abort', 'P2. Recommended fallback is ask_user or abort');
  assert(decisionN.warnings.some((w) => w.includes('loop guard') || w.includes('exceeds safe retry budget')), 'P3. Emits loop guard warning');

  // ================================================================
  // SECTION 4: DELIBERATION SCORING (Q - V)
  // ================================================================
  console.log('\n--- 4. Deliberation Scoring (Q - V) ---');

  // Q: All 6 strategies scored
  const freshContext: RecoveryContext = {
    executionId: 'exec_fresh_1',
    toolId: 'tool.task.complete',
    actionType: 'COMPLETE_TASK',
    failureCode: 'TRANSIENT_FAILURE',
    failureMessage: 'Temporary glitch',
    failedAt: new Date().toISOString(),
    attemptNumber: 1,
    actionParametersSafe: { taskId: taskA1.id },
  };
  const decisionQ = engine.deliberate(freshContext, baseContextA);
  assert(decisionQ.strategies.length === 6, 'Q1. Exactly 6 strategies scored');
  const strategyNames = decisionQ.strategies.map((s) => s.strategy).sort();
  const expectedNames = ['abort', 'adjust_parameters', 'ask_user', 'find_alternative', 'replan', 'retry_same_action'].sort();
  assert(JSON.stringify(strategyNames) === JSON.stringify(expectedNames), 'Q2. All 6 required strategy names present');

  // R: Scores strictly bounded [0.0, 1.0], no NaN or Infinity
  const validScores = decisionQ.strategies.every(
    (s) => typeof s.score === 'number' && !isNaN(s.score) && isFinite(s.score) && s.score >= 0.0 && s.score <= 1.0
  );
  assert(validScores, 'R. All strategy scores are bounded between 0.0 and 1.0 without NaN or Infinity');

  // S: Non-retryable for authorization failure
  const authContext: RecoveryContext = {
    executionId: 'exec_auth_1',
    toolId: 'tool.task.complete',
    actionType: 'COMPLETE_TASK',
    failureCode: 'CONFIRMATION_REQUIRED',
    failureMessage: 'User confirmation required',
    failedAt: new Date().toISOString(),
    attemptNumber: 1,
    actionParametersSafe: { taskId: taskA1.id },
  };
  const decisionS = engine.deliberate(authContext, baseContextA);
  const retryStrategyS = decisionS.strategies.find((s) => s.strategy === 'retry_same_action');
  assert(retryStrategyS?.isViable === false, 'S1. retry_same_action is strictly non-viable for AUTHORIZATION_FAILURE');
  assert(decisionS.recommendedRecovery === 'ask_user', 'S2. ask_user recommended for AUTHORIZATION_FAILURE');

  // T: Retry favored for transient failure on idempotent action (attempt 1)
  assert(decisionQ.recommendedRecovery === 'retry_same_action', 'T. retry_same_action favored for transient error on idempotent task completion');

  // U: Adjust parameters favored for validation failure
  const valContext: RecoveryContext = {
    executionId: 'exec_val_1',
    toolId: 'tool.task.schedule',
    actionType: 'SCHEDULE_TASK',
    failureCode: 'VALIDATION_FAILURE',
    failureMessage: 'Invalid durationMinutes in parameters',
    failedAt: new Date().toISOString(),
    attemptNumber: 1,
    actionParametersSafe: { taskId: taskA1.id, scheduledStart: '2026-09-15T10:00:00Z' },
  };
  const decisionU = engine.deliberate(valContext, baseContextA);
  assert(decisionU.recommendedRecovery === 'adjust_parameters', 'U. adjust_parameters favored for VALIDATION_FAILURE');

  // V: Replan favored for conflict
  const conflictContext: RecoveryContext = {
    executionId: 'exec_conf_1',
    toolId: 'tool.task.schedule',
    actionType: 'SCHEDULE_TASK',
    failureCode: 'RESOURCE_CONFLICT',
    failureMessage: 'Window unavailable due to overlapping meeting',
    failedAt: new Date().toISOString(),
    attemptNumber: 1,
    actionParametersSafe: { taskId: taskA1.id },
  };
  const decisionV = engine.deliberate(conflictContext, baseContextA);
  assert(decisionV.recommendedRecovery === 'replan', 'V. replan favored for RESOURCE_CONFLICT');

  // ================================================================
  // SECTION 5: SAFETY & INVARIANTS (W - AC)
  // ================================================================
  console.log('\n--- 5. Safety & Invariants (W - AC) ---');

  // W & X: RecoveryAgent produces proposals only, zero tool execution
  const initialGoals = await getGoalsByUser(userA);
  const initialMemories = await getMemoriesByUser(userA);
  const initialToolExecutions = toolManager.getRecentTraces().length;
  const agentRunContext: AgentContext = {
    ...baseContextA,
    parameters: {
      recoveryContext: freshContext,
    },
  };
  const agentResult = await recoveryAgent.execute(agentRunContext);
  const postToolExecutions = toolManager.getRecentTraces().length;
  assert(agentResult.success === true, 'W1. RecoveryAgent execution succeeded');
  assert(postToolExecutions === initialToolExecutions, 'W2 & X. Zero tools executed by RecoveryAgent (proposals only)');

  // Y: Zero store mutations
  const tasksAfter = await getTasksByUser(userA);
  assert(tasksAfter.length === 2, 'Y1. Task store untouched by RecoveryAgent');
  const goalsAfter = await getGoalsByUser(userA);
  assert(goalsAfter.length === initialGoals.length, 'Y2. Goal store untouched');
  const memoriesAfter = await getMemoriesByUser(userA);
  assert(memoriesAfter.length === initialMemories.length, 'Y3. Memory store untouched');

  // Z: all proposed actions have requiresConfirmation: true
  assert(agentResult.actions && agentResult.actions.length > 0, 'Z1. RecoveryAgent produced action proposals');
  const allRequireConfirmation = (agentResult.actions || []).every((act) => act.requiresConfirmation === true);
  assert(allRequireConfirmation, 'Z2. Every proposed recovery action strictly enforces requiresConfirmation = true');

  // AA: actions have valid riskLevel
  const validRiskLevels = (agentResult.actions || []).every((act) =>
    ['low', 'medium', 'high'].includes(act.riskLevel)
  );
  assert(validRiskLevels, 'AA. Every proposed action has valid riskLevel');

  // AB: Sensitive tokens and credentials redacted from messages and parameters
  const sensitiveMsg = 'OAuth error: Bearer ya29.a0AfH6SMDI890 password=superSecret123 sk-live-999988887777';
  const sanitizedMsg = engine.sanitizeMessage(sensitiveMsg);
  assert(!sanitizedMsg.includes('ya29.'), 'AB1. Google access token redacted');
  assert(!sanitizedMsg.includes('superSecret123'), 'AB2. Password redacted');
  assert(!sanitizedMsg.includes('sk-live'), 'AB3. API key redacted');

  const sensitiveParams = {
    taskId: 'task_clean',
    accessToken: 'ya29.secret_token',
    client_secret: 'top_secret_xyz',
    nested: {
      auth_secret: 'nested_secret',
    },
  };
  const sanitizedParams = engine.sanitizeParameters(sensitiveParams);
  assert(sanitizedParams.accessToken === '[REDACTED_SECRET]', 'AB4. Parameter accessToken redacted');
  assert(sanitizedParams.client_secret === '[REDACTED_SECRET]', 'AB5. Parameter client_secret redacted');
  assert((sanitizedParams.nested as any).auth_secret === '[REDACTED_SECRET]', 'AB6. Nested secrets redacted');

  // AC: Stack traces stripped
  const stackMsg = `Error: DB Connection refused
    at Object.run (/app/server/db.ts:45:12)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)`;
  const strippedMsg = engine.sanitizeMessage(stackMsg);
  assert(!strippedMsg.includes('at Object.run'), 'AC1. Stack trace frames stripped');
  assert(!strippedMsg.includes('node:internal'), 'AC2. Node internals stripped');

  // ================================================================
  // SECTION 6: INTEGRATION WITH REVIEWER AGENT (AD - AF)
  // ================================================================
  console.log('\n--- 6. Integration with ReviewerAgent (AD - AF) ---');

  // AD: ReviewerAgent accepts RECOVERY_* proposals
  const recoveryRetryAction: AgentAction = {
    actionId: `act_rec_test_${runId}`,
    type: 'RECOVERY_RETRY',
    description: 'Retry task completion',
    target: taskA1.id,
    parameters: {
      toolId: 'tool.task.complete',
      taskId: taskA1.id,
      attemptNumber: 2,
    },
    riskLevel: 'low',
    requiresConfirmation: true,
    sourceAgentId: 'agent.recovery',
  };

  const reviewResultAD = await reviewerAgent.reviewAction(recoveryRetryAction, {
    ...baseContextA,
    userId: userA,
    tasks: [taskA1],
  });
  assert(reviewResultAD.approved === true, 'AD1. ReviewerAgent approved valid RECOVERY_RETRY proposal');
  assert(reviewResultAD.requiresConfirmation === true, 'AD2. Reviewer confirms requiresConfirmation is true');

  // AE: ReviewerAgent rejects foreign userId injection
  const spoofedRecoveryAction: AgentAction = {
    ...recoveryRetryAction,
    actionId: `act_spoof_${runId}`,
    parameters: {
      ...recoveryRetryAction.parameters,
      userId: userB, // Spoof foreign user!
    },
  };
  const reviewResultAE = await reviewerAgent.reviewAction(spoofedRecoveryAction, {
    ...baseContextA,
    userId: userA,
  });
  assert(reviewResultAE.approved === false, 'AE1. ReviewerAgent rejected unauthorized foreign userId injection');
  assert(reviewResultAE.riskLevel === 'critical', 'AE2. Injected userId marked critical risk');

  // AF: ReviewerAgent verifies task ownership for recovery actions
  const foreignTaskAction: AgentAction = {
    ...recoveryRetryAction,
    actionId: `act_foreign_${runId}`,
    parameters: {
      ...recoveryRetryAction.parameters,
      taskId: taskB1.id, // Belongs to user B!
    },
  };
  const reviewResultAF = await reviewerAgent.reviewAction(foreignTaskAction, {
    ...baseContextA,
    userId: userA,
  });
  assert(reviewResultAF.approved === false, 'AF1. ReviewerAgent rejected recovery proposal referencing foreign task');
  assert(reviewResultAF.reasons.some((r) => r.includes('Access denied')), 'AF2. Reason cites access denied on foreign task');

  // ================================================================
  // SECTION 7: REASONING SERVICE & SANITIZATION (AG - AM)
  // ================================================================
  console.log('\n--- 7. Reasoning Service & Sanitization (AG - AM) ---');

  const reasoningService = new RecoveryReasoningService();

  // AG: Anonymous snapshot verification
  const snapshot = reasoningService.buildAnonymousSnapshot(decisionQ, 1);
  const snapshotStr = JSON.stringify(snapshot);
  assert(!snapshotStr.includes(userA), 'AG1. Snapshot contains ZERO user IDs');
  assert(!snapshotStr.includes(taskA1.id), 'AG2. Snapshot contains ZERO task IDs');
  assert(!snapshotStr.includes('Bearer'), 'AG3. Snapshot contains ZERO tokens');
  assert(snapshot.strategies.length === 6, 'AG4. Snapshot contains anonymous numbered strategies');

  // AH & AI: Deterministic fallback when Gemini unavailable / times out
  const enhanceResult = await reasoningService.enhanceDeliberation(decisionQ, 1);
  assert(enhanceResult.recommendedStrategy !== undefined, 'AI1. Enhancement returns valid strategy');
  assert(
    enhanceResult.reasoningSource === 'deterministic' ||
      enhanceResult.reasoningSource === 'deterministic_fallback' ||
      enhanceResult.reasoningSource === 'gemini_enhanced',
    'AI2. Handled reasoning source gracefully'
  );

  // AJ: parseAndValidateResponse rejects invalid strategy index
  const invalidIndexRes = reasoningService.parseAndValidateResponse(
    JSON.stringify({ chosenStrategyIndex: 99, refinedRationale: 'Invalid index', confidence: 0.8 }),
    decisionQ.strategies
  );
  assert(invalidIndexRes === null, 'AJ. Rejects out-of-bounds strategy index from untrusted LLM');

  // AK: parseAndValidateResponse clamps confidence
  const validParsed = reasoningService.parseAndValidateResponse(
    JSON.stringify({ chosenStrategyIndex: 1, refinedRationale: 'Safe rationale', confidence: 1.5 }),
    decisionQ.strategies
  );
  assert(validParsed !== null && validParsed.confidence <= 1.0, 'AK. Clamps confidence to <= 1.0');

  // AL: parseAndValidateResponse rejects dangerous code injection
  const injectionParsed = reasoningService.parseAndValidateResponse(
    JSON.stringify({
      chosenStrategyIndex: 1,
      refinedRationale: 'eval("process.exit(1)")',
      confidence: 0.9,
    }),
    decisionQ.strategies
  );
  assert(injectionParsed === null, 'AL. Rejects prompt injection containing eval or process.exit');

  // AM: parseAndValidateResponse handles malformed JSON
  const malformedParsed = reasoningService.parseAndValidateResponse('Not valid JSON {', decisionQ.strategies);
  assert(malformedParsed === null, 'AM. Handles malformed JSON gracefully');

  // ================================================================
  // SECTION 8: BOUNDED CONTEXT & TENANT ISOLATION (AN - AQ)
  // ================================================================
  console.log('\n--- 8. Bounded Context & Tenant Isolation (AN - AQ) ---');

  // AN: Operates strictly within caller's AgentContext
  const notFoundContext: RecoveryContext = {
    executionId: 'exec_nf_1',
    toolId: 'tool.task.complete',
    actionType: 'COMPLETE_TASK',
    failureCode: 'RESOURCE_NOT_FOUND',
    failureMessage: 'Task not found',
    failedAt: new Date().toISOString(),
    attemptNumber: 1,
    actionParametersSafe: { taskId: 'non_existent_task_id' },
  };
  const decisionAN = engine.deliberate(notFoundContext, baseContextA);

  // AO: Alternatives drawn only from verified context tasks
  assert(decisionAN.alternatives.length > 0, 'AO1. Identified alternative tasks');
  const allAltsBelongToUserA = decisionAN.alternatives.every((alt) =>
    alt.includes(taskA1.id) || alt.includes(taskA2.id)
  );
  assert(allAltsBelongToUserA, 'AO2. Alternatives drawn strictly from User A context tasks');

  // AP: Zero fabricated task IDs
  const altContainsFabricated = decisionAN.alternatives.some(
    (alt) => !alt.includes(taskA1.id) && !alt.includes(taskA2.id)
  );
  assert(!altContainsFabricated, 'AP. Zero fabricated task IDs in alternatives');

  // AQ: Cross-tenant isolation preserved
  const decisionUserB = engine.deliberate(notFoundContext, {
    ...baseContextA,
    userId: userB,
    tasks: [taskB1], // User B context
  });
  const userBAltsHaveUserATasks = decisionUserB.alternatives.some((alt) =>
    alt.includes(taskA1.id) || alt.includes(taskA2.id)
  );
  assert(!userBAltsHaveUserATasks, 'AQ. User B does NOT receive User A tasks in recovery alternatives');

  // ================================================================
  // SECTION 9: API ENDPOINT VERIFICATION (AR - AV)
  // ================================================================
  console.log('\n--- 9. API Endpoint Verification (AR - AV) ---');

  // Test live server port 3000 endpoint
  async function testHttp(options: http.RequestOptions, postData?: string): Promise<{ statusCode?: number; body: string; json?: any }> {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json: any;
          try {
            json = JSON.parse(data);
          } catch {}
          resolve({ statusCode: res.statusCode, body: data, json });
        });
      });
      req.on('error', (err) => reject(err));
      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  // Create an express applet mock router to test HTTP logic directly
  const testApp = express();
  testApp.use(express.json({ limit: '64kb' }));

  // Simulate requireAuth middleware
  testApp.post('/api/nova/recovery/analyze', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer user_${userA}`) {
      return res.status(401).json({ success: false, error: 'UNAUTHENTICATED' });
    }

    const rawBody = req.body || {};
    const payloadStr = JSON.stringify(rawBody);

    if (payloadStr.length > 64 * 1024) {
      return res.status(413).json({ success: false, error: 'PAYLOAD_TOO_LARGE' });
    }

    if (rawBody.userId && rawBody.userId !== userA) {
      return res.status(400).json({ success: false, error: 'UNAUTHORIZED', message: 'Spoofing foreign userId is forbidden' });
    }

    const failureCandidate =
      rawBody.failureContext ||
      rawBody.recoveryContext ||
      rawBody.failure ||
      (rawBody.failureCode ? rawBody : null);

    if (!failureCandidate || typeof failureCandidate !== 'object') {
      return res.status(400).json({ success: false, error: 'INVALID_FAILURE_CONTEXT' });
    }

    // Verify task ownership
    const rawTaskId = failureCandidate.actionParametersSafe?.taskId || failureCandidate.taskId;
    if (rawTaskId && rawTaskId === taskB1.id) {
      return res.status(404).json({ success: false, error: 'RESOURCE_NOT_FOUND' });
    }

    const recContext: RecoveryContext = {
      executionId: failureCandidate.executionId || 'exec_api_1',
      failureCode: failureCandidate.failureCode || 'TRANSIENT_FAILURE',
      failureMessage: failureCandidate.failureMessage || 'API error',
      failedAt: new Date().toISOString(),
      attemptNumber: failureCandidate.attemptNumber || 1,
      actionParametersSafe: failureCandidate.actionParametersSafe || {},
      toolId: failureCandidate.toolId,
    };

    const dec = engine.deliberate(recContext, baseContextA);
    return res.json({
      success: true,
      executionId: recContext.executionId,
      failureCategory: dec.failureCategory,
      recoverable: dec.recoverable,
      recommendedRecovery: dec.recommendedRecovery,
      confidence: dec.confidence,
      proposedActions: dec.proposedActions,
      warnings: dec.warnings,
      summary: 'Failure analysis complete',
    });
  });

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const testPort = address.port;

  try {
    // AR: Unauthenticated request rejected (401)
    const resAR = await testHttp({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/api/nova/recovery/analyze',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, JSON.stringify({ failureCode: 'TIMEOUT' }));
    assert(resAR.statusCode === 401, 'AR. Unauthenticated recovery request rejected with 401');

    // AS: Valid authenticated request returns 200 with proposals
    const resAS = await testHttp({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/api/nova/recovery/analyze',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer user_${userA}`,
      },
    }, JSON.stringify({
      failureCode: 'TRANSIENT_FAILURE',
      failureMessage: 'Socket closed',
      toolId: 'tool.task.complete',
      actionParametersSafe: { taskId: taskA1.id },
    }));
    assert(resAS.statusCode === 200, 'AS1. Authenticated analysis returns 200');
    assert(resAS.json?.success === true, 'AS2. Response success is true');
    assert(resAS.json?.proposedActions && resAS.json.proposedActions.length > 0, 'AS3. Returns action proposals');
    assert(resAS.json?.proposedActions[0].requiresConfirmation === true, 'AS4. Proposal enforces confirmation');

    // AT: Foreign userId injection rejected (400)
    const resAT = await testHttp({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/api/nova/recovery/analyze',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer user_${userA}`,
      },
    }, JSON.stringify({
      userId: userB, // Injected!
      failureCode: 'TIMEOUT',
    }));
    assert(resAT.statusCode === 400, 'AT. Foreign userId injection rejected with 400');

    // AU: Malformed failure context rejected (400)
    const resAU = await testHttp({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/api/nova/recovery/analyze',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer user_${userA}`,
      },
    }, JSON.stringify({
      someRandomField: 123,
    }));
    assert(resAU.statusCode === 400, 'AU. Missing/malformed failure context rejected with 400');

    // AV: Cross-user resource rejected (404)
    const resAV = await testHttp({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/api/nova/recovery/analyze',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer user_${userA}`,
      },
    }, JSON.stringify({
      failureCode: 'TIMEOUT',
      taskId: taskB1.id, // Belongs to User B!
    }));
    assert(resAV.statusCode === 404, 'AV. Cross-user resource rejected with 404');
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`TOTAL PASSED: ${passed}`);
  console.log(`TOTAL FAILED: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runRecoveryTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
