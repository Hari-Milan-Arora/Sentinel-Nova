/**
 * Sentinel Nova Day 7 Validation Suite
 *
 * "Research-Grade Intelligence, Observability, Explainability & Experimental Instrumentation"
 *
 * Validates:
 * 1. Structured Decision Telemetry Models (Zero chain-of-thought, zero secrets)
 * 2. Decision Types (PRIORITIZATION, PLANNING, SCHEDULING, REVIEW, CONFIRMATION, EXECUTION, RECOVERY, REPLANNING)
 * 3. Structured Explainability (Why This? Why Now? Why This Time? Why Not The Alternative?)
 * 4. Bounded Confidence Semantics across all agents
 * 5. User Decision Outcomes (ACCEPTED, REJECTED, EDITED, EXPIRED, STALE, EXECUTED, EXECUTION_FAILED, RECOVERED, ABORTED)
 * 6. Research Metrics Engine (17 distinct mathematical metrics, hard constraint violation = 0.0)
 * 7. Deterministic Baseline Comparison Framework (Baseline A, B, C, D, and Sentinel Nova)
 * 8. Deterministic In-Memory Decision Replay Engine
 * 9. Benchmark Fixtures 1 through 10 Invariant Verification
 * 10. Research-Safe Data Export (JSON & CSV sanitization)
 * 11. Multi-Tenant Decision Telemetry Isolation
 */

import { decisionStore } from '../research/decisionStore';
import { generateStructuredExplanation } from '../research/explainability';
import { runBaselineComparison } from '../research/baselineFramework';
import { replayDecision } from '../research/decisionReplay';
import { BENCHMARK_FIXTURES } from '../research/benchmarkFixtures';
import { chiefOfStaffWorkflow } from '../workflow/ChiefOfStaffWorkflow';
import { workflowStore } from '../workflow/workflowStore';
import { createTask, getTaskById, deleteTask, getActiveTasksByUser } from '../../taskStore';
import { savePlanningProfile } from '../../profileStore';
import { setCachedEvents, clearCachedEvents } from '../../calendarStore';
import { prioritizationEngine } from '../agents/PrioritizationEngine';
import { calculateAvailability } from '../../../src/utils/availabilityEngine';
import { selectBestWindow } from '../agents/SchedulingEngine';
import {
  DecisionRecord,
  DecisionType,
  DecisionOutcome,
  ResearchMetricsSummary,
} from '../../../src/types/research';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runDay7Validation() {
  console.log('================================================================');
  console.log('--- SENTINEL NOVA DAY 7: RESEARCH & OBSERVABILITY VALIDATION ---');
  console.log('================================================================\n');

  const userA = 'research_user_alpha';
  const userB = 'research_user_beta';

  for (const t of await getActiveTasksByUser(userA)) await deleteTask(userA, t.id);
  for (const t of await getActiveTasksByUser(userB)) await deleteTask(userB, t.id);
  clearCachedEvents(userA);
  clearCachedEvents(userB);
  decisionStore.clearDecisionsForUser(userA);
  decisionStore.clearDecisionsForUser(userB);

  // Setup standard profile for userA
  const profileA = {
    userId: userA,
    onboardingCompleted: true,
    timezone: 'UTC',
    preferredWorkingHours: {
      startTime: '09:00',
      endTime: '17:00',
      preferredPeriods: ['Morning', 'Afternoon'] as any,
    },
    sleepSchedule: {
      weekdaySleep: '23:00',
      weekdayWake: '07:00',
      weekendDifferent: false,
    },
    recurringBlocks: [
      {
        id: 'rec_lunch',
        title: 'Lunch Break',
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        startTime: '12:00',
        endTime: '13:00',
        category: 'personal',
        priority: 'medium',
      },
    ],
    focusWindowBufferMinutes: 15,
  };
  await savePlanningProfile(userA, profileA as any);

  // -------------------------------------------------------------
  // PHASE 2 & 3: STRUCTURED DECISION TELEMETRY & DECISION TYPES
  // -------------------------------------------------------------
  console.log('--- Phase 2 & 3: Decision Telemetry Model & Decision Types ---');

  const testDecisionId = 'dec_test_001';
  const sampleDecision: DecisionRecord = {
    decisionId: testDecisionId,
    userId: userA,
    workflowId: 'wf_test_001',
    timestamp: new Date().toISOString(),
    decisionType: 'SCHEDULING',
    agentId: 'agent.scheduler',
    agentVersion: '1.0.0',
    strategy: 'focus_alignment',
    inputSummary: {
      taskCount: 4,
      taskId: 't_alpha',
      targetDate: '2026-10-15',
    },
    factorScores: {
      durationFit: 0.94,
      focusAlignment: 0.88,
      deadlinePressure: 0.72,
      workloadBalance: 0.81,
    },
    hardConstraints: {
      sleepSatisfied: true,
      calendarConflictFree: true,
      fixedCommitmentFree: true,
      dependencyReady: true,
      capacityFeasible: true,
    },
    candidateCount: 4,
    candidateSummaries: [
      {
        id: 'w_1',
        rank: 1,
        title: 'Alpha Core Feature',
        score: 0.92,
        fit: 'comfortable',
        window: {
          start: '2026-10-15T09:00:00.000Z',
          end: '2026-10-15T10:30:00.000Z',
          durationMinutes: 90,
        },
      },
      {
        id: 'w_2',
        rank: 2,
        title: 'Alpha Core Feature',
        score: 0.75,
        fit: 'tight',
        window: {
          start: '2026-10-15T14:00:00.000Z',
          end: '2026-10-15T15:30:00.000Z',
          durationMinutes: 90,
        },
      },
    ],
    selectedCandidate: {
      id: 'w_1',
      rank: 1,
      title: 'Alpha Core Feature',
      score: 0.92,
      fit: 'comfortable',
      window: {
        start: '2026-10-15T09:00:00.000Z',
        end: '2026-10-15T10:30:00.000Z',
        durationMinutes: 90,
      },
    },
    alternatives: [
      {
        id: 'w_2',
        rank: 2,
        title: 'Alpha Core Feature',
        score: 0.75,
        fit: 'tight',
        window: {
          start: '2026-10-15T14:00:00.000Z',
          end: '2026-10-15T15:30:00.000Z',
          durationMinutes: 90,
        },
      },
    ],
    confidence: 0.92,
    confidenceLevel: 'High',
    explanation: {
      whyThis: ['High priority milestone in active project.'],
      whyNow: ['Unblocked and fits morning focus window.'],
      whyThisTime: ['Aligns with preferred Morning focus period with zero calendar conflicts.'],
      whyNotAlternative: ['14:00 alternative falls outside peak morning focus.'],
    },
    outcome: 'PENDING',
    latencyMs: 145,
    createdAt: Date.now(),
  };

  await decisionStore.saveDecision(sampleDecision);

  const retrievedDecision = decisionStore.getDecisionById(userA, testDecisionId);
  assert(retrievedDecision !== null, 'D7.1: DecisionRecord successfully persisted and retrieved');
  assert(retrievedDecision?.decisionType === 'SCHEDULING', 'D7.2: DecisionType is SCHEDULING');
  assert(retrievedDecision?.confidence === 0.92, 'D7.3: Confidence score strictly bounded');
  assert(retrievedDecision?.hardConstraints.calendarConflictFree === true, 'D7.4: Hard constraint audit present');
  assert((retrievedDecision as any).prompt === undefined, 'D7.5: Zero raw prompts stored (Privacy Invariant)');
  assert((retrievedDecision as any).chainOfThought === undefined, 'D7.6: Zero chain-of-thought stored');

  // Verify all 8 Decision Types can be recorded
  const decisionTypes: DecisionType[] = [
    'PRIORITIZATION',
    'PLANNING',
    'SCHEDULING',
    'REVIEW',
    'CONFIRMATION',
    'EXECUTION',
    'RECOVERY',
    'REPLANNING',
  ];

  for (const dt of decisionTypes) {
    const rec: DecisionRecord = {
      ...sampleDecision,
      decisionId: `dec_type_${dt}`,
      decisionType: dt,
      agentId: `agent.${dt.toLowerCase()}`,
    };
    await decisionStore.saveDecision(rec);
  }

  const allTypesDecisions = decisionStore.listDecisions(userA);
  assert(allTypesDecisions.length >= 8, 'D7.7: All 8 core decision types persisted in store');

  // -------------------------------------------------------------
  // PHASE 5: STRUCTURED EXPLAINABILITY LAYER
  // -------------------------------------------------------------
  console.log('\n--- Phase 5: Structured Explainability Layer ---');

  const explanation = generateStructuredExplanation({
    taskTitle: 'Critical Security Audit',
    priority: 'urgent',
    dueDate: '2026-10-19',
    dueTime: '17:00',
    estimatedMinutes: 90,
    goalTitle: 'Enterprise Readiness Certification',
    projectTitle: 'Q4 Compliance',
    isBlocked: false,
    unblocksCount: 3,
    selectedWindow: {
      start: '2026-10-19T09:00:00.000Z',
      end: '2026-10-19T10:30:00.000Z',
      inFocusPeriod: true,
      periodName: 'Morning Focus',
      bufferMinutes: 15,
    },
    alternativeWindows: [
      {
        start: '2026-10-19T14:30:00.000Z',
        end: '2026-10-19T16:00:00.000Z',
        inFocusPeriod: false,
        reason: 'Falls outside preferred focus period.',
      },
    ],
  });

  assert(explanation.whyThis.length >= 3, 'EXP.1: Why This provides multiple strategic and priority reasons');
  assert(
    explanation.whyThis.some((r) => r.includes('Enterprise Readiness Certification')),
    'EXP.2: Why This directly references strategic goal'
  );
  assert(
    explanation.whyThis.some((r) => r.includes('unblocks 3 downstream tasks')),
    'EXP.3: Why This cites unblocking downstream impact'
  );
  assert(explanation.whyNow.length >= 2, 'EXP.4: Why Now articulates unblocked status and duration fit');
  assert(
    explanation.whyThisTime !== undefined && explanation.whyThisTime.some((t) => t.includes('Morning Focus')),
    'EXP.5: Why This Time cites focus window alignment'
  );
  assert(
    explanation.whyThisTime !== undefined && explanation.whyThisTime.some((t) => t.includes('Zero conflicts')),
    'EXP.6: Why This Time proves zero calendar conflicts'
  );
  assert(
    explanation.whyNotAlternative !== undefined &&
      explanation.whyNotAlternative.some((a) => a.includes('outside preferred focus period')),
    'EXP.7: Why Not Alternative contrasts lower scoring candidate'
  );

  // -------------------------------------------------------------
  // PHASE 6: CONFIDENCE SEMANTICS
  // -------------------------------------------------------------
  console.log('\n--- Phase 6: Confidence Semantics Audit ---');

  const taskT1 = await createTask(userA, {
    title: 'Top Task 1',
    priority: 'urgent',
    estimatedMinutes: 60,
    dueDate: '2026-10-15',
  });
  const taskT2 = await createTask(userA, {
    title: 'Low Task 2',
    priority: 'low',
    estimatedMinutes: 60,
  });

  const prioResult = prioritizationEngine.generatePrioritization({
    userId: userA,
    tasks: [taskT1, taskT2],
    goals: [],
    projects: [],
  });

  assert(prioResult.confidence >= 0.0 && prioResult.confidence <= 1.0, 'CONF.1: Prioritizer confidence strictly in [0.0, 1.0]');
  assert(prioResult.confidence >= 0.8, 'CONF.2: High separation between urgent and low priority yields high confidence');

  const avail = calculateAvailability({
    dateStr: '2026-10-15',
    profile: profileA as any,
    events: [],
    tasks: [taskT1],
  });
  const schedCandidates = avail.candidateWindowsForTasks[taskT1.id] || [];
  const bestWin = selectBestWindow(taskT1, schedCandidates, 'focus_alignment', { profile: profileA as any });
  assert(bestWin !== null, 'CONF.3: Scheduling engine selects feasible candidate window');
  assert(bestWin!.score >= 0.0 && bestWin!.score <= 1.0, 'CONF.4: Window candidate score strictly bounded [0.0, 1.0]');

  // -------------------------------------------------------------
  // PHASE 7: USER DECISION TELEMETRY (LIFECYCLE OUTCOMES)
  // -------------------------------------------------------------
  console.log('\n--- Phase 7: User Decision Telemetry (Lifecycle Outcomes) ---');

  // Test Outcome 1: ACCEPTED / EXECUTED via ChiefOfStaffWorkflow
  const wfContext = await chiefOfStaffWorkflow.startWorkflow(
    {
      userRequest: 'Mark Top Task 1 as completed',
      intent: 'EXECUTION',
    },
    { userId: userA }
  );

  assert(wfContext.state === 'AWAITING_CONFIRMATION', 'OUT.1: Workflow reaches AWAITING_CONFIRMATION');
  const actionId = wfContext.activeAction!.actionId;

  // Confirm action
  const confirmedWf = await chiefOfStaffWorkflow.confirmAction(
    wfContext.workflowId,
    { actionId },
    { userId: userA }
  );
  assert(confirmedWf.state === 'COMPLETED', 'OUT.2: Confirmed action completed');

  // Verify that telemetry records were updated to EXECUTED
  const decisionsAfterExec = decisionStore.listDecisions(userA, { outcome: 'EXECUTED' });
  assert(decisionsAfterExec.length > 0, 'OUT.3: Telemetry recorded EXECUTED outcome');

  // Test Outcome 2: REJECTED
  const wfReject = await chiefOfStaffWorkflow.startWorkflow(
    {
      userRequest: 'Mark Low Task 2 as completed',
      intent: 'EXECUTION',
    },
    { userId: userA }
  );
  assert(wfReject.state === 'AWAITING_CONFIRMATION', 'OUT.4: Rejection candidate reaches AWAITING_CONFIRMATION');

  await chiefOfStaffWorkflow.rejectAction(
    wfReject.workflowId,
    { actionId: wfReject.activeAction!.actionId, reason: 'Changed mind' },
    { userId: userA }
  );

  const decisionsAfterReject = decisionStore.listDecisions(userA, { outcome: 'REJECTED' });
  assert(decisionsAfterReject.length > 0, 'OUT.5: Telemetry recorded REJECTED outcome');

  // Test Outcome 3: EDITED
  const wfEdit = await chiefOfStaffWorkflow.startWorkflow(
    {
      userRequest: 'Schedule Low Task 2',
      intent: 'SCHEDULING',
      parameters: { taskId: taskT2.id },
    },
    { userId: userA }
  );
  assert(wfEdit.state === 'AWAITING_CONFIRMATION', 'OUT.6: Scheduling candidate ready for edit');

  await chiefOfStaffWorkflow.editAction(
    wfEdit.workflowId,
    {
      actionId: wfEdit.activeAction!.actionId,
      updatedParameters: {
        scheduledStart: '2026-10-15T15:00:00.000Z',
        scheduledEnd: '2026-10-15T16:00:00.000Z',
      },
    },
    { userId: userA }
  );

  const decisionsAfterEdit = decisionStore.listDecisions(userA, { outcome: 'EDITED' });
  assert(decisionsAfterEdit.length > 0, 'OUT.7: Telemetry recorded EDITED outcome');

  // Test Outcome 4: STALE
  // Create an action proposal and then introduce a conflicting event before confirmation
  const tStale = await createTask(userA, {
    title: 'Stale Candidate Task',
    estimatedMinutes: 60,
    priority: 'high',
  });
  const wfStale = await chiefOfStaffWorkflow.startWorkflow(
    {
      userRequest: 'Schedule Stale Candidate Task',
      intent: 'SCHEDULING',
      parameters: { taskId: tStale.id },
    },
    { userId: userA }
  );
  assert(wfStale.state === 'AWAITING_CONFIRMATION', 'OUT.8: Candidate ready for staleness simulation');

  // Introduce conflicting calendar event
  setCachedEvents(userA, [
    {
      id: 'conflict_event',
      title: 'Emergency All-Hands',
      start: wfStale.activeAction!.parameters?.scheduledStart as string,
      end: wfStale.activeAction!.parameters?.scheduledEnd as string,
      transparency: 'opaque',
    },
  ]);

  let staleCaught = false;
  try {
    await chiefOfStaffWorkflow.confirmAction(
      wfStale.workflowId,
      { actionId: wfStale.activeAction!.actionId },
      { userId: userA }
    );
  } catch (err: any) {
    staleCaught = true;
  }
  assert(staleCaught, 'OUT.9: Stale proposal blocked on confirmation attempt');
  const decisionsAfterStale = decisionStore.listDecisions(userA, { outcome: 'STALE' });
  assert(decisionsAfterStale.length > 0, 'OUT.10: Telemetry recorded STALE outcome');

  // -------------------------------------------------------------
  // PHASE 8: RESEARCH METRICS CALCULATION
  // -------------------------------------------------------------
  console.log('\n--- Phase 8: Research Metrics Layer ---');

  const metrics: ResearchMetricsSummary = decisionStore.calculateMetrics(userA);

  assert(metrics.totalDecisions > 0, 'MET.1: Total decisions > 0');
  assert(metrics.totalRecommendations > 0, 'MET.2: Total recommendations recorded');
  assert(metrics.recommendationAcceptanceRate >= 0.0 && metrics.recommendationAcceptanceRate <= 1.0, 'MET.3: Acceptance rate in [0.0, 1.0]');
  assert(metrics.recommendationRejectionRate >= 0.0 && metrics.recommendationRejectionRate <= 1.0, 'MET.4: Rejection rate in [0.0, 1.0]');
  assert(metrics.proposalEditRate >= 0.0 && metrics.proposalEditRate <= 1.0, 'MET.5: Proposal edit rate in [0.0, 1.0]');
  assert(metrics.schedulingFeasibilityRate >= 0.0 && metrics.schedulingFeasibilityRate <= 1.0, 'MET.6: Feasibility rate in [0.0, 1.0]');
  assert(metrics.hardConstraintViolationRate === 0.0, 'MET.7: Hard constraint violation rate strictly 0.0 (Research Invariant)');
  assert(metrics.staleProposalPreventionRate === 1.0, 'MET.8: Stale proposal prevention rate strictly 1.0 (100% intercepted)');
  assert(metrics.confirmationReplayPreventionRate === 1.0, 'MET.9: Confirmation replay prevention rate strictly 1.0');
  assert(metrics.averageDecisionLatencyMs >= 0, 'MET.10: Average decision latency is non-negative');
  assert(metrics.p95DecisionLatencyMs >= metrics.averageDecisionLatencyMs, 'MET.11: P95 latency >= average latency');
  assert(typeof metrics.strategyDistribution === 'object', 'MET.12: Strategy distribution object present');
  assert(typeof metrics.agentActivityDistribution === 'object', 'MET.13: Agent activity distribution present');
  assert(typeof metrics.decisionTypeDistribution === 'object', 'MET.14: Decision type distribution present');

  // -------------------------------------------------------------
  // PHASE 9: DETERMINISTIC BASELINE COMPARISON FRAMEWORK
  // -------------------------------------------------------------
  console.log('\n--- Phase 9: Deterministic Baseline Comparison Framework ---');

  const baselineTasks = [
    {
      id: 't_b1',
      userId: userA,
      title: 'Urgent Bug Fix',
      priority: 'urgent' as const,
      status: 'todo' as const,
      estimatedMinutes: 60,
      dueDate: '2026-10-15',
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    },
    {
      id: 't_b2',
      userId: userA,
      title: 'High Strategic Roadmap',
      priority: 'high' as const,
      status: 'todo' as const,
      estimatedMinutes: 90,
      dueDate: '2026-10-25',
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    },
    {
      id: 't_b3',
      userId: userA,
      title: 'Medium Maintenance',
      priority: 'medium' as const,
      status: 'todo' as const,
      estimatedMinutes: 45,
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    },
  ];

  const baselines = runBaselineComparison({
    userId: userA,
    tasks: baselineTasks,
    profile: profileA as any,
    targetDate: '2026-10-15',
    calendarEvents: [],
  });

  assert(baselines['BASELINE_A'] !== undefined, 'BASE.1: Baseline A (Priority-Only) executed');
  assert(baselines['BASELINE_B'] !== undefined, 'BASE.2: Baseline B (Priority + Deadline) executed');
  assert(baselines['BASELINE_C'] !== undefined, 'BASE.3: Baseline C (Priority + Strategic Planning) executed');
  assert(baselines['BASELINE_D'] !== undefined, 'BASE.4: Baseline D (Planning + Greedy Scheduling) executed');
  assert(baselines['SENTINEL_NOVA'] !== undefined, 'BASE.5: Sentinel Nova Full Multi-Agent executed');

  // Check ordering characteristics
  assert(baselines['BASELINE_A'].taskOrdering[0].taskId === 't_b1', 'BASE.6: Baseline A places urgent task first');
  assert(baselines['BASELINE_B'].taskOrdering[0].taskId === 't_b1', 'BASE.7: Baseline B prioritizes urgent + closest deadline');
  assert(baselines['SENTINEL_NOVA'].hardConstraintViolations === 0, 'BASE.8: Sentinel Nova guarantees 0 hard constraint violations');
  assert(baselines['SENTINEL_NOVA'].feasibleSchedulesCount > 0, 'BASE.9: Sentinel Nova produces feasible schedule candidates');

  // -------------------------------------------------------------
  // PHASE 10: DETERMINISTIC IN-MEMORY DECISION REPLAY ENGINE
  // -------------------------------------------------------------
  console.log('\n--- Phase 10: Deterministic In-Memory Decision Replay Engine ---');

  const actualScore = prioritizationEngine.scoreTask(baselineTasks[0], baselineTasks, new Map(), new Map());
  const replayPrioResult = replayDecision({
    record: {
      ...sampleDecision,
      decisionType: 'PRIORITIZATION',
      factorScores: {
        urgency: actualScore.urgencyScore,
        importance: actualScore.importanceScore,
      },
    },
    reconstructedContext: {
      task: baselineTasks[0],
      allTasks: baselineTasks,
    },
  });

  assert(replayPrioResult.reproducedSuccessfully === true, 'REP.1: Prioritization decision replay reproduced successfully');
  assert(replayPrioResult.matchScores === true, 'REP.2: Replay matches factor scores within epsilon delta');
  assert(replayPrioResult.scoreDifferenceDelta < 0.05, 'REP.3: Score delta is near zero');

  const replaySchedResult = replayDecision({
    record: sampleDecision,
    reconstructedContext: {
      task: baselineTasks[0],
      profile: profileA as any,
    },
  });

  assert(replaySchedResult.reproducedSuccessfully === true, 'REP.4: Scheduling decision replay reproduced successfully');
  assert(replaySchedResult.matchStrategy === true, 'REP.5: Replay preserves scheduling strategy');

  // -------------------------------------------------------------
  // PHASE 11: BENCHMARK FIXTURES 1 TO 10
  // -------------------------------------------------------------
  console.log('\n--- Phase 11: Benchmark Fixtures 1 through 10 Invariants ---');

  const fixtureKeys = Object.keys(BENCHMARK_FIXTURES);
  assert(fixtureKeys.length === 10, 'FIX.0: Exactly 10 standardized research benchmark fixtures defined');

  for (let i = 0; i < fixtureKeys.length; i++) {
    const key = fixtureKeys[i];
    const fix = BENCHMARK_FIXTURES[key];

    const fixAvailability = calculateAvailability({
      dateStr: fix.targetDate,
      profile: fix.profile,
      events: fix.calendarEvents,
      tasks: fix.tasks,
    });

    // Invariant 1: Zero hard constraint violations
    let overlapsSleep = false;
    const sleepWake = fix.profile.sleepSchedule?.weekdayWake || '07:00';
    const sleepStart = fix.profile.sleepSchedule?.weekdaySleep || '23:00';

    for (const fw of fixAvailability.freeWindows) {
      const startHour = fw.start.split('T')[1].slice(0, 5);
      const endHour = fw.end.split('T')[1].slice(0, 5);
      if (startHour < sleepWake || endHour > sleepStart) {
        overlapsSleep = true;
      }
    }
    assert(!overlapsSleep, `FIX.${i + 1}: Fixture ${fix.id} (${fix.name}) strictly enforces sleep rhythm`);

    // Invariant 2: Candidate window feasibility
    for (const t of fix.tasks) {
      const cands = fixAvailability.candidateWindowsForTasks[t.id] || [];
      for (const c of cands) {
        assert(
          c.window.durationMinutes >= (t.estimatedMinutes || 30),
          `FIX.${i + 1}.b: Candidate window duration >= task estimated minutes`
        );
      }
    }
  }

  // -------------------------------------------------------------
  // PHASE 12: RESEARCH-SAFE DATA EXPORT (JSON & CSV)
  // -------------------------------------------------------------
  console.log('\n--- Phase 12: Research-Safe Data Export (JSON & CSV) ---');

  const jsonExport = decisionStore.exportDecisions(userA, 'json');
  assert(typeof jsonExport === 'string' && jsonExport.startsWith('['), 'EXP.1: JSON export produces valid JSON array string');
  const parsedJson = JSON.parse(jsonExport);
  assert(Array.isArray(parsedJson), 'EXP.2: Exported JSON is parseable array');
  assert(parsedJson.length > 0, 'EXP.3: Exported JSON contains records');
  assert(parsedJson[0].anonymizedDecisionId !== undefined, 'EXP.4: Export anonymizes internal IDs');
  assert(parsedJson[0].userId === undefined, 'EXP.5: Export completely strips user email / userId');

  const csvExport = decisionStore.exportDecisions(userA, 'csv');
  assert(typeof csvExport === 'string', 'EXP.6: CSV export produces string');
  const csvLines = csvExport.trim().split('\n');
  assert(csvLines.length >= 2, 'EXP.7: CSV export has header and data rows');
  assert(csvLines[0].includes('anonymizedDecisionId'), 'EXP.8: CSV header contains anonymizedDecisionId');
  assert(!csvLines[0].includes('password') && !csvLines[0].includes('token'), 'EXP.9: CSV contains zero credential headers');

  // -------------------------------------------------------------
  // MULTI-TENANT ISOLATION
  // -------------------------------------------------------------
  console.log('\n--- Multi-Tenant Decision Telemetry Isolation ---');

  const userBDecisions = decisionStore.listDecisions(userB);
  assert(userBDecisions.length === 0, 'ISO.1: User B has 0 decisions initially (Isolated)');

  const userAMetrics = decisionStore.calculateMetrics(userA);
  const userBMetrics = decisionStore.calculateMetrics(userB);
  assert(userBMetrics.totalDecisions === 0, 'ISO.2: User B metrics isolated from User A');
  assert(userAMetrics.totalDecisions > 0, 'ISO.3: User A metrics populated independently');

  console.log('\n================================================================');
  console.log(`--- DAY 7 VALIDATION: ${passedTests} PASSED, 0 FAILED (Total: ${totalTests}) ---`);
  console.log('================================================================');
}

runDay7Validation().catch((err) => {
  console.error('Fatal Day 7 test failure:', err);
  process.exit(1);
});
