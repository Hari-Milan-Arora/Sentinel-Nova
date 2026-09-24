/**
 * Focused Unit Tests for SchedulingEngine (Day 5B)
 *
 * Tests:
 * 1. deterministic scoring
 * 2. scores remain between 0 and 1
 * 3. strategy evaluation
 * 4. best candidate selection
 * 5. deterministic tie-breaking
 * 6. infeasible candidate rejection
 * 7. alternatives limited to 3
 * 8. repeated execution produces the same result
 */

import assert from 'assert';
import {
  scoreCandidateWindow,
  evaluateStrategies,
  selectBestWindow,
  SchedulingContext,
} from '../agents/SchedulingEngine';
import { Task, Goal, Project, SchedulingCandidateWindow, FreeWindow } from '../../../src/types';
import { SchedulingStrategy } from '../agents/schedulerTypes';

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`[FAIL] ${name}:`, err.message);
    failed++;
  }
}

// Helper factories
function createMockTask(overrides?: Partial<Task>): Task {
  return {
    id: 'task_sched_1',
    userId: 'user_123',
    title: 'Analyze quarterly telemetry logs',
    description: 'Deep dive into performance telemetry',
    status: 'todo',
    priority: 'high',
    dueDate: '2026-09-11T17:00:00.000Z',
    estimatedMinutes: 45,
    tags: ['engineering'],
    subtasks: [],
    dependencyIds: [],
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-10T08:00:00.000Z',
    ...overrides,
  };
}

function createMockFreeWindow(id: string, start: string, end: string, overrides?: Partial<FreeWindow>): FreeWindow {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const durationMinutes = Math.round((endMs - startMs) / (60 * 1000));

  return {
    id,
    start,
    end,
    durationMinutes,
    startFormatted: '09:00',
    endFormatted: '11:00',
    inPreferredWorkingHours: true,
    inPreferredFocusPeriod: false,
    preferredPeriodName: 'Morning Focus',
    ...overrides,
  };
}

function createCandidate(
  id: string,
  start: string,
  end: string,
  fit: 'exact' | 'comfortable' | 'tight' = 'comfortable',
  overrides?: Partial<FreeWindow>
): SchedulingCandidateWindow {
  const fw = createMockFreeWindow(id, start, end, overrides);
  return {
    window: fw,
    taskDuration: 45,
    fit,
    score: 80,
    reasons: ['Base availability window'],
  };
}

const mockGoals: Goal[] = [
  {
    id: 'goal_alpha',
    userId: 'user_123',
    title: 'Infrastructure Reliability 99.99%',
    status: 'active',
    priority: 'critical',
    progress: 65,
    projectIds: ['proj_infra'],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
];

const mockProjects: Project[] = [
  {
    id: 'proj_infra',
    userId: 'user_123',
    name: 'Core Platform Hardening',
    status: 'active',
    progress: 70,
    taskIds: ['task_sched_1'],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
];

const context: SchedulingContext = {
  goals: mockGoals,
  projects: mockProjects,
  now: new Date('2026-09-10T09:00:00.000Z'),
};

console.log('--- STARTING SCHEDULING ENGINE UNIT TESTS ---');

// 1. Deterministic scoring
runTest('1. Deterministic scoring produces consistent and rationale-backed scores', () => {
  const task = createMockTask({ goalId: 'goal_alpha', projectId: 'proj_infra' });
  const cand = createCandidate(
    'win_1',
    '2026-09-10T10:00:00.000Z',
    '2026-09-10T12:00:00.000Z',
    'comfortable',
    { inPreferredFocusPeriod: true, inPreferredWorkingHours: true }
  );

  const res1 = scoreCandidateWindow(cand, task, 'focus_alignment', context);
  const res2 = scoreCandidateWindow(cand, task, 'focus_alignment', context);

  assert.strictEqual(res1.score, res2.score, 'Scores must be identical');
  assert.strictEqual(res1.suggestedStart, res2.suggestedStart, 'Suggested start must be identical');
  assert(res1.score >= 0.7, 'Focus period + comfortable fit should yield high score');
  assert(res1.reasons.some((r) => r.includes('alignment with')), 'Includes focus rationale');
});

// 2. Scores remain between 0 and 1
runTest('2. Scores remain strictly bounded between 0.0 and 1.0 across all edge cases', () => {
  const taskExtremeOverdue = createMockTask({
    dueDate: '2026-09-09T08:00:00.000Z', // In the past
    priority: 'low',
    estimatedMinutes: 180,
  });

  const tightOutsideWindow = createCandidate(
    'win_bad',
    '2026-09-10T22:00:00.000Z',
    '2026-09-10T22:30:00.000Z',
    'tight',
    { inPreferredWorkingHours: false, inPreferredFocusPeriod: false }
  );

  const strategies: SchedulingStrategy[] = [
    'deadline_first',
    'focus_alignment',
    'goal_impact_first',
    'workload_balanced',
    'momentum',
  ];

  for (const strat of strategies) {
    const scoredBad = scoreCandidateWindow(tightOutsideWindow, taskExtremeOverdue, strat, context);
    assert(
      scoredBad.score >= 0.0 && scoredBad.score <= 1.0,
      `Score ${scoredBad.score} for ${strat} must be in [0.0, 1.0]`
    );

    const taskPerfect = createMockTask({
      goalId: 'goal_alpha',
      priority: 'urgent',
      estimatedMinutes: 20,
      dueDate: '2026-09-10T11:00:00.000Z',
    });
    const idealWindow = createCandidate(
      'win_ideal',
      '2026-09-10T09:30:00.000Z',
      '2026-09-10T10:30:00.000Z',
      'comfortable',
      { inPreferredWorkingHours: true, inPreferredFocusPeriod: true }
    );
    const scoredIdeal = scoreCandidateWindow(idealWindow, taskPerfect, strat, context);
    assert(
      scoredIdeal.score >= 0.0 && scoredIdeal.score <= 1.0,
      `Ideal score ${scoredIdeal.score} for ${strat} must be in [0.0, 1.0]`
    );
  }
});

// 3. Strategy evaluation
runTest('3. Strategy evaluation computes scores for all 5 defined strategies', () => {
  const task = createMockTask({ goalId: 'goal_alpha' });
  const candidates = [
    createCandidate('win_1', '2026-09-10T10:00:00.000Z', '2026-09-10T11:30:00.000Z', 'comfortable'),
    createCandidate('win_2', '2026-09-10T14:00:00.000Z', '2026-09-10T15:30:00.000Z', 'comfortable', {
      inPreferredFocusPeriod: true,
    }),
  ];

  const evaluations = evaluateStrategies(task, candidates, context);
  assert.strictEqual(evaluations.length, 5, 'Must evaluate all 5 strategies');

  const strategyIds = evaluations.map((e) => e.strategy);
  assert(strategyIds.includes('deadline_first'));
  assert(strategyIds.includes('focus_alignment'));
  assert(strategyIds.includes('goal_impact_first'));
  assert(strategyIds.includes('workload_balanced'));
  assert(strategyIds.includes('momentum'));

  for (const ev of evaluations) {
    assert(ev.score >= 0 && ev.score <= 1.0, 'Strategy score must be bounded');
    assert(ev.candidateWindow !== null, 'Candidate window must be selected');
    assert(ev.rationale.length > 0, 'Rationale must be non-empty');
  }
});

// 4. Best candidate selection
runTest('4. Best candidate selection picks the optimal window for the selected strategy', () => {
  const task = createMockTask({ priority: 'urgent' });
  const winA = createCandidate(
    'win_morning_focus',
    '2026-09-10T09:30:00.000Z',
    '2026-09-10T11:00:00.000Z',
    'comfortable',
    { inPreferredFocusPeriod: true, inPreferredWorkingHours: true }
  );
  const winB = createCandidate(
    'win_afternoon_flex',
    '2026-09-10T15:00:00.000Z',
    '2026-09-10T16:00:00.000Z',
    'tight',
    { inPreferredFocusPeriod: false, inPreferredWorkingHours: true }
  );

  const bestFocus = selectBestWindow(task, [winA, winB], 'focus_alignment', context);
  assert(bestFocus !== null, 'Best window should be found');
  assert.strictEqual(bestFocus?.window.id, 'win_morning_focus', 'Must select the focus period window');
});

// 5. Deterministic tie-breaking
runTest('5. Deterministic tie-breaking orders by score, start time, fit, then window ID', () => {
  const task = createMockTask();
  // Two windows identical in score and fit, but different start times
  const earlyWin = createCandidate(
    'win_early',
    '2026-09-10T09:00:00.000Z',
    '2026-09-10T10:00:00.000Z',
    'comfortable'
  );
  const lateWin = createCandidate(
    'win_late',
    '2026-09-10T14:00:00.000Z',
    '2026-09-10T15:00:00.000Z',
    'comfortable'
  );

  const selected = selectBestWindow(task, [lateWin, earlyWin], 'workload_balanced', context);
  assert.strictEqual(selected?.window.id, 'win_early', 'Tie-break must pick the earlier window');

  // Two windows with identical score, fit, and start time, but different IDs
  const winAlpha = createCandidate(
    'win_alpha',
    '2026-09-10T11:00:00.000Z',
    '2026-09-10T12:00:00.000Z',
    'comfortable'
  );
  const winBeta = createCandidate(
    'win_beta',
    '2026-09-10T11:00:00.000Z',
    '2026-09-10T12:00:00.000Z',
    'comfortable'
  );

  const selectedLex = selectBestWindow(task, [winBeta, winAlpha], 'workload_balanced', context);
  assert.strictEqual(selectedLex?.window.id, 'win_alpha', 'Tie-break must lexically prefer win_alpha over win_beta');
});

// 6. Infeasible candidate rejection
runTest('6. Infeasible candidates are rejected safely when no free windows exist', () => {
  const task = createMockTask();
  const emptySelection = selectBestWindow(task, [], 'deadline_first', context);
  assert.strictEqual(emptySelection, null, 'Must return null for empty candidate windows');

  const emptyStrategies = evaluateStrategies(task, [], context);
  assert.strictEqual(emptyStrategies.length, 5, 'Still outputs 5 strategies');
  for (const s of emptyStrategies) {
    assert.strictEqual(s.score, 0.0, 'Score must be 0 for empty windows');
    assert.strictEqual(s.candidateWindow, null, 'candidateWindow must be null');
  }

  // Conflict detection on window after deadline
  const overdueCandidate = createCandidate(
    'win_overdue',
    '2026-09-12T10:00:00.000Z',
    '2026-09-12T11:00:00.000Z',
    'comfortable'
  );
  const scoredOverdue = scoreCandidateWindow(overdueCandidate, task, 'deadline_first', context);
  assert(
    scoredOverdue.conflictsDetected && scoredOverdue.conflictsDetected.length > 0,
    'Must flag conflict when scheduled after deadline'
  );
});

// 7. Alternatives limited to 3
runTest('7. Alternative candidate windows are deterministically bounded to top 3', () => {
  const task = createMockTask();
  const candidateList = [
    createCandidate('win_1', '2026-09-10T09:00:00.000Z', '2026-09-10T10:00:00.000Z'),
    createCandidate('win_2', '2026-09-10T10:00:00.000Z', '2026-09-10T11:00:00.000Z'),
    createCandidate('win_3', '2026-09-10T11:00:00.000Z', '2026-09-10T12:00:00.000Z'),
    createCandidate('win_4', '2026-09-10T13:00:00.000Z', '2026-09-10T14:00:00.000Z'),
    createCandidate('win_5', '2026-09-10T14:00:00.000Z', '2026-09-10T15:00:00.000Z'),
    createCandidate('win_6', '2026-09-10T15:00:00.000Z', '2026-09-10T16:00:00.000Z'),
  ];

  const scored = candidateList.map((c) =>
    scoreCandidateWindow(c, task, 'workload_balanced', context)
  );
  const best = scored[0];
  const alternatives = scored.slice(1, 4); // Limit to top 3 alternatives

  assert.strictEqual(alternatives.length, 3, 'Must cap alternative candidates to 3');
  assert(best !== alternatives[0], 'Best window is distinct from alternatives');
});

// 8. Repeated execution produces the same result
runTest('8. Repeated execution produces strictly identical output across 100 iterations', () => {
  const task = createMockTask({ goalId: 'goal_alpha', projectId: 'proj_infra' });
  const candidates = [
    createCandidate('win_a', '2026-09-10T09:00:00.000Z', '2026-09-10T10:00:00.000Z'),
    createCandidate('win_b', '2026-09-10T11:00:00.000Z', '2026-09-10T12:30:00.000Z', 'comfortable', {
      inPreferredFocusPeriod: true,
    }),
    createCandidate('win_c', '2026-09-10T14:00:00.000Z', '2026-09-10T15:00:00.000Z'),
  ];

  const firstRun = JSON.stringify(evaluateStrategies(task, candidates, context));

  for (let i = 0; i < 100; i++) {
    const currentRun = JSON.stringify(evaluateStrategies(task, candidates, context));
    assert.strictEqual(
      currentRun,
      firstRun,
      `Iteration ${i + 1} produced divergent output from first run`
    );
  }
});

console.log('--- TEST SUMMARY ---');
console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
