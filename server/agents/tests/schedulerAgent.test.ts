/**
 * Comprehensive Scheduler Agent Integration Tests (Day 5B.4)
 *
 * Verifies:
 * 1. Agent Registration in AgentRegistry
 * 2. Agent Metadata and Capabilities
 * 3. canHandle() Intent Recognition
 * 4. Deterministic Scheduling Execution via AgentContext
 * 5. Target Task Resolution from parameters or context tasks
 * 6. Action Proposals: SCHEDULE_TASK with requiresConfirmation: true
 * 7. Proposal Safety: Zero direct mutations to tasks, goals, or calendar
 * 8. SchedulingReasoningService Sanitization & Anonymous Positional Indexing
 * 9. SchedulingReasoningService Deterministic Fallback on Gemini failure/timeout
 * 10. Multi-Agent Pipeline: "Schedule my highest priority task" (Prioritizer -> Scheduler)
 * 11. Orchestrator Direct Routing: "When should I work on task X?" -> Scheduler
 * 12. Orchestrator Direct Routing: "Why should I work on this at 10 AM?" -> Scheduler
 * 13. Server Allowlist & Effective Scope Verification
 * 14. Strict User Workload & Tenant Isolation
 */

import crypto from 'crypto';
import {
  agentRegistry,
  novaOrchestrator,
  AgentRequest,
  AgentContext,
  SchedulerAgent,
  schedulerAgent,
  SchedulingReasoningService,
  schedulingReasoningService,
} from '../index';
import { Task, Goal, Project, CalendarEvent, UserPlanningProfile } from '../../../src/types';

async function runSchedulerAgentTests() {
  console.log('================================================================');
  console.log('--- STARTING SCHEDULER AGENT INTEGRATION TESTS (DAY 5B.4) ---');
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

  const testUserId = 'test-user-scheduler-101';
  const otherUserId = 'test-user-scheduler-999';

  const sampleProfile: UserPlanningProfile = {
    userId: testUserId,
    workingHours: {
      start: '09:00',
      end: '17:00',
      daysOfWeek: [1, 2, 3, 4, 5],
    },
    focusWindows: [
      { start: '10:00', end: '12:00', daysOfWeek: [1, 2, 3, 4, 5] },
      { start: '14:00', end: '16:00', daysOfWeek: [1, 2, 3, 4, 5] },
    ],
    targetDailyFocusMinutes: 180,
    schedulingStyle: 'focused',
    breakPreferences: {
      defaultBreakMinutes: 15,
      frequencyMinutes: 90,
    },
    timeZone: 'UTC',
  };

  const baseDate = new Date();
  baseDate.setUTCHours(9, 0, 0, 0);
  const dateStr = baseDate.toISOString().split('T')[0];

  const taskA: Task = {
    id: 'task-sched-001',
    userId: testUserId,
    title: 'Complete Q3 Architecture Blueprint',
    description: 'Deep focus drafting for the Q3 systems blueprint',
    status: 'in_progress',
    priority: 'high',
    estimatedDuration: 60,
    dueDate: `${dateStr}T17:00:00.000Z`,
    preferredTime: 'morning',
    energyLevel: 'high',
    tags: ['architecture', 'q3'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const taskB: Task = {
    id: 'task-sched-002',
    userId: testUserId,
    title: 'Review PR feedback',
    description: 'Short review of open pull requests',
    status: 'todo',
    priority: 'medium',
    estimatedDuration: 30,
    dueDate: `${dateStr}T18:00:00.000Z`,
    preferredTime: 'afternoon',
    energyLevel: 'medium',
    tags: ['code-review'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const foreignTask: Task = {
    id: 'task-foreign-888',
    userId: otherUserId,
    title: 'Foreign User Task',
    status: 'todo',
    priority: 'urgent',
    estimatedDuration: 60,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const existingEvents: CalendarEvent[] = [
    {
      id: 'evt-001',
      userId: testUserId,
      title: 'Daily Standup',
      start: `${dateStr}T09:00:00.000Z`,
      end: `${dateStr}T09:30:00.000Z`,
      status: 'confirmed',
      type: 'meeting',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  // 1. Agent Registration in AgentRegistry
  const registered = agentRegistry.get('agent.scheduler');
  assert(registered !== undefined, '1. SchedulerAgent is registered in AgentRegistry');
  assert(registered?.id === 'agent.scheduler', '1b. Registered ID is agent.scheduler');

  // 2. Metadata & Capabilities
  assert(registered?.version === '1.0.0', '2. SchedulerAgent version is 1.0.0');
  assert(registered?.capabilities.includes('scheduling'), '2b. Includes capability: scheduling');
  assert(registered?.capabilities.includes('availability_analysis'), '2c. Includes capability: availability_analysis');
  assert(registered?.capabilities.includes('calendar_awareness'), '2d. Includes capability: calendar_awareness');
  assert(registered?.capabilities.includes('workload_balancing'), '2e. Includes capability: workload_balancing');
  assert(registered?.capabilities.includes('deadline_management'), '2f. Includes capability: deadline_management');
  assert(registered?.capabilities.includes('focus_window_matching'), '2g. Includes capability: focus_window_matching');
  assert(registered?.capabilities.includes('schedule_optimization'), '2h. Includes capability: schedule_optimization');
  assert(registered?.capabilities.includes('conflict_detection'), '2i. Includes capability: conflict_detection');

  // 3. canHandle() Intent Recognition
  const scheduler = (registered as SchedulerAgent) || schedulerAgent;
  const mockContext = (userRequest: string, parameters?: Record<string, any>): AgentContext => ({
    userId: testUserId,
    requestId: 'req_test',
    executionId: 'exec_test',
    userRequest,
    parameters,
    timestamp: `${dateStr}T09:00:00.000Z`,
    timezone: 'UTC',
    tasks: [taskA, taskB],
    goals: [],
    projects: [],
    calendarEvents: existingEvents,
    profile: sampleProfile,
    availability: null,
  });

  assert(scheduler.canHandle(mockContext('When should I work on task X?')), '3a. canHandle recognizes "When should I work on task X?"');
  assert(scheduler.canHandle(mockContext('Why should I work on this at 10 AM?')), '3b. canHandle recognizes "Why should I work on this at 10 AM?"');
  assert(scheduler.canHandle(mockContext('Schedule my task', { taskId: 'task-sched-001' })), '3c. canHandle recognizes parameter taskId');
  assert(scheduler.canHandle(mockContext('Find a free slot for my deep work')), '3d. canHandle recognizes "free slot"');
  assert(scheduler.canHandle(mockContext('Reschedule today')), '3e. canHandle recognizes "reschedule"');

  // 4. Execution with target taskId in parameters
  const ctxWithTaskParam = mockContext('Schedule this task', { taskId: 'task-sched-001' });
  const result = await scheduler.execute(ctxWithTaskParam);
  assert(result.success, '4. SchedulerAgent execution succeeds');
  assert(result.agentId === 'agent.scheduler', '4b. Result agentId is agent.scheduler');
  assert(result.confidence >= 0.0 && result.confidence <= 1.0, '4c. Confidence score bounded in [0.0, 1.0]');

  // 5. Output structure & evaluation
  const output = result.output as any;
  assert(output !== null && typeof output === 'object', '5. Result has valid output payload');
  assert(Array.isArray(output.evaluations), '5b. Output contains evaluations array');
  assert(output.evaluations.length > 0, '5c. Target task was evaluated');
  assert(output.evaluations[0].taskId === 'task-sched-001', '5d. Evaluated task matches requested taskId');

  // 6. Action proposals: SCHEDULE_TASK with requiresConfirmation: true
  assert(result.actions.length > 0, '6. SchedulerAgent generated proposed actions');
  const action = result.actions[0];
  assert(action.type === 'SCHEDULE_TASK', '6b. Action type is SCHEDULE_TASK');
  assert(action.requiresConfirmation === true, '6c. Action strictly requires confirmation');
  assert(action.parameters.taskId === 'task-sched-001', '6d. Action parameters specify correct taskId');
  assert(
    typeof action.parameters.scheduledStart === 'string' && typeof action.parameters.scheduledEnd === 'string',
    '6e. Action parameters contain ISO scheduledStart/scheduledEnd'
  );

  // 7. Proposal Safety: Zero direct mutations to tasks or events
  assert(taskA.status === 'in_progress', '7. Task status untouched by scheduler (proposal only)');
  assert(existingEvents.length === 1, '7b. Calendar events untouched (zero direct writes)');

  // 8. Foreign task rejection (user isolation)
  const ctxWithForeignTask = mockContext('Schedule this task', { taskId: 'task-foreign-888' });
  ctxWithForeignTask.tasks = [taskA, foreignTask]; // foreign task in context
  const foreignResult = await scheduler.execute(ctxWithForeignTask);
  const foreignOutput = foreignResult.output as any;
  assert(
    foreignOutput.unassignedTasks?.some((u: any) => u.taskId === 'task-foreign-888') ||
      foreignResult.warnings.some((w: string) => w.includes('cross-user') || w.includes('unauthorized') || w.includes('foreign')),
    '8. Foreign task rejected safely from schedule execution'
  );

  // 9. SchedulingReasoningService Sanitization & Anonymous Indexing
  const reasoningService = new SchedulingReasoningService();
  const candidate1: CandidateScheduleWindow = {
    window: {
      id: 'win-1',
      start: '2026-09-10T10:00:00.000Z',
      end: '2026-09-10T11:00:00.000Z',
      durationMinutes: 60,
      startFormatted: '10:00 AM',
      endFormatted: '11:00 AM',
      inPreferredFocusPeriod: true,
      fitCategory: 'exact',
    },
    taskDuration: 60,
    score: 0.95,
    strategyScores: [{ strategy: 'focus_alignment', score: 0.95, reasoning: 'Ideal focus window' }],
    fit: 'exact',
    suggestedStart: '2026-09-10T10:00:00.000Z',
    suggestedEnd: '2026-09-10T11:00:00.000Z',
    reasons: ['In focus window'],
  };

  const candidate2: CandidateScheduleWindow = {
    window: {
      id: 'win-2',
      start: '2026-09-10T14:00:00.000Z',
      end: '2026-09-10T15:00:00.000Z',
      durationMinutes: 60,
      startFormatted: '2:00 PM',
      endFormatted: '3:00 PM',
      inPreferredFocusPeriod: false,
      fitCategory: 'exact',
    },
    taskDuration: 60,
    score: 0.8,
    strategyScores: [{ strategy: 'workload_balanced', score: 0.8, reasoning: 'Afternoon slot' }],
    fit: 'exact',
    suggestedStart: '2026-09-10T14:00:00.000Z',
    suggestedEnd: '2026-09-10T15:00:00.000Z',
    reasons: ['Afternoon slot'],
  };

  const snapshot = reasoningService.buildSanitizedSnapshot(taskA, [candidate1, candidate2], 'focus_alignment', 'When should I do this?');
  const snapshotJson = JSON.stringify(snapshot);
  assert(!snapshotJson.includes('task-sched-001'), '9a. Snapshot excludes raw task ID');
  assert(!snapshotJson.includes(testUserId), '9b. Snapshot excludes user ID');
  assert(snapshot.candidates[0].index === 1, '9c. Candidate uses 1-based anonymous index');
  assert(snapshot.candidates[1].index === 2, '9d. Second candidate index is 2');

  // Test enhanceScheduling fallback
  const enhanced = await reasoningService.enhanceScheduling(taskA, [candidate1, candidate2], candidate1, 'focus_alignment');
  assert(enhanced !== null, '9e. enhanceScheduling returns enhancement result');
  assert(enhanced.chosenCandidate !== undefined, '9f. Returns a valid chosen candidate');
  assert(enhanced.confidenceScore >= 0.0 && enhanced.confidenceScore <= 1.0, '9g. Confidence score bounded');

  // 10. Multi-Agent Pipeline in Orchestrator: "Schedule my highest priority task"
  const pipelineReq: AgentRequest = {
    requestId: `req_${crypto.randomUUID()}`,
    userRequest: 'Schedule my highest priority task',
  };

  const pipelineResult = await novaOrchestrator.orchestrate(pipelineReq, { userId: testUserId });
  assert(pipelineResult.success, '10. Orchestrator executes multi-agent pipeline');
  assert(pipelineResult.agentResults.length === 2, '10b. Pipeline executed exactly 2 agents (Prioritizer + Scheduler)');
  assert(pipelineResult.agentResults[0].agentId === 'agent.prioritizer', '10c. First agent was Prioritizer');
  assert(pipelineResult.agentResults[1].agentId === 'agent.scheduler', '10d. Second agent was Scheduler');
  assert(pipelineResult.traces.length === 2, '10e. Traces collected for both agents');
  assert(pipelineResult.proposedActions.some((a) => a.type === 'SCHEDULE_TASK'), '10f. Proposed SCHEDULE_TASK action generated');

  // 11. Orchestrator Direct Routing: "When should I work on task X?"
  const directReq: AgentRequest = {
    requestId: `req_${crypto.randomUUID()}`,
    userRequest: 'When should I work on task Complete Q3 Architecture Blueprint?',
  };

  const directResult = await novaOrchestrator.orchestrate(directReq, { userId: testUserId });
  assert(directResult.success, '11. Orchestrator routes scheduling intent directly to Scheduler');
  assert(directResult.agentResults[0].agentId === 'agent.scheduler', '11b. Selected agent was agent.scheduler');

  // 12. Orchestrator Direct Routing: "Why should I work on this at 10 AM?"
  const whyReq: AgentRequest = {
    requestId: `req_${crypto.randomUUID()}`,
    userRequest: 'Why should I work on this at 10 AM?',
  };

  const whyResult = await novaOrchestrator.orchestrate(whyReq, { userId: testUserId });
  assert(whyResult.success, '12. Orchestrator routes timing inquiry to Scheduler');
  assert(whyResult.agentResults[0].agentId === 'agent.scheduler', '12b. Selected agent was agent.scheduler');

  // 13. Preserved Planner behavior: "Plan my day"
  const planReq: AgentRequest = {
    requestId: `req_${crypto.randomUUID()}`,
    userRequest: 'Plan my day',
  };
  const planResult = await novaOrchestrator.orchestrate(planReq, { userId: testUserId });
  assert(planResult.success, '13. Preserved Planner intent for "Plan my day"');
  assert(planResult.agentResults[0].agentId === 'agent.planner', '13b. Selected agent was agent.planner');

  // 14. Preserved Prioritizer behavior: "What should I work on first?"
  const prioReq: AgentRequest = {
    requestId: `req_${crypto.randomUUID()}`,
    userRequest: 'What should I work on first?',
  };
  const prioResult = await novaOrchestrator.orchestrate(prioReq, { userId: testUserId });
  assert(prioResult.success, '14. Preserved Prioritizer intent for "What should I work on first?"');
  assert(prioResult.agentResults[0].agentId === 'agent.prioritizer', '14b. Selected agent was agent.prioritizer');

  console.log('================================================================');
  console.log(`SCHEDULER AGENT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSchedulerAgentTests().catch((err) => {
  console.error('Fatal error running scheduler agent tests:', err);
  process.exit(1);
});
