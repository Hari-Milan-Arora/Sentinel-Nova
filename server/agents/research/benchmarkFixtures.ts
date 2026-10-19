/**
 * Deterministic Research Benchmark Fixtures 1 through 10 (Day 7)
 *
 * Provides standardized, isolated test scenarios for multi-agent Chief-of-Staff benchmarking.
 * No subjective winner hardcoding; defines structured context and mathematical invariants.
 */

import { Task, Goal, Project, UserPlanningProfile } from '../../../src/types';

export interface BenchmarkFixture {
  id: string;
  name: string;
  description: string;
  targetDate: string;
  profile: UserPlanningProfile;
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  calendarEvents: any[];
  expectedInvariants: {
    maxPlannedMinutes?: number;
    mustNotScheduleTaskIds?: string[];
    mustScheduleAheadOf?: [string, string]; // [prerequisiteId, dependentId]
    zeroHardConstraintViolations: boolean;
    sleepRhythmStrictlyEnforced: boolean;
  };
}

const standardProfile: UserPlanningProfile = {
  userId: 'fixture-user',
  onboardingCompleted: true,
  timezone: 'UTC',
  preferredWorkingHours: {
    startTime: '09:00',
    endTime: '17:00',
    preferredPeriods: ['Morning', 'Afternoon'],
  },
  sleepSchedule: {
    weekdaySleep: '23:00',
    weekdayWake: '07:00',
    weekendDifferent: false,
  },
  recurringBlocks: [
    {
      id: 'fix_standup',
      title: 'Daily Team Sync',
      dayOfWeek: 'Monday',
      startTime: '10:00',
      endTime: '10:30',
      category: 'work',
      priority: 'high',
    },
  ],
  focusWindowBufferMinutes: 15,
};

export const BENCHMARK_FIXTURES: Record<string, BenchmarkFixture> = {
  // FIXTURE 1: Normal Workload
  FIXTURE_1_NORMAL: {
    id: 'F1',
    name: 'Normal Workload',
    description: '3 tasks with ample free windows and healthy focus capacity',
    targetDate: '2026-10-19', // Monday
    profile: standardProfile,
    goals: [
      {
        id: 'g_main',
        userId: 'fixture-user',
        title: 'Launch Version 1.0',
        priority: 'high',
        status: 'active',
        progress: 40,
        createdAt: '2026-10-01',
        updatedAt: '2026-10-01',
      },
    ],
    projects: [
      {
        id: 'p_core',
        userId: 'fixture-user',
        title: 'Core Engine Dev',
        goalId: 'g_main',
        priority: 'high',
        status: 'active',
        progress: 50,
        createdAt: '2026-10-01',
        updatedAt: '2026-10-01',
      },
    ],
    tasks: [
      {
        id: 't_f1_1',
        userId: 'fixture-user',
        title: 'Implement Core Feature Alpha',
        priority: 'high',
        status: 'todo',
        estimatedMinutes: 60,
        goalId: 'g_main',
        projectId: 'p_core',
        createdAt: '2026-10-01',
        updatedAt: '2026-10-01',
      },
      {
        id: 't_f1_2',
        userId: 'fixture-user',
        title: 'Refactor Utility Code',
        priority: 'medium',
        status: 'todo',
        estimatedMinutes: 45,
        createdAt: '2026-10-01',
        updatedAt: '2026-10-01',
      },
      {
        id: 't_f1_3',
        userId: 'fixture-user',
        title: 'Update Documentation',
        priority: 'low',
        status: 'todo',
        estimatedMinutes: 30,
        createdAt: '2026-10-01',
        updatedAt: '2026-10-01',
      },
    ],
    calendarEvents: [],
    expectedInvariants: {
      zeroHardConstraintViolations: true,
      sleepRhythmStrictlyEnforced: true,
    },
  },

  // FIXTURE 2: Overloaded Day
  FIXTURE_2_OVERLOADED: {
    id: 'F2',
    name: 'Overloaded Day',
    description: 'Workload demands exceed available working hours; system must prioritize without overbooking',
    targetDate: '2026-10-19',
    profile: standardProfile,
    goals: [],
    projects: [],
    tasks: [
      { id: 't_f2_1', userId: 'fixture-user', title: 'Critical Hotfix', priority: 'urgent', estimatedMinutes: 120, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
      { id: 't_f2_2', userId: 'fixture-user', title: 'Architecture Review', priority: 'high', estimatedMinutes: 120, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
      { id: 't_f2_3', userId: 'fixture-user', title: 'Performance Optimization', priority: 'high', estimatedMinutes: 120, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
      { id: 't_f2_4', userId: 'fixture-user', title: 'Backlog Triage', priority: 'medium', estimatedMinutes: 120, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
    ],
    calendarEvents: [
      { id: 'c_f2_1', calendarId: 'primary', summary: 'Executive Briefing', start: '2026-10-19T13:00:00.000Z', end: '2026-10-19T15:00:00.000Z', transparency: 'opaque' },
    ],
    expectedInvariants: {
      maxPlannedMinutes: 300,
      zeroHardConstraintViolations: true,
      sleepRhythmStrictlyEnforced: true,
    },
  },

  // FIXTURE 3: Deadline Pressure
  FIXTURE_3_DEADLINE: {
    id: 'F3',
    name: 'Imminent Deadline Pressure',
    description: 'One task due in 2 hours vs distant tasks; evaluates temporal factor responsiveness',
    targetDate: '2026-10-19',
    profile: standardProfile,
    goals: [],
    projects: [],
    tasks: [
      { id: 't_f3_urgent', userId: 'fixture-user', title: 'Submit Financial Audit', priority: 'medium', dueDate: '2026-10-19', dueTime: '11:00', estimatedMinutes: 60, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
      { id: 't_f3_distant', userId: 'fixture-user', title: 'Q4 Strategy Draft', priority: 'high', dueDate: '2026-11-15', estimatedMinutes: 60, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
    ],
    calendarEvents: [],
    expectedInvariants: {
      zeroHardConstraintViolations: true,
      sleepRhythmStrictlyEnforced: true,
    },
  },

  // FIXTURE 4: Calendar Conflict
  FIXTURE_4_CALENDAR_CONFLICT: {
    id: 'F4',
    name: 'Opaque Calendar Conflict',
    description: 'Calendar event overlaps prime morning slot; engine must route to afternoon',
    targetDate: '2026-10-19',
    profile: standardProfile,
    goals: [],
    projects: [],
    tasks: [
      { id: 't_f4_1', userId: 'fixture-user', title: 'Deep Work Design Session', priority: 'high', estimatedMinutes: 90, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
    ],
    calendarEvents: [
      { id: 'c_f4_opaque', calendarId: 'primary', summary: 'Mandatory Company All-Hands', start: '2026-10-19T09:00:00.000Z', end: '2026-10-19T12:00:00.000Z', transparency: 'opaque' },
    ],
    expectedInvariants: {
      zeroHardConstraintViolations: true,
      sleepRhythmStrictlyEnforced: true,
    },
  },

  // FIXTURE 5: Blocked Dependency
  FIXTURE_5_DEPENDENCY: {
    id: 'F5',
    name: 'Strict Task Dependency Chain',
    description: 'Task B depends on Task A; Task B must not execute ahead of Task A',
    targetDate: '2026-10-19',
    profile: standardProfile,
    goals: [],
    projects: [],
    tasks: [
      { id: 't_f5_prereq', userId: 'fixture-user', title: 'Database Migration Script', priority: 'high', estimatedMinutes: 45, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
      { id: 't_f5_dep', userId: 'fixture-user', title: 'Frontend Entity Rendering', priority: 'high', dependencyIds: ['t_f5_prereq'], estimatedMinutes: 45, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
    ],
    calendarEvents: [],
    expectedInvariants: {
      mustScheduleAheadOf: ['t_f5_prereq', 't_f5_dep'],
      zeroHardConstraintViolations: true,
      sleepRhythmStrictlyEnforced: true,
    },
  },

  // FIXTURE 6: Multiple Equal-Priority Tasks
  FIXTURE_6_EQUAL_PRIORITY: {
    id: 'F6',
    name: 'Equal Priority Tie-Breaking',
    description: 'Identical priority, effort, and duration items; tests 100% deterministic tie-breaking',
    targetDate: '2026-10-19',
    profile: standardProfile,
    goals: [],
    projects: [],
    tasks: [
      { id: 't_f6_alpha', userId: 'fixture-user', title: 'Audit Alpha Module', priority: 'medium', estimatedMinutes: 30, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
      { id: 't_f6_beta', userId: 'fixture-user', title: 'Audit Beta Module', priority: 'medium', estimatedMinutes: 30, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
      { id: 't_f6_gamma', userId: 'fixture-user', title: 'Audit Gamma Module', priority: 'medium', estimatedMinutes: 30, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
    ],
    calendarEvents: [],
    expectedInvariants: {
      zeroHardConstraintViolations: true,
      sleepRhythmStrictlyEnforced: true,
    },
  },

  // FIXTURE 7: Insufficient Capacity
  FIXTURE_7_INSUFFICIENT_TIME: {
    id: 'F7',
    name: 'Insufficient Window Capacity',
    description: 'Task requiring 180m when only 45m slots exist; must reject safely without impossible assignment',
    targetDate: '2026-10-19',
    profile: standardProfile,
    goals: [],
    projects: [],
    tasks: [
      { id: 't_f7_huge', userId: 'fixture-user', title: 'Massive Monolith Re-architecture', priority: 'high', estimatedMinutes: 240, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
    ],
    calendarEvents: [
      { id: 'c_f7_1', calendarId: 'primary', summary: 'Block 1', start: '2026-10-19T07:00:00.000Z', end: '2026-10-19T12:00:00.000Z', transparency: 'opaque' },
      { id: 'c_f7_2', calendarId: 'primary', summary: 'Block 2', start: '2026-10-19T12:30:00.000Z', end: '2026-10-19T23:00:00.000Z', transparency: 'opaque' },
    ],
    expectedInvariants: {
      mustNotScheduleTaskIds: ['t_f7_huge'],
      zeroHardConstraintViolations: true,
      sleepRhythmStrictlyEnforced: true,
    },
  },

  // FIXTURE 8: Sleep Boundary
  FIXTURE_8_SLEEP_BOUNDARY: {
    id: 'F8',
    name: 'Sleep Boundary Preservation',
    description: 'Evaluates candidate windows across evening hours to ensure zero sleep schedule intrusion',
    targetDate: '2026-10-19',
    profile: {
      ...standardProfile,
      sleepSchedule: { weekdaySleep: '22:00', weekdayWake: '08:00', weekendDifferent: false },
    },
    goals: [],
    projects: [],
    tasks: [
      { id: 't_f8_night', userId: 'fixture-user', title: 'Late Night Review', priority: 'medium', estimatedMinutes: 60, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
    ],
    calendarEvents: [],
    expectedInvariants: {
      zeroHardConstraintViolations: true,
      sleepRhythmStrictlyEnforced: true,
    },
  },

  // FIXTURE 9: Goal-Heavy Strategic Workload
  FIXTURE_9_GOAL_HEAVY: {
    id: 'F9',
    name: 'Goal-Heavy Strategic Workload',
    description: '3 goals with linked projects and tasks; validates strategic impact boosting',
    targetDate: '2026-10-19',
    profile: standardProfile,
    goals: [
      { id: 'g_crit', userId: 'fixture-user', title: 'Secure Enterprise Certification', priority: 'critical', status: 'active', progress: 80, createdAt: '2026-10-01', updatedAt: '2026-10-01' },
      { id: 'g_med', userId: 'fixture-user', title: 'Brand Redesign', priority: 'medium', status: 'active', progress: 20, createdAt: '2026-10-01', updatedAt: '2026-10-01' },
    ],
    projects: [
      { id: 'p_crit', userId: 'fixture-user', title: 'ISO 27001 Compliance', goalId: 'g_crit', priority: 'critical', status: 'active', progress: 85, createdAt: '2026-10-01', updatedAt: '2026-10-01' },
    ],
    tasks: [
      { id: 't_f9_strat', userId: 'fixture-user', title: 'Finalize SOC2 Audit Evidence', priority: 'high', goalId: 'g_crit', projectId: 'p_crit', estimatedMinutes: 60, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
      { id: 't_f9_unlinked', userId: 'fixture-user', title: 'Clean Up Email Inbox', priority: 'high', estimatedMinutes: 60, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
    ],
    calendarEvents: [],
    expectedInvariants: {
      zeroHardConstraintViolations: true,
      sleepRhythmStrictlyEnforced: true,
    },
  },

  // FIXTURE 10: Mixed Real-World Workload
  FIXTURE_10_MIXED: {
    id: 'F10',
    name: 'Complex Mixed Real-World Scenario',
    description: 'Combines deadlines, dependencies, opaque meetings, recurring commitments, and goals',
    targetDate: '2026-10-19',
    profile: standardProfile,
    goals: [
      { id: 'g_launch', userId: 'fixture-user', title: 'Q4 Product Launch', priority: 'high', status: 'active', progress: 65, createdAt: '2026-10-01', updatedAt: '2026-10-01' },
    ],
    projects: [
      { id: 'p_api', userId: 'fixture-user', title: 'API v2 Gateway', goalId: 'g_launch', priority: 'high', status: 'active', progress: 70, createdAt: '2026-10-01', updatedAt: '2026-10-01' },
    ],
    tasks: [
      { id: 't_f10_db', userId: 'fixture-user', title: 'Deploy Migration', priority: 'urgent', dueDate: '2026-10-19', dueTime: '13:00', estimatedMinutes: 45, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
      { id: 't_f10_api', userId: 'fixture-user', title: 'Expose Route', priority: 'urgent', dependencyIds: ['t_f10_db'], estimatedMinutes: 45, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
      { id: 't_f10_docs', userId: 'fixture-user', title: 'API Documentation', priority: 'medium', estimatedMinutes: 30, status: 'todo', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
    ],
    calendarEvents: [
      { id: 'c_f10_standup', calendarId: 'primary', summary: 'Sprint Standup', start: '2026-10-19T10:00:00.000Z', end: '2026-10-19T10:30:00.000Z', transparency: 'opaque' },
      { id: 'c_f10_lunch', calendarId: 'primary', summary: 'Lunch & Sync', start: '2026-10-19T12:00:00.000Z', end: '2026-10-19T13:00:00.000Z', transparency: 'opaque' },
    ],
    expectedInvariants: {
      mustScheduleAheadOf: ['t_f10_db', 't_f10_api'],
      zeroHardConstraintViolations: true,
      sleepRhythmStrictlyEnforced: true,
    },
  },
};
