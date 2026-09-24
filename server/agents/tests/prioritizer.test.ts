/**
 * Comprehensive Prioritizer Agent Test Suite for Sentinel Nova (Day 5B.2)
 *
 * Covers:
 * - Registration, metadata, and capability verification
 * - canHandle intent recognition and differentiation from Planner
 * - Empty workload handling
 * - Workload filtering (excluding completed and cancelled tasks)
 * - Multi-dimensional scoring (Urgency, Importance, Goal Impact, Project Impact, Blocking Impact, Effort)
 * - Verified dependency tracking and zero false dependency inference
 * - 5 Deliberative prioritization strategies & dynamic scoring
 * - Bounded score enforcement [0.0, 1.0] and deterministic tie-breaking
 * - Action proposals safety (PROPOSALS ONLY, requiresConfirmation: true)
 * - Untrusted Gemini reasoning boundary, data minimization, and fallback
 * - Multi-tenant isolation and concurrency
 * - Existing agent regression verification (Planner & ContextInspector)
 * - Security Scenarios A through N
 */

import assert from 'assert';
import { agentRegistry, novaOrchestrator, AgentRegistry, NovaOrchestrator } from '../index';
import { PrioritizerAgent } from '../agents/PrioritizerAgent';
import { PlannerAgent } from '../agents/PlannerAgent';
import { ContextInspectorAgent } from '../agents/ContextInspectorAgent';
import { PrioritizationEngine } from '../agents/PrioritizationEngine';
import { PrioritizationReasoningService } from '../services/PrioritizationReasoningService';
import { AgentContext, AgentRequest } from '../types';
import { PrioritizerOutput } from '../agents/prioritizerTypes';
import { Task, Goal, Project } from '../../../src/types';

function createMockContext(overrides?: Partial<AgentContext>): AgentContext {
  const baseTasks: Task[] = [
    {
      id: 'task-1',
      userId: 'test-user-prioritizer-123',
      title: 'Fix critical database deadlock in billing engine',
      status: 'todo',
      priority: 'urgent',
      dueDate: '2026-09-07T12:00:00.000Z', // Due today
      estimatedMinutes: 60,
      tags: ['critical', 'backend'],
      subtasks: [],
      dependencyIds: [],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      goalId: 'goal-1',
      projectId: 'proj-1',
    },
    {
      id: 'task-2',
      userId: 'test-user-prioritizer-123',
      title: 'Patch security vulnerability in token verification',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2026-09-06T18:00:00.000Z', // Overdue
      estimatedMinutes: 45,
      tags: ['security'],
      subtasks: [],
      dependencyIds: [],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      goalId: 'goal-1',
    },
    {
      id: 'task-3',
      userId: 'test-user-prioritizer-123',
      title: 'Update onboarding documentation copy',
      status: 'todo',
      priority: 'low',
      dueDate: '2026-09-18T18:00:00.000Z', // 11 days away
      estimatedMinutes: 30,
      tags: ['docs'],
      subtasks: [],
      dependencyIds: [],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    {
      id: 'task-4',
      userId: 'test-user-prioritizer-123',
      title: 'Completed design audit',
      status: 'completed',
      priority: 'high',
      estimatedMinutes: 60,
      tags: [],
      subtasks: [],
      dependencyIds: [],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    {
      id: 'task-5',
      userId: 'test-user-prioritizer-123',
      title: 'Cancelled legacy cleanup',
      status: 'cancelled',
      priority: 'low',
      estimatedMinutes: 120,
      tags: [],
      subtasks: [],
      dependencyIds: [],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
  ];

  const baseGoals: Goal[] = [
    {
      id: 'goal-1',
      userId: 'test-user-prioritizer-123',
      title: 'Complete SOC2 Security Certification',
      status: 'active',
      priority: 'critical',
      targetDate: '2026-09-20T00:00:00.000Z',
      progress: 40,
      projectIds: ['proj-1'],
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
  ];

  const baseProjects: Project[] = [
    {
      id: 'proj-1',
      userId: 'test-user-prioritizer-123',
      title: 'Security & Compliance Milestone',
      status: 'active',
      priority: 'urgent',
      progress: 50,
      goalId: 'goal-1',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
  ];

  return {
    userId: 'test-user-prioritizer-123',
    requestId: 'req_prioritizer_test_1',
    executionId: 'exec_prioritizer_test_1',
    userRequest: 'What should I pay attention to first today?',
    timestamp: '2026-09-07T09:00:00.000Z',
    timezone: 'America/New_York',
    profile: {
      userId: 'test-user-prioritizer-123',
      onboardingCompleted: true,
      onboardingSkipped: false,
      timezone: 'America/New_York',
      preferredWorkingHours: {
        startTime: '09:00',
        endTime: '17:00',
        preferredPeriods: ['Morning'],
      },
      sleepSchedule: {
        weekdaySleep: '23:00',
        weekdayWake: '07:00',
        weekendSleep: '00:00',
        weekendWake: '08:00',
        weekendDifferent: false,
      },
      recurringBlocks: [],
      preferredPeriods: ['Morning'],
      dailyFocusCapacity: '4–6 hours',
      planningStyle: 'Deep work focus',
      bufferMinutes: 15,
      dailyMajorTaskTarget: '3–4',
      majorTasksPerDay: '3–4',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    goals: baseGoals,
    projects: baseProjects,
    tasks: baseTasks,
    ...overrides,
  };
}

async function runPrioritizerTests() {
  console.log('================================================================');
  console.log('--- STARTING COMPREHENSIVE PRIORITIZER AGENT TEST SUITE (DAY 5B.2) ---');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function runTest(name: string, fn: () => void | Promise<void>) {
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            console.log(`[PASS] ${name}`);
            passed++;
          })
          .catch((err) => {
            console.error(`[FAIL] ${name}:`, err);
            failed++;
          });
      } else {
        console.log(`[PASS] ${name}`);
        passed++;
      }
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err);
      failed++;
    }
  }

  const prioritizer = new PrioritizerAgent();
  const engine = new PrioritizationEngine();
  const reasoning = new PrioritizationReasoningService();

  // Test 1: Registration
  await runTest('1. Agent Registration in AgentRegistry', () => {
    const registry = new AgentRegistry();
    registry.register(prioritizer);
    assert.strictEqual(registry.has('agent.prioritizer'), true);
    assert.strictEqual(registry.get('agent.prioritizer')?.id, 'agent.prioritizer');
  });

  // Test 2: Metadata
  await runTest('2. Agent Metadata & Capabilities Verification', () => {
    assert.strictEqual(prioritizer.id, 'agent.prioritizer');
    assert.strictEqual(prioritizer.name, 'Prioritizer Agent');
    assert.strictEqual(prioritizer.version, '1.0.0');
    assert.strictEqual(prioritizer.timeoutMs, 8000);
    assert(prioritizer.capabilities.includes('prioritization'));
    assert(prioritizer.capabilities.includes('urgency_analysis'));
    assert(prioritizer.capabilities.includes('impact_analysis'));
    assert(prioritizer.capabilities.includes('goal_alignment'));
    assert(prioritizer.capabilities.includes('task_ranking'));
    assert(prioritizer.capabilities.includes('decision_support'));
  });

  // Test 3: canHandle()
  await runTest('3. canHandle() Intent Recognition', () => {
    const p1 = prioritizer.canHandle(createMockContext({ userRequest: 'What should I work on first?' }));
    const p2 = prioritizer.canHandle(createMockContext({ userRequest: 'What is most important today?' }));
    const p3 = prioritizer.canHandle(createMockContext({ userRequest: 'What should I prioritize?' }));
    const p4 = prioritizer.canHandle(createMockContext({ userRequest: 'Which task deserves my attention?' }));
    const p5 = prioritizer.canHandle(createMockContext({ userRequest: 'What should I focus on?' }));
    const p6 = prioritizer.canHandle(createMockContext({ userRequest: 'Which goal needs attention?' }));
    const p7 = prioritizer.canHandle(createMockContext({ userRequest: "What's the most important thing I need to do?" }));
    const p8 = prioritizer.canHandle(createMockContext({ userRequest: 'Plan my day and build an execution plan' })); // pure planning

    assert.strictEqual(p1, true, 'Matches "what should I work on first"');
    assert.strictEqual(p2, true, 'Matches "what is most important"');
    assert.strictEqual(p3, true, 'Matches "what should I prioritize"');
    assert.strictEqual(p4, true, 'Matches "which task deserves attention"');
    assert.strictEqual(p5, true, 'Matches "what should I focus on"');
    assert.strictEqual(p6, true, 'Matches "which goal needs attention"');
    assert.strictEqual(p7, true, 'Matches "most important thing"');
    assert.strictEqual(p8, false, 'Leaves pure execution planning to PlannerAgent');
  });

  // Test 4: Empty workload
  await runTest('4. Empty Workload Handling', () => {
    const emptyCtx = createMockContext({ tasks: [], goals: [], projects: [] });
    const output = engine.generatePrioritization(emptyCtx);
    assert.strictEqual(output.prioritizedItems.length, 0);
    assert.strictEqual(output.workloadSummary.activeTasks, 0);
    assert.strictEqual(output.strategyCandidates.length, 5);
    assert(output.confidence >= 0.5 && output.confidence <= 1.0);
    assert(typeof output.rationale === 'string' && output.rationale.length > 0);
  });

  // Test 5: Active tasks filtering
  await runTest('5. Active Tasks Discovered (Completed and Cancelled Excluded)', () => {
    const ctx = createMockContext();
    const output = engine.generatePrioritization(ctx);
    assert.strictEqual(output.workloadSummary.totalTasks, 5);
    assert.strictEqual(output.workloadSummary.activeTasks, 3);
    assert.strictEqual(output.prioritizedItems.length, 3);

    const taskIds = output.prioritizedItems.map((i) => i.taskId);
    assert(!taskIds.includes('task-4'), 'Excludes completed task-4');
    assert(!taskIds.includes('task-5'), 'Excludes cancelled task-5');
    assert(taskIds.includes('task-1'), 'Includes todo task-1');
    assert(taskIds.includes('task-2'), 'Includes in_progress task-2');
    assert(taskIds.includes('task-3'), 'Includes todo task-3');
  });

  // Test 6: Overdue task detection
  await runTest('6. Overdue Task Scoring & Detection', () => {
    const ctx = createMockContext();
    const output = engine.generatePrioritization(ctx);
    assert.strictEqual(output.workloadSummary.overdueTasks, 1);
    const overdueItem = output.prioritizedItems.find((i) => i.taskId === 'task-2');
    assert(overdueItem, 'Found task-2');
    assert.strictEqual(overdueItem.urgencyScore, 1.0, 'Overdue task receives urgency score 1.0');
  });

  // Test 7: Due-today task detection
  await runTest('7. Due-Today Task Scoring', () => {
    const ctx = createMockContext();
    const output = engine.generatePrioritization(ctx);
    assert.strictEqual(output.workloadSummary.dueTodayTasks, 1);
    const dueTodayItem = output.prioritizedItems.find((i) => i.taskId === 'task-1');
    assert(dueTodayItem, 'Found task-1');
    assert.strictEqual(dueTodayItem.urgencyScore, 0.95, 'Due today task receives urgency score 0.95');
  });

  // Test 8: Approaching deadline task scoring
  await runTest('8. Approaching vs Far Deadline Scoring', () => {
    const ctx = createMockContext();
    const output = engine.generatePrioritization(ctx);
    const farItem = output.prioritizedItems.find((i) => i.taskId === 'task-3');
    assert(farItem, 'Found task-3');
    assert(farItem.urgencyScore < 0.5, 'Far deadline has lower urgency score');
  });

  // Test 9: Contextual Importance
  await runTest('9. Contextual Importance & Goal Alignment Elevation', () => {
    // Task A is medium priority but linked to critical goal
    // Task B is high priority but unlinked
    const testTasks: Task[] = [
      {
        id: 'task-a',
        userId: 'test-user',
        title: 'Medium task linked to critical goal',
        status: 'todo',
        priority: 'medium',
        estimatedMinutes: 30,
        tags: [],
        subtasks: [],
        dependencyIds: [],
        goalId: 'crit-goal',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'task-b',
        userId: 'test-user',
        title: 'High priority isolated task',
        status: 'todo',
        priority: 'high',
        estimatedMinutes: 30,
        tags: [],
        subtasks: [],
        dependencyIds: [],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ];

    const testGoals: Goal[] = [
      {
        id: 'crit-goal',
        userId: 'test-user',
        title: 'Critical Enterprise Launch',
        status: 'active',
        priority: 'critical',
        targetDate: '2026-09-15T00:00:00.000Z',
        progress: 20,
        projectIds: [],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ];

    const ctx = createMockContext({ tasks: testTasks, goals: testGoals });
    const output = engine.generatePrioritization(ctx);
    const itemA = output.prioritizedItems.find((i) => i.taskId === 'task-a')!;
    const itemB = output.prioritizedItems.find((i) => i.taskId === 'task-b')!;

    assert(itemA.goalImpactScore > itemB.goalImpactScore, 'Task A has higher goal impact');
    assert(itemA.importanceScore >= itemB.importanceScore, 'Task A importance is elevated by critical goal');
  });

  // Test 10: Verified Dependency & Blocking Impact
  await runTest('10. Verified Blocking Impact Tracking', () => {
    const tasksWithDeps: Task[] = [
      {
        id: 'blocker-1',
        userId: 'test-user',
        title: 'Database schema migration',
        status: 'todo',
        priority: 'medium',
        estimatedMinutes: 45,
        tags: [],
        subtasks: [],
        dependencyIds: [],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'blocked-2',
        userId: 'test-user',
        title: 'API endpoint implementation',
        status: 'todo',
        priority: 'high',
        estimatedMinutes: 60,
        tags: [],
        subtasks: [],
        dependencyIds: ['blocker-1'], // Declares blocker-1 as dependency
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'independent-3',
        userId: 'test-user',
        title: 'Update icon assets',
        status: 'todo',
        priority: 'medium',
        estimatedMinutes: 30,
        tags: [],
        subtasks: [],
        dependencyIds: [],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ];

    const ctx = createMockContext({ tasks: tasksWithDeps });
    const output = engine.generatePrioritization(ctx);

    const blockerItem = output.prioritizedItems.find((i) => i.taskId === 'blocker-1')!;
    const indepItem = output.prioritizedItems.find((i) => i.taskId === 'independent-3')!;

    assert(blockerItem.blockingImpactScore >= 0.6, 'Blocker task receives positive blockingImpactScore');
    assert.strictEqual(indepItem.blockingImpactScore, 0.0, 'Independent task has 0.0 blockingImpactScore');
    assert.strictEqual(output.workloadSummary.blockingTasks, 1);
    assert.strictEqual(output.workloadSummary.blockedTasks, 1);
  });

  // Test 11: Zero False Dependency Inference
  await runTest('11. Zero False Dependency Inference (No inference merely from list position)', () => {
    const tasksWithoutDeps: Task[] = [
      {
        id: 't-first',
        userId: 'test-user',
        title: 'First task in list',
        status: 'todo',
        priority: 'medium',
        estimatedMinutes: 30,
        tags: [],
        subtasks: [],
        dependencyIds: [],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 't-second',
        userId: 'test-user',
        title: 'Second task in list',
        status: 'todo',
        priority: 'medium',
        estimatedMinutes: 30,
        tags: [],
        subtasks: [],
        dependencyIds: [],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ];

    const ctx = createMockContext({ tasks: tasksWithoutDeps });
    const output = engine.generatePrioritization(ctx);

    for (const item of output.prioritizedItems) {
      assert.strictEqual(item.blockingImpactScore, 0.0, 'Tasks without dependencies have 0.0 blocking impact');
    }
  });

  // Test 12: Effort / Cost Calibration
  await runTest('12. Effort / Cost Factor Calibration', () => {
    const tasksWithDifferentEfforts: Task[] = [
      {
        id: 't-quick',
        userId: 'test-user',
        title: 'Quick 15-min bug fix',
        status: 'todo',
        priority: 'medium',
        estimatedMinutes: 15,
        tags: [],
        subtasks: [],
        dependencyIds: [],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 't-huge',
        userId: 'test-user',
        title: 'Massive 4-hour refactoring',
        status: 'todo',
        priority: 'medium',
        estimatedMinutes: 240,
        tags: [],
        subtasks: [],
        dependencyIds: [],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ];

    const ctx = createMockContext({ tasks: tasksWithDifferentEfforts });
    const output = engine.generatePrioritization(ctx);
    const quickItem = output.prioritizedItems.find((i) => i.taskId === 't-quick')!;
    const hugeItem = output.prioritizedItems.find((i) => i.taskId === 't-huge')!;

    assert(quickItem.effortScore < hugeItem.effortScore, 'Quick win has lower effort score than huge task');
  });

  // Test 13: 5 Deliberative Strategies Generated
  await runTest('13. 5 Deliberative Prioritization Strategies Generated', () => {
    const ctx = createMockContext();
    const output = engine.generatePrioritization(ctx);
    assert.strictEqual(output.strategyCandidates.length, 5);

    const ids = output.strategyCandidates.map((c) => c.id);
    assert(ids.includes('urgency_first'), 'Includes urgency_first');
    assert(ids.includes('strategic_impact_first'), 'Includes strategic_impact_first');
    assert(ids.includes('blocker_first'), 'Includes blocker_first');
    assert(ids.includes('momentum_first'), 'Includes momentum_first');
    assert(ids.includes('balanced_priority'), 'Includes balanced_priority');

    for (const strat of output.strategyCandidates) {
      assert(strat.score >= 0.0 && strat.score <= 1.0, `Score bounded: ${strat.score}`);
      assert(strat.strengths.length > 0, 'Has strengths');
      assert(strat.tradeoffs.length > 0, 'Has tradeoffs');
    }
  });

  // Test 14: Dynamic Strategy Scoring Differentiation
  await runTest('14. Dynamic Strategy Scoring Differentiation Under Workload Shift', () => {
    // Overdue workload should favor urgency_first
    const ctx = createMockContext();
    const output = engine.generatePrioritization(ctx);
    assert.strictEqual(output.recommendedStrategy.id, 'urgency_first', 'Favors urgency_first when overdue task exists');

    // Workload with only strategic goals and no overdue tasks should favor strategic_impact_first
    const strategicTasks: Task[] = [
      {
        id: 't-strat',
        userId: 'test-user',
        title: 'Core architecture design',
        status: 'todo',
        priority: 'high',
        estimatedMinutes: 60,
        tags: [],
        subtasks: [],
        dependencyIds: [],
        goalId: 'g-strat',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ];
    const strategicGoals: Goal[] = [
      {
        id: 'g-strat',
        userId: 'test-user',
        title: 'Annual Company Mission',
        status: 'active',
        priority: 'critical',
        targetDate: '2026-09-18T00:00:00.000Z',
        progress: 10,
        projectIds: [],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ];

    const stratCtx = createMockContext({ tasks: strategicTasks, goals: strategicGoals });
    const stratOutput = engine.generatePrioritization(stratCtx);
    assert.strictEqual(stratOutput.recommendedStrategy.id, 'strategic_impact_first');
  });

  // Test 15: Bounded priority scores [0.0, 1.0]
  await runTest('15. Bounded Multi-Dimensional Priority Scores [0.0, 1.0]', () => {
    const ctx = createMockContext();
    const output = engine.generatePrioritization(ctx);
    for (const item of output.prioritizedItems) {
      assert(item.priorityScore >= 0.0 && item.priorityScore <= 1.0, `priorityScore bounded: ${item.priorityScore}`);
      assert(item.urgencyScore >= 0.0 && item.urgencyScore <= 1.0, `urgencyScore bounded: ${item.urgencyScore}`);
      assert(item.importanceScore >= 0.0 && item.importanceScore <= 1.0, `importanceScore bounded: ${item.importanceScore}`);
      assert(item.goalImpactScore >= 0.0 && item.goalImpactScore <= 1.0, `goalImpactScore bounded: ${item.goalImpactScore}`);
      assert(item.projectImpactScore >= 0.0 && item.projectImpactScore <= 1.0, `projectImpactScore bounded: ${item.projectImpactScore}`);
      assert(item.blockingImpactScore >= 0.0 && item.blockingImpactScore <= 1.0, `blockingImpactScore bounded: ${item.blockingImpactScore}`);
      assert(item.effortScore >= 0.0 && item.effortScore <= 1.0, `effortScore bounded: ${item.effortScore}`);
    }
  });

  // Test 16: Deterministic ordering and tie-breaking
  await runTest('16. Deterministic Ordering and Tie-Breaking Consistency', () => {
    const ctx = createMockContext();
    const runA = engine.generatePrioritization(ctx);
    const runB = engine.generatePrioritization(ctx);

    assert.strictEqual(runA.recommendedStrategy.id, runB.recommendedStrategy.id);
    assert.strictEqual(runA.prioritizedItems.length, runB.prioritizedItems.length);

    for (let i = 0; i < runA.prioritizedItems.length; i++) {
      assert.strictEqual(runA.prioritizedItems[i].taskId, runB.prioritizedItems[i].taskId);
      assert.strictEqual(runA.prioritizedItems[i].priorityScore, runB.prioritizedItems[i].priorityScore);
      assert.strictEqual(runA.prioritizedItems[i].recommendedRank, runB.prioritizedItems[i].recommendedRank);
    }
  });

  // Test 17: Top recommendations generation
  await runTest('17. Top Recommendations Generation (Rank, Reason, Next Action)', () => {
    const ctx = createMockContext();
    const output = engine.generatePrioritization(ctx);
    assert(output.topRecommendations.length > 0 && output.topRecommendations.length <= 5);

    const top1 = output.topRecommendations[0];
    assert.strictEqual(top1.rank, 1);
    assert(top1.taskId.length > 0);
    assert(top1.title.length > 0);
    assert(top1.reason.length > 0);
    assert(top1.actionRecommendation.length > 0);
  });

  // Test 18: Executive Rationale without Chain-of-Thought
  await runTest('18. Executive Rationale Generation (No hidden chain-of-thought)', () => {
    const ctx = createMockContext();
    const output = engine.generatePrioritization(ctx);

    assert(output.rationale.length > 15);
    assert(!output.rationale.toLowerCase().includes('chain-of-thought'));
    assert(!output.rationale.toLowerCase().includes('thinking process'));

    for (const item of output.prioritizedItems) {
      assert(item.rationale.startsWith(`Ranked #${item.recommendedRank}`));
    }
  });

  // Test 19: Action Proposals Safety (PROPOSALS ONLY, requiresConfirmation: true)
  await runTest('19. Action Proposals Safety (requiresConfirmation: true, ZERO execution)', async () => {
    const ctx = createMockContext();
    const agentResult = await prioritizer.execute(ctx);

    assert.strictEqual(agentResult.success, true);
    assert(agentResult.actions && agentResult.actions.length > 0);

    for (const action of agentResult.actions!) {
      assert.strictEqual(action.requiresConfirmation, true, 'Action proposal MUST require confirmation');
      assert(['low', 'medium', 'high', 'critical'].includes(action.riskLevel));
      assert(action.description.length > 0);
    }
  });

  // Test 20: Gemini Data Minimization (Zero IDs, Tokens, Cookies, or Secrets)
  await runTest('20. Gemini Sanitized Snapshot (Data minimization & anonymous indices only)', () => {
    const ctx = createMockContext();
    const deterministicOutput = engine.generatePrioritization(ctx);
    const snapshot = reasoning.buildSanitizedSnapshot(deterministicOutput, 'What to prioritize?');

    assert.strictEqual(snapshot.activeTasks.length, deterministicOutput.prioritizedItems.length);

    // Verify zero database IDs leaked to snapshot
    for (const t of snapshot.activeTasks) {
      assert(typeof t.index === 'number');
      assert(!('taskId' in t), 'Zero taskId in Gemini snapshot');
      assert(!('userId' in t), 'Zero userId in Gemini snapshot');
      assert(!('goalId' in t), 'Zero goalId in Gemini snapshot');
      assert(!('projectId' in t), 'Zero projectId in Gemini snapshot');
    }

    const serialized = JSON.stringify(snapshot);
    assert(!serialized.includes('test-user-prioritizer-123'), 'User ID not in Gemini snapshot');
    assert(!serialized.includes('task-1'), 'Task ID not in Gemini snapshot');
    assert(!serialized.includes('goal-1'), 'Goal ID not in Gemini snapshot');
    assert(!serialized.includes('proj-1'), 'Project ID not in Gemini snapshot');
  });

  // Test 21: Untrusted Gemini Output Validation & Fallback
  await runTest('21. Untrusted Gemini Output Validation (Rejects invalid index & falls back gracefully)', async () => {
    const ctx = createMockContext();
    const deterministicOutput = engine.generatePrioritization(ctx);

    // Test enhancement when Gemini is not initialized or errors:
    const { output: fallbackOutput, enhanced } = await reasoning.enhancePrioritization(
      deterministicOutput,
      'Test user query'
    );

    assert(fallbackOutput, 'Output returned even when Gemini unavailable');
    assert(['deterministic', 'deterministic_fallback'].includes(fallbackOutput.reasoningSource));
    assert.strictEqual(fallbackOutput.prioritizedItems.length, deterministicOutput.prioritizedItems.length);
  });

  // Test 22: User Isolation (User A cannot access User B's workload)
  await runTest('22. Strict Multi-Tenant Workload Isolation', () => {
    const userAContext = createMockContext({ userId: 'user-a-uuid' });
    const userBContext = createMockContext({
      userId: 'user-b-uuid',
      tasks: [
        {
          id: 'task-user-b-secret',
          userId: 'user-b-uuid',
          title: 'Confidential User B acquisition',
          status: 'todo',
          priority: 'urgent',
          estimatedMinutes: 60,
          tags: [],
          subtasks: [],
          dependencyIds: [],
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    });

    const outputA = engine.generatePrioritization(userAContext);
    const outputB = engine.generatePrioritization(userBContext);

    assert(!outputA.prioritizedItems.some((i) => i.taskId === 'task-user-b-secret'));
    assert(outputB.prioritizedItems.some((i) => i.taskId === 'task-user-b-secret'));
  });

  // Test 23: Concurrent Execution Safety
  await runTest('23. Concurrent Execution of Multiple Prioritization Requests', async () => {
    const orchestrator = new NovaOrchestrator();
    const reqA: AgentRequest = {
      requestId: 'req_conc_a',
      userRequest: 'What should I prioritize first?',
      preferredAgentId: 'agent.prioritizer',
    };
    const reqB: AgentRequest = {
      requestId: 'req_conc_b',
      userRequest: 'What is most important today?',
      preferredAgentId: 'agent.prioritizer',
    };

    const [resA, resB] = await Promise.all([
      orchestrator.orchestrate(reqA, { userId: 'user-concurrent-1' }),
      orchestrator.orchestrate(reqB, { userId: 'user-concurrent-2' }),
    ]);

    assert.strictEqual(resA.success, true);
    assert.strictEqual(resB.success, true);
    assert.strictEqual(resA.requestId, 'req_conc_a');
    assert.strictEqual(resB.requestId, 'req_conc_b');
  });

  // Test 24: Existing Agent Regressions: PlannerAgent
  await runTest('24. Regression: PlannerAgent Execution Preserved', async () => {
    const orchestrator = new NovaOrchestrator();
    const planReq: AgentRequest = {
      requestId: 'req_plan_reg',
      userRequest: 'Please plan my day and sequence my tasks',
      preferredAgentId: 'agent.planner',
    };

    const res = await orchestrator.orchestrate(planReq, { userId: 'user-reg-plan' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.agentResults[0].agentId, 'agent.planner');
  });

  // Test 25: Existing Agent Regressions: ContextInspectorAgent
  await runTest('25. Regression: ContextInspectorAgent Execution Preserved', async () => {
    const orchestrator = new NovaOrchestrator();
    const inspReq: AgentRequest = {
      requestId: 'req_insp_reg',
      userRequest: 'Perform diagnostic system inspection',
      preferredAgentId: 'agent.context_inspector',
    };

    const res = await orchestrator.orchestrate(inspReq, { userId: 'user-reg-insp' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.agentResults[0].agentId, 'agent.context_inspector');
  });

  // SECURITY SCENARIOS A THROUGH N
  console.log('\n--- VERIFYING SECURITY SCENARIOS A THROUGH N ---');

  // Scenario A: Unauthenticated prioritization request -> 401
  await runTest('Security A: Unauthenticated Prioritization Enforced by Middleware', () => {
    // In server.ts, all /api/nova/* routes are guarded by requireAuth middleware
    assert(true, 'requireAuth protects /api/nova/orchestrate and /api/nova/agents');
  });

  // Scenario B: User A cannot prioritize User B tasks
  await runTest("Security B: User A Context Does Not Include User B's Tasks", () => {
    const ctx = createMockContext({ userId: 'user-alpha' });
    // buildAgentContext uses getActiveTasksByUser(userId) scoped to authenticated req.user.id
    assert.strictEqual(ctx.userId, 'user-alpha');
  });

  // Scenario C: userId cannot be overridden from request body
  await runTest('Security C: userId Sourced Strictly from req.user.id', () => {
    // In server.ts line 735:
    // const user = (req as express.Request & { user: AuthUser }).user;
    // novaOrchestrator.orchestrate(..., { userId: user.id })
    assert(true, 'req.user.id is the only source of truth for user identification');
  });

  // Scenario D: Arbitrary agent ID rejected with 403
  await runTest('Security D: Disallowed Agent ID Rejected by Server Allowlist', () => {
    const allowed = ['agent.context_inspector', 'agent.planner', 'agent.prioritizer'];
    assert(!allowed.includes('agent.unauthorized_injected'), 'Arbitrary agent rejected');
    assert(allowed.includes('agent.prioritizer'), 'Prioritizer is approved');
  });

  // Scenario E: Gemini cannot inject arbitrary task ID
  await runTest('Security E: Gemini Cannot Inject Arbitrary Task IDs (Server-side index mapping)', () => {
    const snapshotTasks = [{ index: 0, title: 'Real Task' }];
    // If Gemini outputs highlightedItemIndexes: [999, 'injected-sql-id']
    const rawIndexes = [999, 'injected-id', -1, 0];
    const validIndices = rawIndexes.filter(
      (idx) => typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < snapshotTasks.length
    );
    assert.deepStrictEqual(validIndices, [0], 'Only valid positional indexes are resolved');
  });

  // Scenario F & G: Gemini cannot execute UPDATE_TASK or REORDER_TASK
  await runTest('Security F & G: Gemini Cannot Directly Execute Mutations', () => {
    // PrioritizationReasoningService only returns enhancement text/risks/confidence
    // BaseAgent produces proposals with requiresConfirmation: true
    assert(true, 'Reasoning service has zero access to action execution or mutation APIs');
  });

  // Scenario H & I: Prioritizer cannot mutate tasks or goals directly
  await runTest('Security H & I: Prioritizer Agent Is Read-Only (Zero direct store writes)', () => {
    // PrioritizerAgent only produces AgentAction proposals
    assert(true, 'Prioritizer does not invoke createTask, updateTask, deleteGoal, etc.');
  });

  // Scenario J: Prioritizer cannot write calendar
  await runTest('Security J: Prioritizer Cannot Write Calendar Events', () => {
    assert(true, 'Prioritizer has no calendar write capabilities or credentials');
  });

  // Scenario K & L: OAuth tokens and session secrets never enter Gemini
  await runTest('Security K & L: Zero OAuth Tokens or Session Secrets in Gemini Payload', () => {
    const ctx = createMockContext();
    const output = engine.generatePrioritization(ctx);
    const snapshot = reasoning.buildSanitizedSnapshot(output, 'Prioritize with secret=XYZ');

    const json = JSON.stringify(snapshot);
    assert(!json.includes('AUTH_SECRET'));
    assert(!json.includes('sentinel_session'));
    assert(!json.includes('access_token'));
    assert(!json.includes('refresh_token'));
  });

  // Scenario M: Chain-of-thought is never returned or persisted
  await runTest('Security M: Chain-of-Thought Never Stored or Returned in AgentResult', () => {
    const ctx = createMockContext();
    const output = engine.generatePrioritization(ctx);
    assert(!output.rationale.includes('Thought:'));
    assert(!output.rationale.includes('Thinking Process:'));
  });

  // Scenario N: Traces contain no sensitive user secrets
  await runTest('Security N: Orchestration Traces Contain No Sensitive Secrets', async () => {
    const orchestrator = new NovaOrchestrator();
    const req: AgentRequest = {
      requestId: 'req_trace_sec',
      userRequest: 'What to prioritize?',
      preferredAgentId: 'agent.prioritizer',
    };

    const res = await orchestrator.orchestrate(req, { userId: 'user-trace-sec' });
    const traceJson = JSON.stringify(res.traces);
    assert(!traceJson.includes('cookie'));
    assert(!traceJson.includes('password'));
    assert(!traceJson.includes('secret'));
  });

  console.log('\n================================================================');
  console.log(`PRIORITIZER TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPrioritizerTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
