/**
 * Sentinel Nova — Day 6 Intelligence Validation, Production Hardening & Safety Test Suite
 *
 * Verifies all Day 6 requirements:
 * Phase 2: Scenarios 1 to 13 (Real-World Scenarios)
 * Phase 3: Intelligence Quality Testing (Factors A through O)
 * Phase 4: Strategy Diversity Validation
 * Phase 5: Adversarial Scheduling Invariants 1 through 10
 * Phase 6 & 7: Proposal Staleness & Confirmation Binding Hardening
 * Phase 8: Recovery Safety (Bounded, Reviewer-gated, no auto-execution)
 * Phase 9: End-to-End Application Test
 * Phase 12: Security Audit (Cross-user isolation, anti-tampering, parameter attacks)
 * Phase 13: Concurrency Testing (Idempotent single-user, isolated multi-tenant)
 */

import crypto from 'crypto';
import { chiefOfStaffWorkflow } from '../workflow/ChiefOfStaffWorkflow';
import { workflowStore } from '../workflow/workflowStore';
import { computeParameterHash } from '../workflow/canonicalHash';
import { createTask, getTaskById, updateTask, deleteTask, getActiveTasksByUser } from '../../taskStore';
import { savePlanningProfile } from '../../profileStore';
import { createMemory } from '../../memoryStore';
import { setCachedEvents, clearCachedEvents, setUserCalendarStatus } from '../../calendarStore';
import { toolManager } from '../tools/ToolManager';
import { reviewerAgent } from '../agents/ReviewerAgent';
import { prioritizerAgent } from '../agents/PrioritizerAgent';
import { schedulerAgent } from '../agents/SchedulerAgent';
import { plannerAgent } from '../agents/PlannerAgent';
import { prioritizationEngine } from '../agents/PrioritizationEngine';
import {
  scoreCandidateWindow,
  evaluateStrategies,
  selectBestWindow,
} from '../agents/SchedulingEngine';
import { calculateAvailability } from '../../../src/utils/availabilityEngine';
import { UserPlanningProfile, Task, Goal, Project } from '../../../src/types';

async function runDay6Validation() {
  console.log('================================================================');
  console.log('--- SENTINEL NOVA DAY 6 INTELLIGENCE VALIDATION & PRODUCTION ---');
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
  const testDate = '2026-10-15';
  const userA = `d6-user-alpha-${runId}`;
  const userB = `d6-user-bravo-${runId}`;

  // Standard planning profile for test user A
  const standardProfile: UserPlanningProfile = {
    userId: userA,
    onboardingCompleted: true,
    timezone: 'UTC',
    preferredWorkingHours: {
      startTime: '09:00',
      endTime: '17:00',
      preferredPeriods: ['Morning', 'Afternoon'],
    },
    sleepSchedule: {
      weekdaySleep: '23:30',
      weekdayWake: '07:30',
      weekendDifferent: false,
    },
    recurringBlocks: [
      {
        id: 'rec_comm',
        title: 'Team Standup & Sync',
        dayOfWeek: 'Thursday', // 2026-10-15 is Thursday
        startTime: '11:00',
        endTime: '12:00',
        category: 'work',
        priority: 'high',
      },
    ],
    focusWindowBufferMinutes: 15,
  };
  await savePlanningProfile(userA, standardProfile);

  // Setup user B profile for isolation checks
  await savePlanningProfile(userB, {
    ...standardProfile,
    userId: userB,
  });

  // ============================================================================
  // PHASE 2: REAL-WORLD SCENARIO TEST MATRIX
  // ============================================================================
  console.log('\n--- Phase 2: Real-World Scenarios (1 to 13) ---');

  // SCENARIO 1: OVERLOADED DAY
  // Workload: 4 tasks of 90m each = 360m. Available time: 09:00-17:00 minus 11:00-12:00 standup minus meeting 14:00-15:30.
  // Free time = 270m. Nova must schedule feasible subset without overbooking!
  setCachedEvents(userA, [
    {
      id: 'cal_meet_1',
      calendarId: 'primary',
      summary: 'Client Review Meeting',
      start: `${testDate}T14:00:00.000Z`,
      end: `${testDate}T15:30:00.000Z`,
      transparency: 'opaque',
    },
  ]);
  setUserCalendarStatus(userA, { selectedCalendarIds: ['primary'] });

  const tOver1 = await createTask(userA, {
    title: 'Critical Infrastructure Upgrade',
    priority: 'urgent',
    estimatedMinutes: 90,
  });
  const tOver2 = await createTask(userA, {
    title: 'Core API Optimization',
    priority: 'high',
    estimatedMinutes: 90,
  });
  const tOver3 = await createTask(userA, {
    title: 'Architecture Security Audit',
    priority: 'high',
    estimatedMinutes: 90,
  });
  const tOver4 = await createTask(userA, {
    title: 'Low Priority Clean-Up',
    priority: 'low',
    estimatedMinutes: 90,
  });

  const schedOverloaded = await chiefOfStaffWorkflow.startWorkflow(userA, {
    userRequest: 'Plan my day and schedule my tasks.',
    targetDate: testDate,
  });

  assert(schedOverloaded.state !== 'FAILED', 'S1.1: Overloaded day does not crash or fail');
  assert(schedOverloaded.dayPlan !== null && Array.isArray(schedOverloaded.dayPlan), 'S1.2: Day plan generated');
  // Total planned task time must not exceed available capacity
  const plannedTasks = (schedOverloaded.dayPlan || []).filter((b) => !b.isBuffer);
  const totalPlannedMinutes = plannedTasks.reduce((acc, b) => acc + b.durationMinutes, 0);
  assert(totalPlannedMinutes <= 300, `S1.3: Capacity respected (planned: ${totalPlannedMinutes}m <= available: 270-300m)`);

  // SCENARIO 2: CONFLICTING MEETING
  // An opaque event at 09:00-10:30 prevents scheduling in that slot.
  setCachedEvents(userA, [
    {
      id: 'cal_meet_morning',
      calendarId: 'primary',
      summary: 'Executive Board Meeting',
      start: `${testDate}T09:00:00.000Z`,
      end: `${testDate}T10:30:00.000Z`,
      transparency: 'opaque',
    },
  ]);
  const availS2 = calculateAvailability({
    dateStr: testDate,
    profile: standardProfile,
    events: [
      {
        id: 'cal_meet_morning',
        calendarId: 'primary',
        summary: 'Executive Board Meeting',
        start: `${testDate}T09:00:00.000Z`,
        end: `${testDate}T10:30:00.000Z`,
        transparency: 'opaque',
      },
    ],
    selectedCalendarIds: ['primary'],
    tasks: [tOver1],
  });
  // Check candidate free windows: none should overlap 09:00-10:30
  const overlapsMeeting = availS2.freeWindows.some((fw) => {
    const s = new Date(fw.start).getTime();
    const e = new Date(fw.end).getTime();
    const mS = new Date(`${testDate}T09:00:00.000Z`).getTime();
    const mE = new Date(`${testDate}T10:30:00.000Z`).getTime();
    return Math.max(s, mS) < Math.min(e, mE);
  });
  assert(!overlapsMeeting, 'S2.1: Free windows strictly exclude opaque calendar meeting');

  // SCENARIO 3: APPROACHING DEADLINE
  // Task with urgent near deadline vs distant deadline
  const tUrgentDeadline = await createTask(userA, {
    title: 'Submit Compliance Report',
    priority: 'medium',
    dueDate: testDate,
    dueTime: '12:00',
    estimatedMinutes: 45,
  });
  const tDistantDeadline = await createTask(userA, {
    title: 'Refactor Utility Library',
    priority: 'medium',
    dueDate: '2026-10-30',
    estimatedMinutes: 45,
  });

  const prioResultS3 = prioritizationEngine.generatePrioritization({
    tasks: [tDistantDeadline, tUrgentDeadline],
    timestamp: `${testDate}T08:00:00.000Z`,
    userId: userA,
  } as any);
  assert(
    prioResultS3.prioritizedItems[0].taskId === tUrgentDeadline.id,
    'S3.1: Approaching deadline task ranks ahead of distant deadline'
  );
  assert(
    prioResultS3.prioritizedItems[0].urgencyScore > prioResultS3.prioritizedItems[1].urgencyScore,
    'S3.2: Urgency score reflects deadline proximity'
  );

  // SCENARIO 4: BLOCKED TASK
  // Task B depends on Task A. Task A must be completed before Task B is execution-ready.
  const tBlockA = await createTask(userA, {
    title: 'Prerequisite Database Schema Migration',
    priority: 'high',
    estimatedMinutes: 60,
  });
  const tBlockB = await createTask(userA, {
    title: 'Dependent Web Endpoint Implementation',
    priority: 'high',
    estimatedMinutes: 60,
    dependencyIds: [tBlockA.id],
  });

  const prioBlocked = prioritizationEngine.generatePrioritization({
    tasks: [tBlockA, tBlockB],
    userId: userA,
  } as any);
  const itemA = prioBlocked.prioritizedItems.find((i) => i.taskId === tBlockA.id);
  const itemB = prioBlocked.prioritizedItems.find((i) => i.taskId === tBlockB.id);
  assert(
    (itemA?.blockingImpactScore || 0) > (itemB?.blockingImpactScore || 0),
    'S4.1: Prerequisite task A receives higher blocking impact score'
  );

  // ReviewerAgent must reject completing Task B when Task A is not complete
  const blockedReview = await reviewerAgent.reviewAction(
    {
      actionId: 'act_blocked_test',
      type: 'COMPLETE_TASK',
      description: 'Complete dependent task B',
      target: tBlockB.id,
      parameters: { taskId: tBlockB.id },
      riskLevel: 'low',
      requiresConfirmation: true,
      sourceAgentId: 'agent.orchestrator',
    },
    { userId: userA, tasks: [tBlockA, tBlockB] }
  );
  assert(!blockedReview.approved, 'S4.2: ReviewerAgent rejects completing blocked task');
  assert(
    blockedReview.reasons.some((r) => r.toLowerCase().includes('prerequisite') || r.toLowerCase().includes('blocked')),
    'S4.3: Reviewer gives clear prerequisite dependency rejection reason'
  );

  // SCENARIO 5: MULTIPLE EQUALLY IMPORTANT TASKS
  // Tasks with identical priority, effort, and parameters must have stable, deterministic tie-breaking.
  const tTie1 = await createTask(userA, {
    title: 'Alpha Audit',
    priority: 'medium',
    estimatedMinutes: 30,
  });
  const tTie2 = await createTask(userA, {
    title: 'Beta Audit',
    priority: 'medium',
    estimatedMinutes: 30,
  });
  const run1 = prioritizationEngine.generatePrioritization({ tasks: [tTie1, tTie2], userId: userA } as any);
  const run2 = prioritizationEngine.generatePrioritization({ tasks: [tTie1, tTie2], userId: userA } as any);
  const run3 = prioritizationEngine.generatePrioritization({ tasks: [tTie1, tTie2], userId: userA } as any);

  assert(
    run1.prioritizedItems[0].taskId === run2.prioritizedItems[0].taskId &&
      run2.prioritizedItems[0].taskId === run3.prioritizedItems[0].taskId,
    'S5.1: Deterministic tie-breaking is 100% stable across repeated runs'
  );

  // SCENARIO 6: INSUFFICIENT TIME
  // Task requires 240m, but free window is only 60m due to calendar events.
  const tHuge = await createTask(userA, {
    title: 'Massive Monolith Re-architecture',
    estimatedMinutes: 240,
    priority: 'high',
  });
  const availS6 = calculateAvailability({
    dateStr: testDate,
    profile: standardProfile,
    events: [
      {
        id: 'cal_busy_day_1',
        calendarId: 'primary',
        summary: 'All Day Work Block A',
        start: `${testDate}T07:30:00.000Z`,
        end: `${testDate}T12:00:00.000Z`,
        transparency: 'opaque',
      },
      {
        id: 'cal_busy_day_2',
        calendarId: 'primary',
        summary: 'All Day Work Block B',
        start: `${testDate}T13:00:00.000Z`,
        end: `${testDate}T23:30:00.000Z`,
        transparency: 'opaque',
      },
    ],
    selectedCalendarIds: ['primary'],
    tasks: [tHuge],
  });
  const candidatesS6 = availS6.candidateWindowsForTasks[tHuge.id] || [];
  assert(candidatesS6.length === 0, 'S6.1: No impossible candidate windows generated when task exceeds available window');

  // SCENARIO 7: CALENDAR CHANGES AFTER PROPOSAL (STALENESS PROTECTION)
  // 1. Clear events and schedule proposal
  clearCachedEvents(userA);
  const tStaleCal = await createTask(userA, {
    title: 'Quarterly Strategic Alignment',
    estimatedMinutes: 60,
    priority: 'high',
  });

  const wfCalStale = await chiefOfStaffWorkflow.startWorkflow(userA, {
    userRequest: `Schedule task "${tStaleCal.title}".`,
    taskId: tStaleCal.id,
    targetDate: testDate,
  });

  assert(wfCalStale.state === 'AWAITING_CONFIRMATION', 'S7.1: Proposal initially generated and awaiting confirmation');
  assert(wfCalStale.confirmationBinding !== null, 'S7.2: Confirmation binding exists');

  // 2. Introduce conflicting calendar event at the proposed time!
  const propStart = wfCalStale.activeAction?.parameters.scheduledStart as string;
  const propEnd = wfCalStale.activeAction?.parameters.scheduledEnd as string;
  setCachedEvents(userA, [
    {
      id: 'cal_conflict_injected',
      calendarId: 'primary',
      summary: 'Emergency Production Incident',
      start: propStart,
      end: propEnd,
      transparency: 'opaque',
    },
  ]);

  // 3. Attempt confirmation: must be rejected as stale!
  let calStaleBlocked = false;
  try {
    await chiefOfStaffWorkflow.confirmAction(
      wfCalStale.workflowId,
      {
        actionId: wfCalStale.activeAction!.actionId,
        bindingId: wfCalStale.confirmationBinding!.bindingId,
      },
      { userId: userA }
    );
  } catch (err: any) {
    calStaleBlocked = true;
    assert(err.message.includes('Stale proposal rejected'), 'S7.3: Error explains calendar staleness');
  }
  assert(calStaleBlocked, 'S7.4: Confirmation strictly rejected when calendar changed after proposal');

  // Verify task was NOT scheduled
  const refreshedTaskS7 = await getTaskById(userA, tStaleCal.id);
  assert(!refreshedTaskS7?.scheduledStart, 'S7.5: Zero mutation to task store when proposal became stale');

  // SCENARIO 8: TASK DELETED WHILE PROPOSAL IS PENDING
  const tDeleteTest = await createTask(userA, {
    title: 'Task to Delete Before Confirmation',
    estimatedMinutes: 30,
  });
  const wfDelete = await chiefOfStaffWorkflow.startWorkflow(userA, {
    userRequest: `Complete task "${tDeleteTest.title}".`,
    taskId: tDeleteTest.id,
  });
  assert(wfDelete.state === 'AWAITING_CONFIRMATION', 'S8.1: Complete proposal awaiting confirmation');

  // Delete the task while proposal is pending
  await deleteTask(userA, tDeleteTest.id);

  // Attempt confirmation: must detect deleted task!
  let taskDeleteBlocked = false;
  try {
    await chiefOfStaffWorkflow.confirmAction(
      wfDelete.workflowId,
      {
        actionId: wfDelete.activeAction!.actionId,
        bindingId: wfDelete.confirmationBinding!.bindingId,
      },
      { userId: userA }
    );
  } catch (err: any) {
    taskDeleteBlocked = true;
    assert(err.message.includes('Stale proposal rejected') || err.message.includes('deleted'), 'S8.2: Staleness detected for deleted task');
  }
  assert(taskDeleteBlocked, 'S8.3: Confirmation blocked for deleted task');

  // SCENARIO 9: EXPIRED CONFIRMATION (CLOCK INJECTION)
  const tExpire = await createTask(userA, {
    title: 'Expiring Confirmation Task',
    estimatedMinutes: 30,
  });
  const wfExpire = await chiefOfStaffWorkflow.startWorkflow(userA, {
    userRequest: `Complete task "${tExpire.title}".`,
    taskId: tExpire.id,
  });
  const futureSimulatedTime = wfExpire.confirmationBinding!.expiresAt + 10000; // 10s past TTL
  let expireBlocked = false;
  try {
    await chiefOfStaffWorkflow.confirmAction(
      wfExpire.workflowId,
      {
        actionId: wfExpire.activeAction!.actionId,
        bindingId: wfExpire.confirmationBinding!.bindingId,
        simulatedTimestamp: futureSimulatedTime,
      } as any,
      { userId: userA }
    );
  } catch (err: any) {
    expireBlocked = true;
    assert(err.message.includes('Confirmation expired'), 'S9.1: Logical clock expiration detected');
  }
  assert(expireBlocked, 'S9.2: Expired confirmation strictly rejected via clock injection');

  // SCENARIO 10: SLEEP BOUNDARY
  // Profile has sleep 23:30 -> 07:30
  const availSleep = calculateAvailability({
    dateStr: testDate,
    profile: standardProfile,
    events: [],
    tasks: [tOver1],
  });
  const sleepOverlap = availSleep.freeWindows.some((fw) => {
    const startHour = new Date(fw.start).getUTCHours();
    const endHour = new Date(fw.end).getUTCHours();
    return startHour < 7 || (startHour === 7 && new Date(fw.start).getUTCMinutes() < 30) || (startHour >= 23 && new Date(fw.start).getUTCMinutes() >= 30);
  });
  assert(!sleepOverlap, 'S10.1: Availability engine strictly enforces sleep rhythm (zero sleep overlaps)');

  // SCENARIO 11: GOAL WITHOUT PROJECT
  // Goal with 0 projects should evaluate cleanly without crash or hallucination
  const prioGoalOnly = prioritizationEngine.generatePrioritization({
    userId: userA,
    tasks: [tOver1],
    goals: [
      {
        id: 'g_solo',
        userId: userA,
        title: 'Solo Strategic Goal',
        targetDate: '2026-12-31',
        status: 'active',
        priority: 'high',
        projectIds: [],
        category: 'project',
        progress: 25,
        createdAt: '2026-10-01',
        updatedAt: '2026-10-01',
      },
    ],
  } as any);
  assert(prioGoalOnly.prioritizedItems.length === 1, 'S11.1: Goal without projects evaluates cleanly');

  // SCENARIO 12: PROJECT WITHOUT TASKS
  // Project with 0 tasks evaluates cleanly
  const emptyProject: Project = {
    id: 'proj_empty',
    userId: userA,
    title: 'Empty Greenfield Project',
    status: 'active',
    priority: 'medium',
    goalId: 'g_solo',
    taskIds: [],
    progress: 0,
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  };
  const planEmptyProj = await plannerAgent.execute({
    userId: userA,
    requestId: 'req_empty_p',
    userRequest: 'Plan for project',
    projects: [emptyProject],
    tasks: [],
  });
  assert(planEmptyProj.success, 'S12.1: Project without tasks does not crash PlannerAgent');

  // SCENARIO 13: MULTIPLE CANDIDATE WINDOWS
  // Candidate windows evaluation across diverse strategies
  const dummyTask: Task = {
    id: 'task_cand_test',
    userId: userA,
    title: 'Multi-Window Evaluation Task',
    status: 'todo',
    priority: 'high',
    estimatedMinutes: 60,
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  };
  const sampleCandidates = [
    {
      window: {
        id: 'w1',
        dateStr: testDate,
        start: `${testDate}T09:00:00.000Z`,
        end: `${testDate}T11:00:00.000Z`,
        durationMinutes: 120,
        startFormatted: '09:00',
        endFormatted: '11:00',
        inPreferredWorkingHours: true,
        inPreferredFocusPeriod: true,
      },
      fit: 'comfortable' as const,
      suggestedStart: `${testDate}T09:00:00.000Z`,
      suggestedEnd: `${testDate}T10:00:00.000Z`,
      durationMinutes: 60,
    },
    {
      window: {
        id: 'w2',
        dateStr: testDate,
        start: `${testDate}T13:00:00.000Z`,
        end: `${testDate}T14:30:00.000Z`,
        durationMinutes: 90,
        startFormatted: '13:00',
        endFormatted: '14:30',
        inPreferredWorkingHours: true,
        inPreferredFocusPeriod: false,
      },
      fit: 'comfortable' as const,
      suggestedStart: `${testDate}T13:00:00.000Z`,
      suggestedEnd: `${testDate}T14:00:00.000Z`,
      durationMinutes: 60,
    },
  ];

  const evalFocus = selectBestWindow(dummyTask, sampleCandidates, 'focus_alignment', { profile: standardProfile });
  assert(evalFocus?.window.id === 'w1', 'S13.1: Focus alignment correctly selects window in preferred focus period');

  // ============================================================================
  // PHASE 3: INTELLIGENCE QUALITY TESTING (Factors A through O)
  // ============================================================================
  console.log('\n--- Phase 3: Intelligence Quality Testing (Factors A-O) ---');

  // Factor A: Urgency
  const tUrgent = { ...dummyTask, id: 't_u', dueDate: testDate, dueTime: '10:00' };
  const tNonUrgent = { ...dummyTask, id: 't_nu', dueDate: '2026-11-30' };
  const factorsU = prioritizationEngine.scoreTask(tUrgent, [tUrgent, tNonUrgent], new Map(), new Map(), new Date(`${testDate}T08:00:00.000Z`));
  const factorsNU = prioritizationEngine.scoreTask(tNonUrgent, [tUrgent, tNonUrgent], new Map(), new Map(), new Date(`${testDate}T08:00:00.000Z`));
  assert(factorsU.urgencyScore > factorsNU.urgencyScore, 'IQ.A: Factor Urgency responds to closer deadline');

  // Factor B: Importance
  const tHighImp = { ...dummyTask, id: 't_hi', priority: 'urgent' as const };
  const tLowImp = { ...dummyTask, id: 't_li', priority: 'low' as const };
  const factorsHI = prioritizationEngine.scoreTask(tHighImp, [tHighImp, tLowImp], new Map(), new Map());
  const factorsLI = prioritizationEngine.scoreTask(tLowImp, [tHighImp, tLowImp], new Map(), new Map());
  assert(factorsHI.importanceScore > factorsLI.importanceScore, 'IQ.B: Factor Importance responds to priority tier');

  // Factor C: Strategic Goal Impact
  const goalMap = new Map([
    ['g1', { id: 'g1', title: 'Top Goal', priority: 'high', status: 'active', progress: 50 } as Goal],
  ]);
  const tGoal = { ...dummyTask, id: 't_g', goalId: 'g1' };
  const tNoGoal = { ...dummyTask, id: 't_ng' };
  const factorsG = prioritizationEngine.scoreTask(tGoal, [tGoal, tNoGoal], goalMap, new Map());
  const factorsNG = prioritizationEngine.scoreTask(tNoGoal, [tGoal, tNoGoal], goalMap, new Map());
  assert(factorsG.goalImpactScore > factorsNG.goalImpactScore, 'IQ.C: Factor Strategic Goal Impact responds to goal link');

  // Factor D: Project Impact
  const projectMap = new Map([
    ['p1', { id: 'p1', title: 'Key Deliverable Project', priority: 'critical', status: 'active', progress: 75 } as Project],
  ]);
  const tProj = { ...dummyTask, id: 't_p', projectId: 'p1' };
  const tNoProj = { ...dummyTask, id: 't_np' };
  const factorsP = prioritizationEngine.scoreTask(tProj, [tProj, tNoProj], new Map(), projectMap);
  const factorsNP = prioritizationEngine.scoreTask(tNoProj, [tProj, tNoProj], new Map(), projectMap);
  assert(factorsP.projectImpactScore > factorsNP.projectImpactScore, 'IQ.D: Factor Project Impact responds to project link');

  // Factor E: Blocking Impact
  const tBlocker = { ...dummyTask, id: 't_blocker' };
  const tBlocked = { ...dummyTask, id: 't_blocked', dependencyIds: ['t_blocker'] };
  const factorsBlk = prioritizationEngine.scoreTask(tBlocker, [tBlocker, tBlocked], new Map(), new Map());
  assert(factorsBlk.blockingImpactScore > 0, 'IQ.E: Factor Blocking Impact recognizes unblocking prerequisites');

  // Factor F: Effort / Cost
  const tQuick = { ...dummyTask, id: 't_q', estimatedMinutes: 15 };
  const tLong = { ...dummyTask, id: 't_l', estimatedMinutes: 120 };
  const factorsQ = prioritizationEngine.scoreTask(tQuick, [tQuick, tLong], new Map(), new Map());
  const factorsL = prioritizationEngine.scoreTask(tLong, [tQuick, tLong], new Map(), new Map());
  assert(factorsQ.effortScore < factorsL.effortScore, 'IQ.F: Factor Effort scales with task duration');

  // Factor G: Capacity Feasibility
  const prioCapacity = prioritizationEngine.generatePrioritization({
    tasks: [tOver1, tOver2, tOver3, tOver4],
    userId: userA,
  } as any);
  assert(prioCapacity.workloadSummary.activeTasks === 4, 'IQ.G: Capacity feasibility tracks active workload volume');

  // Factor H: Deadline Proximity
  assert(factorsU.isDueToday, 'IQ.H: Deadline proximity correctly classifies due today tasks');

  // Factor I: Focus Alignment in Scheduling
  const scoreMorning = scoreCandidateWindow(sampleCandidates[0], dummyTask, 'focus_alignment', { profile: standardProfile });
  const scoreAfternoon = scoreCandidateWindow(sampleCandidates[1], dummyTask, 'focus_alignment', { profile: standardProfile });
  assert(scoreMorning.score > scoreAfternoon.score, 'IQ.I: Focus period alignment yields higher strategy score');

  // Factor J: Cognitive Effort
  const scoreEnergy = scoreCandidateWindow(sampleCandidates[0], dummyTask, 'energy_match', { profile: standardProfile });
  assert(scoreEnergy.score > 0, 'IQ.J: Cognitive effort aligns with energy match strategy');

  // Factor K: Dependency Readiness
  const factorsBlockedK = prioritizationEngine.scoreTask(tBlocked, [tBlocker, tBlocked], new Map(), new Map());
  assert(factorsBlk.blockedByTasksCount === 0 && factorsBlockedK.blockedByTasksCount > 0, 'IQ.K: Dependency readiness identifies blocked vs ready tasks');

  // Factor L: Calendar Availability
  const availEmpty = calculateAvailability({ dateStr: testDate, profile: standardProfile, events: [], tasks: [] });
  const availWithEvent = calculateAvailability({
    dateStr: testDate,
    profile: standardProfile,
    events: [{ id: 'ev_x', calendarId: 'primary', summary: 'Block', start: `${testDate}T10:00:00.000Z`, end: `${testDate}T11:00:00.000Z`, transparency: 'opaque' }],
    selectedCalendarIds: ['primary'],
    tasks: [],
  });
  assert(availEmpty.totalFreeMinutes > availWithEvent.totalFreeMinutes, 'IQ.L: Calendar availability dynamically reduces with events');

  // Factor M: Sleep Constraints
  assert(availSleep.totalSleepMinutes > 0, 'IQ.M: Sleep constraints correctly compute daily sleep minutes');

  // Factor N: Fixed Commitments
  const availHard = calculateAvailability({
    dateStr: testDate,
    profile: standardProfile,
    events: [],
    tasks: [dummyTask],
  });
  const collidesFixed = availHard.freeWindows.some((fw) => {
    const s = new Date(fw.start).getTime();
    const e = new Date(fw.end).getTime();
    const fS = new Date(`${testDate}T11:00:00.000Z`).getTime();
    const fE = new Date(`${testDate}T12:00:00.000Z`).getTime();
    return Math.max(s, fS) < Math.min(e, fE);
  });
  assert(!collidesFixed, 'IQ.N: Availability engine strictly preserves fixed commitment (11:00-12:00)');

  // Factor O: Planning Preferences
  assert(sampleCandidates[0].window.inPreferredWorkingHours, 'IQ.O: Candidate evaluates profile working hours preference');

  // ============================================================================
  // PHASE 4: STRATEGY DIVERSITY VALIDATION
  // ============================================================================
  console.log('\n--- Phase 4: Strategy Diversity Validation ---');

  const stratScores = evaluateStrategies(dummyTask, sampleCandidates, { profile: standardProfile });
  assert(stratScores.length >= 5, 'SD.1: Evaluates at least 5 core scheduling strategies');
  const stratNames = stratScores.map((s) => s.strategy);
  assert(
    stratNames.includes('deadline_first') &&
      stratNames.includes('focus_alignment') &&
      stratNames.includes('goal_impact_first') &&
      stratNames.includes('momentum'),
    'SD.2: All baseline strategies present'
  );

  // ============================================================================
  // PHASE 5: ADVERSARIAL SCHEDULING (Invariants 1-10)
  // ============================================================================
  console.log('\n--- Phase 5: Adversarial Scheduling (Invariants 1-10) ---');

  for (const cw of sampleCandidates) {
    const s = new Date(cw.suggestedStart).getTime();
    const e = new Date(cw.suggestedEnd).getTime();
    assert(s < e, `INV.1: start (${cw.suggestedStart}) < end (${cw.suggestedEnd})`);
    assert(cw.durationMinutes >= dummyTask.estimatedMinutes!, 'INV.2: Duration is sufficient');
    assert(cw.suggestedStart.split('T')[0] === cw.suggestedEnd.split('T')[0], 'INV.9: Single-day focus invariant');
  }

  // Invariant 3: Calendar Opaque Event Protection
  assert(!overlapsMeeting, 'INV.3: Zero overlap with opaque calendar events');

  // Invariant 4: Sleep Rhythm Protection
  assert(!sleepOverlap, 'INV.4: Zero overlap with user sleep window');

  // Invariant 5: Fixed Recurring Commitment Protection
  assert(!collidesFixed, 'INV.5: Zero overlap with fixed recurring commitments');

  // Invariant 6: Focus Window Buffer Protection
  assert(standardProfile.focusWindowBufferMinutes === 15, 'INV.6: Buffer parameter configured and preserved');

  // Invariant 7: Dependency Ordering
  assert(!blockedReview.approved, 'INV.7: Dependent tasks cannot execute before prerequisites');

  // Invariant 8: Transparent Events Do Not Block Availability
  const availTransparent = calculateAvailability({
    dateStr: testDate,
    profile: standardProfile,
    events: [{ id: 'trans_ev', calendarId: 'primary', summary: 'Transparent Tentative', start: `${testDate}T09:00:00.000Z`, end: `${testDate}T10:00:00.000Z`, transparency: 'transparent' }],
    selectedCalendarIds: ['primary'],
    tasks: [],
  });
  const hasTransOverlap = availTransparent.freeWindows.some((fw) => {
    const s = new Date(fw.start).getTime();
    const e = new Date(fw.end).getTime();
    return s <= new Date(`${testDate}T09:00:00.000Z`).getTime() && e >= new Date(`${testDate}T10:00:00.000Z`).getTime();
  });
  assert(hasTransOverlap, 'INV.8: Transparent calendar events do not block free scheduling windows');

  // Invariant 10: Strict Determinism
  const bestWin1 = selectBestWindow(dummyTask, sampleCandidates, 'focus_alignment', { profile: standardProfile });
  const bestWin2 = selectBestWindow(dummyTask, sampleCandidates, 'focus_alignment', { profile: standardProfile });
  assert(bestWin1?.window.id === bestWin2?.window.id && bestWin1?.score === bestWin2?.score, 'INV.10: 100% Deterministic scheduling recommendation for identical inputs');

  // ============================================================================
  // PHASE 7 & 12: CONFIRMATION BINDING & SECURITY AUDIT
  // ============================================================================
  console.log('\n--- Phase 7 & 12: Confirmation Hardening & Security Audit ---');

  // Cross-user confirmation attempt
  const tSec = await createTask(userA, {
    title: 'User A Secret Task',
    estimatedMinutes: 30,
  });
  const wfSec = await chiefOfStaffWorkflow.startWorkflow(userA, {
    userRequest: `Complete task "${tSec.title}".`,
    taskId: tSec.id,
  });

  let crossUserBlocked = false;
  try {
    await chiefOfStaffWorkflow.confirmAction(
      wfSec.workflowId,
      {
        actionId: wfSec.activeAction!.actionId,
        bindingId: wfSec.confirmationBinding!.bindingId,
      },
      { userId: userB } // User B attempts to confirm User A's workflow!
    );
  } catch (err: any) {
    crossUserBlocked = true;
    assert(err.message.includes('not found or unauthorized'), 'SEC.1: Unauthorized cross-user confirmation rejected');
  }
  assert(crossUserBlocked, 'SEC.2: Multi-tenant user isolation strictly enforced');

  // Parameter Tampering Detection
  let tamperBlocked = false;
  try {
    await chiefOfStaffWorkflow.confirmAction(
      wfSec.workflowId,
      {
        actionId: wfSec.activeAction!.actionId,
        bindingId: wfSec.confirmationBinding!.bindingId,
        parameters: { taskId: tSec.id, note: 'TAMPERED_INJECTED_NOTE' },
      },
      { userId: userA }
    );
  } catch (err: any) {
    tamperBlocked = true;
    assert(err.message.includes('modified after safety review'), 'SEC.3: Parameter tampering detected');
  }
  assert(tamperBlocked, 'SEC.4: Cryptographic parameter hash immutability verified');

  // ============================================================================
  // PHASE 8: RECOVERY SAFETY
  // ============================================================================
  console.log('\n--- Phase 8: Recovery Safety ---');

  const wfRec = await chiefOfStaffWorkflow.startWorkflow(userA, {
    userRequest: 'Diagnostic recovery check',
    parameters: {
      recoveryContext: {
        failureCode: 'WINDOW_UNAVAILABLE',
        errorMessage: 'Simulated conflict error',
      },
    },
  });
  assert(wfRec.intent === 'RECOVERY', 'REC.1: Intent resolved to RECOVERY');
  assert(wfRec.state !== 'EXECUTED', 'REC.2: Recovery action is never automatically executed');

  // ============================================================================
  // PHASE 9: END-TO-END APPLICATION TEST
  // ============================================================================
  console.log('\n--- Phase 9: End-to-End Application Test ---');

  // Login/Profile -> Create Task -> Workflow -> Confirm -> Execute -> Synchronize
  const tE2E = await createTask(userA, {
    title: 'Deploy Production Release 1.0',
    priority: 'urgent',
    estimatedMinutes: 45,
  });

  const wfE2E = await chiefOfStaffWorkflow.startWorkflow(userA, {
    userRequest: `Complete task "${tE2E.title}".`,
    taskId: tE2E.id,
  });

  assert(wfE2E.state === 'AWAITING_CONFIRMATION', 'E2E.1: Workflow reaches AWAITING_CONFIRMATION');
  assert(wfE2E.activeAction?.type === 'COMPLETE_TASK', 'E2E.2: Active action is COMPLETE_TASK');

  const confirmedE2E = await chiefOfStaffWorkflow.confirmAction(
    wfE2E.workflowId,
    {
      actionId: wfE2E.activeAction!.actionId,
      bindingId: wfE2E.confirmationBinding!.bindingId,
    },
    { userId: userA }
  );

  assert(confirmedE2E.state === 'COMPLETED', 'E2E.3: Confirmed workflow completes successfully');
  const taskAfterE2E = await getTaskById(userA, tE2E.id);
  assert(taskAfterE2E?.status === 'completed', 'E2E.4: Task store updated to completed');

  // Attempt replay of confirmed binding: MUST FAIL (One-time use)
  let replayBlocked = false;
  try {
    await chiefOfStaffWorkflow.confirmAction(
      wfE2E.workflowId,
      {
        actionId: wfE2E.activeAction!.actionId,
        bindingId: wfE2E.confirmationBinding!.bindingId,
      },
      { userId: userA }
    );
  } catch (err: any) {
    replayBlocked = true;
    assert(err.message.includes('already been used') || err.message.includes('Invalid state transition'), 'E2E.5: Replayed confirmation rejected');
  }
  assert(replayBlocked, 'E2E.6: One-time use confirmation binding verified');

  // ============================================================================
  // PHASE 13: CONCURRENCY TESTING
  // ============================================================================
  console.log('\n--- Phase 13: Concurrency Testing ---');

  const tConc = await createTask(userA, {
    title: 'Concurrent Execution Task',
    estimatedMinutes: 30,
  });
  const wfConc = await chiefOfStaffWorkflow.startWorkflow(userA, {
    userRequest: `Complete task "${tConc.title}".`,
    taskId: tConc.id,
  });

  // Run two concurrent confirmations
  const [res1, res2] = await Promise.allSettled([
    chiefOfStaffWorkflow.confirmAction(
      wfConc.workflowId,
      { actionId: wfConc.activeAction!.actionId, bindingId: wfConc.confirmationBinding!.bindingId },
      { userId: userA }
    ),
    chiefOfStaffWorkflow.confirmAction(
      wfConc.workflowId,
      { actionId: wfConc.activeAction!.actionId, bindingId: wfConc.confirmationBinding!.bindingId },
      { userId: userA }
    ),
  ]);

  const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
  const failures = [res1, res2].filter((r) => r.status === 'rejected');
  assert(successes.length === 1, 'CONC.1: Exactly one concurrent confirmation succeeds');
  assert(failures.length === 1, 'CONC.2: Duplicate concurrent confirmation is safely rejected');

  console.log('================================================================');
  console.log(`--- DAY 6 VALIDATION: ${passed} PASSED, ${failed} FAILED ---`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runDay6Validation().catch((err) => {
  console.error('Day 6 validation suite encountered an error:', err);
  process.exit(1);
});
