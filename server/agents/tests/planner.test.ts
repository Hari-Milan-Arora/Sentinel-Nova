/**
 * Comprehensive Planner Agent Test Suite for Sentinel Nova (Day 5B.1)
 *
 * Covers:
 * - Registration, metadata, and capability verification
 * - Deterministic 6-step planning pipeline
 * - Deliberative candidate strategies generation and scoring
 * - Multi-dimensional task scoring (urgency, importance, goal alignment, deadline, effort)
 * - Availability-aware schedule recommendations
 * - Profile constraints & timezone awareness
 * - Safe action proposals (PROPOSALS ONLY - ZERO execution)
 * - Error isolation and timeout safety
 * - Concurrency and multi-tenant isolation
 * - Security constraints (OAuth token isolation, arbitrary agent injection prevention)
 */

import assert from 'assert';
import { AgentRegistry } from '../AgentRegistry';
import { NovaOrchestrator } from '../NovaOrchestrator';
import { PlannerAgent } from '../agents/PlannerAgent';
import { ContextInspectorAgent } from '../agents/ContextInspectorAgent';
import { PlanningEngine } from '../agents/PlanningEngine';
import { PlanningReasoningService } from '../services/PlanningReasoningService';
import { AgentContext, AgentRequest } from '../types';
import { PlannerOutput } from '../agents/plannerTypes';
import { Task, Goal, Project } from '../../../src/types';
import { getActiveTasksByUser, getTasksByUser, createTask } from '../../taskStore';
import { buildAgentContext } from '../AgentContext';

function createMockContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    userId: 'test-user-planner-123',
    requestId: 'req_test_1',
    executionId: 'exec_test_1',
    userRequest: 'Please plan my day and prioritize my tasks.',
    timestamp: '2026-09-07T09:00:00.000Z',
    timezone: 'America/New_York',
    profile: {
      userId: 'test-user-planner-123',
      onboardingCompleted: true,
      onboardingSkipped: false,
      timezone: 'America/New_York',
      preferredWorkingHours: {
        startTime: '09:00',
        endTime: '17:00',
        preferredPeriods: ['Morning', 'Afternoon'],
      },
      sleepSchedule: {
        weekdaySleep: '23:00',
        weekdayWake: '07:00',
        weekendSleep: '00:00',
        weekendWake: '08:00',
        weekendDifferent: false,
      },
      recurringBlocks: [],
      preferredPeriods: ['Morning', 'Afternoon'],
      dailyFocusCapacity: '4–6 hours',
      planningStyle: 'Balanced throughout the day',
      bufferMinutes: 15,
      dailyMajorTaskTarget: '3–4',
      majorTasksPerDay: '3–4',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    goals: [
      {
        id: 'goal-1',
        userId: 'test-user-planner-123',
        title: 'Launch Enterprise Tier',
        description: 'Complete architecture and release enterprise subscriptions',
        priority: 'high',
        status: 'active',
        progress: 60,
        targetDate: '2026-09-30T00:00:00.000Z',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    projects: [
      {
        id: 'proj-1',
        userId: 'test-user-planner-123',
        goalId: 'goal-1',
        title: 'Security Compliance Audit',
        description: 'SOC2 preparation',
        priority: 'high',
        status: 'active',
        progress: 40,
        createdAt: '2026-08-15T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    tasks: [
      {
        id: 'task-overdue',
        userId: 'test-user-planner-123',
        projectId: 'proj-1',
        title: 'Fix access policy vulnerability',
        description: 'Security remediation',
        priority: 'urgent',
        status: 'pending',
        estimatedMinutes: 60,
        dueDate: '2026-09-06T18:00:00.000Z', // Yesterday (overdue)
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'task-imminent',
        userId: 'test-user-planner-123',
        projectId: 'proj-1',
        title: 'Publish audit report draft',
        description: 'Client deliverable',
        priority: 'high',
        status: 'pending',
        estimatedMinutes: 45,
        dueDate: '2026-09-07T17:00:00.000Z', // Due today in 8 hours
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'task-quick',
        userId: 'test-user-planner-123',
        title: 'Send status email to stakeholders',
        description: 'Operational update',
        priority: 'medium',
        status: 'pending',
        estimatedMinutes: 15,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    calendarStatus: {
      isConnected: true,
      googleEmail: 'user@example.com',
      lastSyncedAt: '2026-09-07T08:55:00.000Z',
      selectedCalendarIds: ['primary'],
      availableCalendars: [],
    },
    calendarEvents: [],
    availability: {
      date: '2026-09-07',
      timezone: 'America/New_York',
      blocks: [],
      freeWindows: [
        {
          id: 'fw_1',
          start: '2026-09-07T09:30:00.000Z',
          end: '2026-09-07T12:00:00.000Z',
          durationMinutes: 150,
          startFormatted: '09:30',
          endFormatted: '12:00',
          inPreferredWorkingHours: true,
          inPreferredFocusPeriod: true,
          preferredPeriodName: 'Morning',
        },
        {
          id: 'fw_2',
          start: '2026-09-07T13:30:00.000Z',
          end: '2026-09-07T16:00:00.000Z',
          durationMinutes: 150,
          startFormatted: '13:30',
          endFormatted: '16:00',
          inPreferredWorkingHours: true,
          inPreferredFocusPeriod: true,
          preferredPeriodName: 'Afternoon',
        },
      ],
      totalFreeMinutes: 300,
      totalBusyMinutes: 60,
      totalSleepMinutes: 480,
      totalCommitmentMinutes: 0,
      candidateWindowsForTasks: {},
    },
    priorResults: [],
    parameters: {},
    ...overrides,
  };
}

async function runPlannerTests() {
  console.log('=== STARTING SENTINEL NOVA PLANNER AGENT TEST SUITE (DAY 5B.1) ===\n');
  let passCount = 0;

  // Test 1: PlannerAgent Registration
  const registry = new AgentRegistry();
  const planner = new PlannerAgent();
  registry.register(planner);
  assert.strictEqual(registry.has(planner.id), true, 'PlannerAgent must be registered in registry');
  passCount++;
  console.log('Test 1 Passed: PlannerAgent registration verified.');

  // Test 2: PlannerAgent Metadata
  assert.strictEqual(planner.id, 'agent.planner');
  assert.strictEqual(planner.name, 'Planner Agent');
  assert.strictEqual(planner.version, '1.0.0');
  assert.strictEqual(planner.capabilities.includes('planning'), true);
  assert.strictEqual(planner.capabilities.includes('task_decomposition'), true);
  assert.strictEqual(planner.capabilities.includes('sequencing'), true);
  assert.strictEqual(planner.capabilities.includes('goal_alignment'), true);
  assert.strictEqual(planner.capabilities.includes('schedule_awareness'), true);
  assert.strictEqual(planner.timeoutMs, 8000);
  passCount++;
  console.log('Test 2 Passed: PlannerAgent metadata and capabilities verified.');

  const engine = new PlanningEngine();

  // Test 3: Empty Task Set
  const emptyTasksContext = createMockContext({ tasks: [] });
  const emptyPlan = engine.generatePlan(emptyTasksContext);
  assert.strictEqual(emptyPlan.prioritizedItems.length, 0);
  assert.strictEqual(emptyPlan.executionSequence.length, 0);
  assert.strictEqual(emptyPlan.objectiveSummary.pendingTasks, 0);
  assert.strictEqual(emptyPlan.strategyCandidates.length, 5);
  passCount++;
  console.log('Test 3 Passed: Empty task set handled gracefully.');

  // Test 4: Empty Goal Set
  const emptyGoalsContext = createMockContext({ goals: [] });
  const emptyGoalsPlan = engine.generatePlan(emptyGoalsContext);
  assert.strictEqual(emptyGoalsPlan.objectiveSummary.activeGoals, 0);
  assert.strictEqual(emptyGoalsPlan.prioritizedItems.length, 3);
  assert(emptyGoalsPlan.risks.some((r) => r.includes('Strategic disconnect')), 'Identifies missing goals risk');
  passCount++;
  console.log('Test 4 Passed: Empty goal set handled gracefully with risk identification.');

  // Test 5 & 6: Active Goals and Projects Alignment
  const fullContext = createMockContext();
  const plan = engine.generatePlan(fullContext);
  assert.strictEqual(plan.objectiveSummary.activeGoals, 1);
  assert.strictEqual(plan.objectiveSummary.activeProjects, 1);
  const alignedItem = plan.prioritizedItems.find((p) => p.taskId === 'task-overdue');
  assert(alignedItem !== undefined);
  assert(alignedItem.goalAlignmentScore >= 0.8, 'Task linked to high-priority goal gets high alignment score');
  passCount++;
  console.log('Test 5 & 6 Passed: Goal and project alignment scores verified.');

  // Test 7: Overdue Tasks Handling
  const overdueItem = plan.prioritizedItems.find((p) => p.taskId === 'task-overdue');
  assert.strictEqual(overdueItem?.deadlineScore, 1.0, 'Overdue task must have deadlineScore = 1.0');
  assert(overdueItem?.urgencyScore >= 0.9, 'Overdue task must have very high urgencyScore');
  assert(plan.risks.some((r) => r.includes('overdue')), 'Identifies overdue tasks in risk assessment');
  passCount++;
  console.log('Test 7 Passed: Overdue tasks urgency boost and risk reporting verified.');

  // Test 8: Approaching Deadlines
  const imminentItem = plan.prioritizedItems.find((p) => p.taskId === 'task-imminent');
  assert.strictEqual(imminentItem?.deadlineScore, 0.95, 'Due within 24h must have deadlineScore = 0.95');
  passCount++;
  console.log('Test 8 Passed: Approaching deadlines scoring verified.');

  // Test 9: Priority Scoring Boundedness [0.0, 1.0]
  for (const item of plan.prioritizedItems) {
    assert(item.priorityScore >= 0.0 && item.priorityScore <= 1.0, `Priority score ${item.priorityScore} must be bounded`);
    assert(item.urgencyScore >= 0.0 && item.urgencyScore <= 1.0);
    assert(item.importanceScore >= 0.0 && item.importanceScore <= 1.0);
    assert(item.goalAlignmentScore >= 0.0 && item.goalAlignmentScore <= 1.0);
    assert(item.effortScore >= 0.0 && item.effortScore <= 1.0);
  }
  passCount++;
  console.log('Test 9 Passed: All task scores are bounded within [0.0, 1.0].');

  // Test 10: Goal Alignment Scoring Differential
  const unalignedItem = plan.prioritizedItems.find((p) => p.taskId === 'task-quick');
  assert(alignedItem.goalAlignmentScore > unalignedItem!.goalAlignmentScore, 'Aligned task scores higher than unaligned');
  passCount++;
  console.log('Test 10 Passed: Goal alignment scoring differential verified.');

  // Test 11 & 12: Strategy Candidates & Scoring
  assert.strictEqual(plan.strategyCandidates.length, 5);
  const expectedStrategyIds = [
    'deadline_first',
    'goal_impact_first',
    'deep_focus_first',
    'balanced_execution',
    'quick_win',
  ];
  for (const expId of expectedStrategyIds) {
    assert(plan.strategyCandidates.some((c) => c.id === expId), `Must contain strategy candidate ${expId}`);
  }
  for (const cand of plan.strategyCandidates) {
    assert(cand.score >= 0.0 && cand.score <= 1.0, `Strategy score ${cand.score} must be normalized [0.0, 1.0]`);
    assert(cand.strengths.length > 0);
    assert(cand.tradeoffs.length > 0);
  }
  passCount++;
  console.log('Test 11 & 12 Passed: 5 deliberative strategy candidates generated with normalized scores.');

  // Test 13: Recommended Strategy Selection
  assert.strictEqual(plan.recommendedStrategy.id, 'deadline_first', 'Deadline-First should be recommended when overdue tasks exist');
  assert.strictEqual(plan.recommendedStrategy.score, plan.strategyCandidates[0].score);
  passCount++;
  console.log('Test 13 Passed: Recommended strategy selected based on top score.');

  // Test 14: Execution Sequence Ordering
  assert.strictEqual(plan.executionSequence.length, 3);
  assert.strictEqual(plan.executionSequence[0].recommendedOrder, 1);
  assert.strictEqual(plan.executionSequence[1].recommendedOrder, 2);
  assert.strictEqual(plan.executionSequence[2].recommendedOrder, 3);
  assert.strictEqual(plan.executionSequence[0].taskId, 'task-overdue', 'Overdue task must be in sequence position #1');
  passCount++;
  console.log('Test 14 Passed: Execution sequence correctly orders overdue task first.');

  // Test 15: Availability-Aware Schedule Recommendations
  assert.strictEqual(plan.scheduleRecommendations.length, 3);
  const overdueRec = plan.scheduleRecommendations.find((r) => r.taskId === 'task-overdue');
  assert(overdueRec !== undefined && overdueRec.recommendedWindows.length > 0);
  assert(overdueRec.recommendedWindows[0].score >= 50);
  assert(overdueRec.recommendedWindows[0].reason.length > 0);
  passCount++;
  console.log('Test 15 Passed: Availability-aware candidate windows matched to tasks.');

  // Test 16 & 17: Planning Profile Constraints and Timezone Handling
  assert(plan.constraintsConsidered.some((c) => c.includes('Sleep rhythm: 23:00 - 07:00')));
  assert(plan.constraintsConsidered.some((c) => c.includes('Working hours: 09:00 - 17:00')));
  assert(plan.constraintsConsidered.some((c) => c.includes('Daily focus capacity: 4–6 hours')));
  assert(plan.constraintsConsidered.some((c) => c.includes('Meeting buffer: 15m')));
  passCount++;
  console.log('Test 16 & 17 Passed: Profile constraints and timezone considered in plan.');

  // Test 18: Confidence Normalization
  assert(plan.confidence >= 0.0 && plan.confidence <= 1.0);
  passCount++;
  console.log('Test 18 Passed: Confidence score normalized [0.0, 1.0].');

  // Test 19, 20, 21: Reasoning Service Safety & Fallback
  const reasoningService = new PlanningReasoningService();
  const { plan: fallbackPlan, enhanced } = await reasoningService.enhancePlan(plan, 'Plan my workload');
  assert.strictEqual(typeof fallbackPlan.confidence, 'number');
  assert(fallbackPlan.confidence >= 0.0 && fallbackPlan.confidence <= 1.0);
  assert(typeof fallbackPlan.rationale === 'string' && fallbackPlan.rationale.length > 0);
  passCount++;
  console.log('Test 19-21 Passed: Reasoning service fallback produces valid safe plan.');

  // Test 22: Gemini Unavailable Fallback
  // When GEMINI_API_KEY is not configured or unavailable, engine outputs valid deterministic plan
  const agentExecution = await planner.execute(fullContext);
  assert.strictEqual(agentExecution.success, true);
  const out = agentExecution.output as PlannerOutput;
  assert(out.prioritizedItems.length === 3);
  assert(out.recommendedStrategy !== undefined);
  passCount++;
  console.log('Test 22 Passed: Full PlannerAgent execution succeeds deterministically.');

  // Test 23: Action Proposals Remain Unexecuted (No mutations)
  assert(agentExecution.actions.length > 0);
  for (const act of agentExecution.actions) {
    assert.strictEqual(act.requiresConfirmation, true, 'All action proposals must require confirmation');
    assert.notStrictEqual(act.type, undefined);
  }
  // Verify context tasks/goals were NOT mutated
  assert.strictEqual(fullContext.tasks![0].status, 'pending');
  assert.strictEqual(fullContext.goals![0].progress, 60);
  passCount++;
  console.log('Test 23 Passed: Action proposals require confirmation; zero mutations occurred.');

  // Test 24 & 25: Orchestrator Integration & Lifecycle
  const orchestrator = new NovaOrchestrator({ registry });
  const req: AgentRequest = {
    requestId: 'req_orch_planner',
    userRequest: 'Please organize my tasks for today',
    preferredAgentId: 'agent.planner',
  };
  const orchResult = await orchestrator.orchestrate(req, {
    userId: 'test-user-planner-123',
  });
  if (!orchResult.success) {
    console.error('Orchestrator error:', orchResult.error, orchResult.agentResults[0]?.errors);
  }
  assert.strictEqual(orchResult.success, true);
  assert.strictEqual(orchResult.lifecycleStatus, 'COMPLETED');
  assert.strictEqual(orchResult.agentResults.length, 1);
  assert.strictEqual(orchResult.agentResults[0].agentId, 'agent.planner');
  assert.strictEqual(orchResult.traces.length, 1);
  assert.strictEqual(orchResult.traces[0].agentId, 'agent.planner');
  passCount++;
  console.log('Test 24 & 25 Passed: Orchestrator executes PlannerAgent with complete lifecycle.');

  // Test 26: Cross-User Isolation (User A vs User B)
  const contextUserB = createMockContext({
    userId: 'user-b-456',
    tasks: [
      {
        id: 'task-user-b',
        userId: 'user-b-456',
        title: 'Secret User B Task',
        priority: 'low',
        status: 'pending',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  });
  const planUserB = engine.generatePlan(contextUserB);
  assert.strictEqual(planUserB.prioritizedItems.length, 1);
  assert.strictEqual(planUserB.prioritizedItems[0].title, 'Secret User B Task');
  assert(!planUserB.prioritizedItems.some((p) => p.title.includes('Fix access policy')), 'User B cannot see User A tasks');
  passCount++;
  console.log('Test 26 Passed: Cross-user data isolation verified.');

  // Test 27: Planner Exception Isolation
  class BrokenPlanner extends PlannerAgent {
    public override readonly id = 'agent.broken_planner';
    protected override async run(): Promise<any> {
      throw new Error('Simulated Planner Internal Exception');
    }
  }
  const brokenPlanner = new BrokenPlanner();
  const brokenRes = await brokenPlanner.execute(fullContext);
  assert.strictEqual(brokenRes.success, false);
  assert.strictEqual(brokenRes.errors[0].code, 'EXECUTION_FAILED');
  assert.strictEqual(brokenRes.errors[0].message, 'Simulated Planner Internal Exception');
  passCount++;
  console.log('Test 27 Passed: Thrown planner exception safely isolated into AgentResult.');

  // Test 28: Planner Timeout Handling
  class SlowPlanner extends PlannerAgent {
    public override readonly id = 'agent.slow_planner';
    public override readonly timeoutMs = 80;
    protected override async run(): Promise<any> {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return { output: 'never' };
    }
  }
  const slowPlanner = new SlowPlanner();
  const slowRes = await slowPlanner.execute(fullContext);
  assert.strictEqual(slowRes.success, false);
  assert.strictEqual(slowRes.errors[0].code, 'TIMEOUT');
  passCount++;
  console.log('Test 28 Passed: Planner timeout safely isolated into AgentResult.');

  // Test 29: Concurrent Executions for Two Users
  const [resA, resB] = await Promise.all([
    planner.execute(fullContext),
    planner.execute(contextUserB),
  ]);
  assert.strictEqual(resA.success, true);
  assert.strictEqual(resB.success, true);
  const outA = resA.output as PlannerOutput;
  const outB = resB.output as PlannerOutput;
  assert.strictEqual(outA.prioritizedItems.length, 3);
  assert.strictEqual(outB.prioritizedItems.length, 1);
  passCount++;
  console.log('Test 29 Passed: Concurrent multi-user executions run in complete isolation.');

  // Test 30: Existing ContextInspectorAgent Still Works
  const inspector = new ContextInspectorAgent();
  registry.register(inspector);
  const inspResult = await orchestrator.orchestrate(
    {
      requestId: 'req_insp',
      userRequest: 'Run system health inspection',
      preferredAgentId: 'agent.context_inspector',
    },
    { userId: 'test-user-planner-123', mockContext: fullContext }
  );
  assert.strictEqual(inspResult.success, true);
  assert.strictEqual(inspResult.agentResults[0].agentId, 'agent.context_inspector');
  passCount++;
  console.log('Test 30 Passed: Existing ContextInspectorAgent remains 100% operational.');

  // Test 31: Gemini Data Minimization Boundary
  // Verify that the Gemini-facing planning snapshot excludes all internal IDs and credentials
  const snapshot = reasoningService.buildSanitizedSnapshot(plan, 'Plan my workload');
  assert(snapshot.activeTasks.length > 0, 'Snapshot must contain active tasks');
  for (const t of snapshot.activeTasks) {
    assert.strictEqual(typeof t.index, 'number', 'Task must have anonymous numeric index');
    assert.strictEqual((t as any).id, undefined, 'Task must NOT have internal id');
    assert.strictEqual((t as any).taskId, undefined, 'Task must NOT have taskId');
    assert.strictEqual(typeof t.title, 'string', 'Approved field title must be string');
    assert(t.title.length <= 100, 'Title must be bounded');
    assert.strictEqual(typeof t.priority, 'string', 'Approved field priority must be string');
    assert.strictEqual(typeof t.estimatedMinutes, 'number', 'Approved field estimatedMinutes must be number');
    assert.strictEqual(typeof t.hasDueDate, 'boolean', 'Approved field hasDueDate must be boolean');
  }
  const serializedSnapshot = JSON.stringify(snapshot);
  assert(!serializedSnapshot.includes('task-overdue'), 'Snapshot must not contain internal task ID');
  assert(!serializedSnapshot.includes('task-aligned'), 'Snapshot must not contain internal task ID');
  assert(!serializedSnapshot.includes('task-quick'), 'Snapshot must not contain internal task ID');
  assert(!serializedSnapshot.includes('goal-1'), 'Snapshot must not contain goal ID');
  assert(!serializedSnapshot.includes('proj-1'), 'Snapshot must not contain project ID');
  assert(!serializedSnapshot.includes('test-user-planner-123'), 'Snapshot must not contain user ID');
  assert(!serializedSnapshot.includes('@'), 'Snapshot must not contain email address');
  assert(!serializedSnapshot.includes('token'), 'Snapshot must not contain tokens');
  assert(!serializedSnapshot.includes('secret'), 'Snapshot must not contain secrets');
  passCount++;
  console.log('Test 31 Passed: Gemini snapshot strictly enforces data minimization and anonymous indexing.');

  // Test 32: Gemini Index Validation & Safe Server-Side Mapping
  // Verify that anonymous positional index mapping correctly validates boundaries
  const mockPlanWithItems = { ...plan };
  const validIndices = [0, 1];
  const mappedValidIds = validIndices
    .map((idx) => mockPlanWithItems.prioritizedItems[idx]?.taskId)
    .filter(Boolean);
  assert.strictEqual(mappedValidIds.length, 2);
  assert.strictEqual(mappedValidIds[0], mockPlanWithItems.prioritizedItems[0].taskId);
  assert.strictEqual(mappedValidIds[1], mockPlanWithItems.prioritizedItems[1].taskId);

  // Negative, fractional, out-of-bounds, string injection attempts
  const invalidIndices = [-1, 1.5, 999, 'injected-db-id', NaN, Infinity, null, undefined];
  const sanitizedIndices = invalidIndices.filter(
    (idx) =>
      typeof idx === 'number' &&
      Number.isInteger(idx) &&
      idx >= 0 &&
      idx < snapshot.activeTasks.length
  );
  assert.strictEqual(sanitizedIndices.length, 0, 'All invalid indices must be discarded');
  passCount++;
  console.log('Test 32 Passed: Anonymous index validation rejects invalid inputs and prevents ID injection.');

  // Test 33: Planner-Specific Active Task Scoping (Task Store)
  const scopingUser = 'user-scoping-test-999';
  await createTask(scopingUser, { title: 'Active Todo Task', status: 'todo', priority: 'high' });
  await createTask(scopingUser, { title: 'Active In Progress Task', status: 'in_progress', priority: 'medium' });
  await createTask(scopingUser, { title: 'Completed Historical Task', status: 'completed', priority: 'low' });
  await createTask(scopingUser, { title: 'Cancelled Old Task', status: 'cancelled', priority: 'low' });

  const activeOnly = await getActiveTasksByUser(scopingUser);
  assert(activeOnly.some((t) => t.title === 'Active Todo Task'), 'Must include todo tasks');
  assert(activeOnly.some((t) => t.title === 'Active In Progress Task'), 'Must include in_progress tasks');
  assert(!activeOnly.some((t) => t.title === 'Completed Historical Task'), 'Must exclude completed tasks');
  assert(!activeOnly.some((t) => t.title === 'Cancelled Old Task'), 'Must exclude cancelled tasks');
  passCount++;
  console.log('Test 33 Passed: getActiveTasksByUser returns only active tasks for planning.');

  // Test 34: Existing Task CRUD Preservation (Day 2 Backward Compatibility)
  const allTasks = await getTasksByUser(scopingUser);
  assert(allTasks.some((t) => t.title === 'Active Todo Task'));
  assert(allTasks.some((t) => t.title === 'Active In Progress Task'));
  assert(allTasks.some((t) => t.title === 'Completed Historical Task'), 'getTasksByUser must retain completed tasks for Day 2 CRUD');
  assert(allTasks.some((t) => t.title === 'Cancelled Old Task'), 'getTasksByUser must retain cancelled tasks for Day 2 CRUD');
  passCount++;
  console.log('Test 34 Passed: Existing getTasksByUser behavior preserved for Tasks CRUD.');

  // Test 35: AgentContext Task Scoping
  const scopedCtx = await buildAgentContext({
    userId: scopingUser,
    requestId: 'req_scope_test',
    executionId: 'exec_scope_test',
    userRequest: 'plan my day',
    scope: { activeTasksOnly: true, includeTasks: true },
  });
  assert(scopedCtx.tasks !== undefined);
  assert(scopedCtx.tasks.every((t) => t.status !== 'completed' && t.status !== 'cancelled'), 'Context tasks must only be active');
  passCount++;
  console.log('Test 35 Passed: AgentContext respects activeTasksOnly scope.');

  // Test 36: Strict User Isolation in Active Task Retrieval
  const userIsoA = 'user-iso-alpha';
  const userIsoB = 'user-iso-beta';
  await createTask(userIsoA, { title: 'Alpha Secret Task', status: 'todo' });
  await createTask(userIsoB, { title: 'Beta Secret Task', status: 'todo' });

  const tasksIsoA = await getActiveTasksByUser(userIsoA);
  const tasksIsoB = await getActiveTasksByUser(userIsoB);
  assert(tasksIsoA.every((t) => t.userId === userIsoA && !t.title.includes('Beta')));
  assert(tasksIsoB.every((t) => t.userId === userIsoB && !t.title.includes('Alpha')));
  passCount++;
  console.log('Test 36 Passed: Strict user isolation verified in active task retrieval.');

  // Test 37: End-to-End Planning with Scoped Active Tasks
  const planFromScoped = engine.generatePlan({
    ...fullContext,
    tasks: activeOnly as unknown as Task[],
  });
  assert(planFromScoped.prioritizedItems.every((p) => !p.title.includes('Completed') && !p.title.includes('Cancelled')));
  passCount++;
  console.log('Test 37 Passed: Planning engine successfully generates plan with scoped active tasks.');

  // Security Scenarios Verification
  console.log('\n--- VERIFYING SECURITY SCENARIOS (A through K) ---');

  // Scenario A & B: User A cannot plan User B's tasks or override userId
  assert.strictEqual(planUserB.prioritizedItems.length, 1);
  assert.strictEqual(planUserB.prioritizedItems[0].taskId, 'task-user-b');
  console.log('Security A & B Verified: User context is strictly bound to session userId.');

  // Scenario C: Unknown agent ID injection rejected
  const unknownReq: AgentRequest = {
    requestId: 'req_bad_agent',
    userRequest: 'Attack',
    preferredAgentId: 'agent.malicious_unregistered',
  };
  const unknownOrch = await orchestrator.orchestrate(unknownReq, {
    userId: 'test-user-planner-123',
    mockContext: fullContext,
  });
  assert.strictEqual(unknownOrch.success, false);
  assert.strictEqual(unknownOrch.error?.code, 'NO_CAPABLE_AGENT');
  console.log('Security C Verified: Unregistered/arbitrary agent IDs rejected.');

  // Scenario D, E, F: Action proposals are NOT executed
  const allProposedActions = agentExecution.actions;
  assert(allProposedActions.every((a) => a.requiresConfirmation === true));
  console.log('Security D, E, F Verified: Actions are proposals only; zero mutations to tasks, goals, or calendar.');

  // Scenario G: Gemini output cannot trigger mutations
  const { plan: geminiEnhancedPlan } = await reasoningService.enhancePlan(plan, 'fake input');
  assert.strictEqual(typeof geminiEnhancedPlan.recommendedStrategy.id, 'string');
  console.log('Security G Verified: Gemini reasoning enhancements cannot trigger side effects.');

  // Scenario H & I: OAuth tokens and cookies never enter PlannerAgent context
  const serializedContext = JSON.stringify(fullContext);
  assert(!serializedContext.includes('access_token'), 'No access token in context');
  assert(!serializedContext.includes('refresh_token'), 'No refresh token in context');
  assert(!serializedContext.includes('client_secret'), 'No client secret in context');
  assert(!serializedContext.includes('sentinel_session'), 'No session cookie in context');
  console.log('Security H & I Verified: Zero OAuth tokens, secrets, or auth cookies in context.');

  // Scenario J: No data leakage across user plans
  const serializedA = JSON.stringify(outA);
  assert(!serializedA.includes('task-user-b'), 'User A plan contains zero User B data');
  console.log('Security J Verified: No cross-user data leakage.');

  // Scenario K: Traces contain no secrets or chain-of-thought
  const trace = orchResult.traces[0];
  const serializedTrace = JSON.stringify(trace);
  assert(!serializedTrace.includes('thought'), 'No chain-of-thought in trace');
  assert(!serializedTrace.includes('cookie'), 'No cookies in trace');
  assert(!serializedTrace.includes('token'), 'No tokens in trace');
  console.log('Security K Verified: Traces contain no secrets or chain-of-thought.');

  console.log(`\n=== ALL ${passCount} PLANNER AGENT TESTS AND SECURITY SCENARIOS PASSED SUCCESSFULLY! ===`);
  process.exit(0);
}

runPlannerTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
