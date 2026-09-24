/**
 * Sentinel Nova — Day 5C Step 2
 * ReviewerAgent & Action Safety Gate Test Suite
 *
 * Verifies:
 * 1. Valid SCHEDULE_TASK approved for review
 * 2. Unknown action rejected
 * 3. Malformed action rejected
 * 4. Missing actionId rejected
 * 5. Foreign task rejected
 * 6. Missing task rejected
 * 7. Invalid timestamp rejected
 * 8. Start >= end rejected
 * 9. Infeasible schedule rejected (sleep schedule or calendar conflicts)
 * 10. Google Calendar mutation rejected
 * 11. UserId injection rejected
 * 12. Secrets/tokens rejected
 * 13. Confirmation remains required
 * 14. Reviewer never mutates task
 * 15. Reviewer never calls ToolManager
 * 16. Deterministic result
 * 17. Repeated review gives identical result
 * 18. ReviewerAgent is registered in AgentRegistry
 * 19. ReviewerAgent generates zero action proposals
 */

import { reviewerAgent, ReviewerAgent } from '../agents/ReviewerAgent';
import { agentRegistry } from '../AgentRegistry';
import { AgentAction } from '../types';
import { createTask, getTaskById } from '../../taskStore';
import { savePlanningProfile } from '../../profileStore';
import { UserPlanningProfile } from '../../../src/types';
import { toolManager } from '../tools/ToolManager';

async function runReviewerAgentTests() {
  console.log('================================================================');
  console.log('--- SENTINEL NOVA REVIEWER AGENT TESTS (DAY 5C.2) ---');
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
  const userA = `test-rev-user-alpha-${runId}`;
  const userB = `test-rev-user-bravo-${runId}`;

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
    title: 'Audit Sentinel Nova Safety Architecture',
    description: 'Verify action safety gate and non-mutation constraints',
    priority: 'high',
    estimatedMinutes: 60,
    status: 'todo',
    tags: ['security', 'audit'],
    dueDate: '2026-09-30T18:00:00.000Z',
  });

  const taskB = await createTask(userB, {
    title: 'User B Confidential Ledger',
    description: 'Isolated task owned by User B',
    priority: 'urgent',
    estimatedMinutes: 45,
    status: 'todo',
  });

  // Calculate valid tomorrow window (10:00 - 11:00 UTC)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];

  const validStart = `${dateStr}T10:00:00.000Z`;
  const validEnd = `${dateStr}T11:00:00.000Z`;

  const validAction: AgentAction = {
    actionId: 'act_sched_valid_001',
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

  // -------------------------------------------------------------
  // TEST 1: Valid SCHEDULE_TASK approved for review
  // -------------------------------------------------------------
  console.log('\n--- 1. Valid Action Review Approval ---');
  const res1 = await reviewerAgent.reviewAction(validAction, { userId: userA });

  assert(res1.approved === true, '1. Valid SCHEDULE_TASK approved for review');
  assert(res1.actionId === validAction.actionId, '1b. Review result contains correct actionId');
  assert(res1.riskLevel === 'low', '1c. Risk level evaluated as low');
  assert(res1.requiresConfirmation === true, '1d. requiresConfirmation is strictly true');
  assert(Array.isArray(res1.reasons) && res1.reasons.length > 0, '1e. Reasons provided for approval');

  // -------------------------------------------------------------
  // TEST 2: Unknown action rejected
  // -------------------------------------------------------------
  console.log('\n--- 2. Unknown Action Type Rejection ---');
  const unknownAction: AgentAction = {
    actionId: 'act_unknown_002',
    type: 'INSPECT_CONTEXT' as any,
    description: 'Attempt to review non-schedulable action',
    target: taskA.id,
    parameters: {},
    riskLevel: 'low',
    requiresConfirmation: true,
    sourceAgentId: 'agent.context_inspector',
  };

  const res2 = await reviewerAgent.reviewAction(unknownAction, { userId: userA });
  assert(res2.approved === false, '2. Unknown action rejected');
  assert(res2.reasons.some((r) => r.includes('Unsupported action type')), '2b. Reason mentions unsupported action');

  // -------------------------------------------------------------
  // TEST 3: Malformed action rejected
  // -------------------------------------------------------------
  console.log('\n--- 3. Malformed Action Handling ---');
  const res3a = await reviewerAgent.reviewAction(null as any, { userId: userA });
  assert(res3a.approved === false, '3. Malformed action (null) rejected');

  const res3b = await reviewerAgent.reviewAction({} as any, { userId: userA });
  assert(res3b.approved === false, '3b. Malformed action (empty object) rejected');

  // -------------------------------------------------------------
  // TEST 4: Missing actionId rejected
  // -------------------------------------------------------------
  console.log('\n--- 4. Missing actionId Handling ---');
  const missingIdAction: AgentAction = {
    ...validAction,
    actionId: '',
  };
  const res4 = await reviewerAgent.reviewAction(missingIdAction, { userId: userA });
  assert(res4.approved === false, '4. Missing actionId rejected');
  assert(res4.reasons.some((r) => r.includes('Missing required non-empty actionId')), '4b. Reason indicates missing actionId');

  // -------------------------------------------------------------
  // TEST 5: Foreign task rejected
  // -------------------------------------------------------------
  console.log('\n--- 5. Foreign Task Ownership Isolation ---');
  const foreignTaskAction: AgentAction = {
    actionId: 'act_foreign_005',
    type: 'SCHEDULE_TASK',
    description: 'Attempt to review scheduling of User B task for User A',
    target: taskB.id,
    parameters: {
      taskId: taskB.id,
      scheduledStart: validStart,
      scheduledEnd: validEnd,
    },
    riskLevel: 'low',
    requiresConfirmation: true,
    sourceAgentId: 'agent.scheduler',
  };

  const res5 = await reviewerAgent.reviewAction(foreignTaskAction, { userId: userA });
  assert(res5.approved === false, '5. Foreign task rejected');
  assert(res5.reasons.some((r) => r.includes('not found') || r.includes('Access denied')), '5b. Reasons prevent foreign task execution');

  // -------------------------------------------------------------
  // TEST 6: Missing task rejected
  // -------------------------------------------------------------
  console.log('\n--- 6. Nonexistent Task Handling ---');
  const missingTaskAction: AgentAction = {
    actionId: 'act_missing_006',
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

  const res6 = await reviewerAgent.reviewAction(missingTaskAction, { userId: userA });
  assert(res6.approved === false, '6. Missing task rejected');
  assert(res6.reasons.some((r) => r.includes('not found')), '6b. Reason indicates task not found');

  // -------------------------------------------------------------
  // TEST 7: Invalid timestamp rejected
  // -------------------------------------------------------------
  console.log('\n--- 7. Invalid Timestamp Handling ---');
  const invalidTimestampAction: AgentAction = {
    ...validAction,
    actionId: 'act_invalid_time_007',
    parameters: {
      taskId: taskA.id,
      scheduledStart: 'not-a-valid-date',
      scheduledEnd: validEnd,
    },
  };

  const res7 = await reviewerAgent.reviewAction(invalidTimestampAction, { userId: userA });
  assert(res7.approved === false, '7. Invalid timestamp rejected');
  assert(res7.reasons.some((r) => r.includes('Malformed timestamp') || r.includes('Invalid')), '7b. Reason indicates invalid timestamp');

  // -------------------------------------------------------------
  // TEST 8: Start >= end rejected
  // -------------------------------------------------------------
  console.log('\n--- 8. Chronological Range Validation ---');
  const invertedTimeAction: AgentAction = {
    ...validAction,
    actionId: 'act_inverted_008',
    parameters: {
      taskId: taskA.id,
      scheduledStart: `${dateStr}T14:00:00.000Z`,
      scheduledEnd: `${dateStr}T12:00:00.000Z`, // End is before start
    },
  };

  const res8a = await reviewerAgent.reviewAction(invertedTimeAction, { userId: userA });
  assert(res8a.approved === false, '8. Start >= end rejected (start > end)');

  const equalTimeAction: AgentAction = {
    ...validAction,
    actionId: 'act_equal_008b',
    parameters: {
      taskId: taskA.id,
      scheduledStart: `${dateStr}T12:00:00.000Z`,
      scheduledEnd: `${dateStr}T12:00:00.000Z`, // Start == End
    },
  };

  const res8b = await reviewerAgent.reviewAction(equalTimeAction, { userId: userA });
  assert(res8b.approved === false, '8b. Start >= end rejected (start == end)');

  // -------------------------------------------------------------
  // TEST 9: Infeasible schedule rejected (Sleep schedule conflict)
  // -------------------------------------------------------------
  console.log('\n--- 9. Hard Constraint Feasibility (Sleep Rhythm) ---');
  // Profile sleep is 23:00 to 07:00. Schedule at 03:00 - 04:00 AM
  const sleepConflictAction: AgentAction = {
    ...validAction,
    actionId: 'act_sleep_009',
    parameters: {
      taskId: taskA.id,
      scheduledStart: `${dateStr}T03:00:00.000Z`,
      scheduledEnd: `${dateStr}T04:00:00.000Z`,
    },
  };

  const res9 = await reviewerAgent.reviewAction(sleepConflictAction, { userId: userA });
  assert(res9.approved === false, '9. Infeasible schedule rejected (sleep schedule violation)');
  assert(res9.reasons.some((r) => r.includes('infeasible') || r.includes('sleep')), '9b. Reason identifies feasibility / sleep violation');

  // -------------------------------------------------------------
  // TEST 10: Google Calendar mutation rejected
  // -------------------------------------------------------------
  console.log('\n--- 10. Google Calendar Read-Only Guarantee ---');
  const calMutationAction1: AgentAction = {
    actionId: 'act_cal_010a',
    type: 'UPDATE_CALENDAR_EVENT' as any,
    description: 'Attempt to write directly to Google Calendar',
    target: 'gcal_event_101',
    parameters: {
      eventId: 'gcal_event_101',
      title: 'Hacked Event',
    },
    riskLevel: 'high',
    requiresConfirmation: true,
    sourceAgentId: 'agent.scheduler',
  };

  const res10a = await reviewerAgent.reviewAction(calMutationAction1, { userId: userA });
  assert(res10a.approved === false, '10. Google Calendar mutation rejected (Calendar Action Type)');
  assert(res10a.reasons.some((r) => r.includes('Google Calendar mutation is strictly forbidden')), '10b. Reason cites calendar read-only guarantee');

  const calMutationAction2: AgentAction = {
    ...validAction,
    actionId: 'act_cal_010b',
    parameters: {
      ...validAction.parameters,
      syncToGoogleCalendar: true, // Parameter injection attempting calendar write
    },
  };

  const res10b = await reviewerAgent.reviewAction(calMutationAction2, { userId: userA });
  assert(res10b.approved === false, '10c. Google Calendar mutation rejected (Parameter flag)');

  // -------------------------------------------------------------
  // TEST 11: userId injection rejected
  // -------------------------------------------------------------
  console.log('\n--- 11. Parameter Identity Spoofing Protection ---');
  const spoofedUserAction: AgentAction = {
    ...validAction,
    actionId: 'act_spoof_011',
    parameters: {
      ...validAction.parameters,
      userId: 'attacker_injected_identity', // Injected foreign user identity
    },
  };

  const res11 = await reviewerAgent.reviewAction(spoofedUserAction, { userId: userA });
  assert(res11.approved === false, '11. userId injection rejected');
  assert(res11.riskLevel === 'critical', '11b. Risk level is critical for identity injection');
  assert(res11.reasons.some((r) => r.includes('Access denied') || r.includes('user identity injection')), '11c. Reason cites unauthorized identity injection');

  // -------------------------------------------------------------
  // TEST 12: Secrets/tokens rejected
  // -------------------------------------------------------------
  console.log('\n--- 12. Credential & Secret Leakage Prevention ---');
  const secretAction1: AgentAction = {
    ...validAction,
    actionId: 'act_secret_012a',
    description: 'Schedule task with auth token: Bearer ya29.a0AfH6SMDI...',
  };

  const res12a = await reviewerAgent.reviewAction(secretAction1, { userId: userA });
  assert(res12a.approved === false, '12. Secrets/tokens rejected (Bearer token in description)');
  assert(res12a.riskLevel === 'critical', '12b. Risk level is critical for secrets/tokens');

  const secretAction2: AgentAction = {
    ...validAction,
    actionId: 'act_secret_012b',
    parameters: {
      ...validAction.parameters,
      access_token: 'secret_oauth_token_val',
    },
  };

  const res12b = await reviewerAgent.reviewAction(secretAction2, { userId: userA });
  assert(res12b.approved === false, '12c. Secrets/tokens rejected (access_token in parameters)');

  // -------------------------------------------------------------
  // TEST 13: Confirmation remains required
  // -------------------------------------------------------------
  console.log('\n--- 13. Confirmation Invariant Enforcement ---');
  assert(res1.requiresConfirmation === true, '13. Confirmation remains required on approved review');

  // Test action attempting to bypass confirmation (requiresConfirmation: false)
  const bypassConfirmationAction: AgentAction = {
    ...validAction,
    actionId: 'act_bypass_013',
    requiresConfirmation: false, // Attempt to bypass confirmation
  };

  const res13 = await reviewerAgent.reviewAction(bypassConfirmationAction, { userId: userA });
  assert(res13.approved === false, '13b. Action attempting to bypass confirmation is rejected');
  assert(res13.requiresConfirmation === true, '13c. requiresConfirmation is strictly true in review output');

  // -------------------------------------------------------------
  // TEST 14: Reviewer never mutates task
  // -------------------------------------------------------------
  console.log('\n--- 14. Non-Mutation Guarantee ---');
  const beforeTask = await getTaskById(userA, taskA.id);
  assert(beforeTask?.scheduledStart === null, 'Task starts unscheduled');

  // Run review on valid action
  await reviewerAgent.reviewAction(validAction, { userId: userA });

  const afterTask = await getTaskById(userA, taskA.id);
  assert(afterTask?.scheduledStart === null, '14. Reviewer never mutates task scheduledStart');
  assert(afterTask?.scheduledEnd === null, '14b. Reviewer never mutates task scheduledEnd');
  assert(afterTask?.updatedAt === beforeTask?.updatedAt, '14c. Task updatedAt remains completely untouched');

  // -------------------------------------------------------------
  // TEST 15: Reviewer never calls ToolManager
  // -------------------------------------------------------------
  console.log('\n--- 15. Zero Tool Execution by Reviewer ---');
  let toolManagerCalled = false;
  const originalExecuteAction = toolManager.executeAction.bind(toolManager);

  // Spy on ToolManager
  toolManager.executeAction = async (...args) => {
    toolManagerCalled = true;
    return originalExecuteAction(...args);
  };

  try {
    await reviewerAgent.reviewAction(validAction, { userId: userA });
    assert(toolManagerCalled === false, '15. Reviewer never calls ToolManager');
  } finally {
    // Restore ToolManager
    toolManager.executeAction = originalExecuteAction;
  }

  // -------------------------------------------------------------
  // TEST 16: Deterministic result
  // -------------------------------------------------------------
  console.log('\n--- 16. Deterministic Result Verification ---');
  const reviewRunA = await reviewerAgent.reviewAction(validAction, { userId: userA });
  const reviewRunB = await reviewerAgent.reviewAction(validAction, { userId: userA });

  assert(reviewRunA.approved === reviewRunB.approved, '16. Deterministic approved state');
  assert(reviewRunA.riskLevel === reviewRunB.riskLevel, '16b. Deterministic riskLevel');
  assert(reviewRunA.requiresConfirmation === reviewRunB.requiresConfirmation, '16c. Deterministic requiresConfirmation');
  assert(JSON.stringify(reviewRunA.reasons) === JSON.stringify(reviewRunB.reasons), '16d. Deterministic reasons list');

  // -------------------------------------------------------------
  // TEST 17: Repeated review gives identical result across 10 runs
  // -------------------------------------------------------------
  console.log('\n--- 17. Invariant Stability across 10 Repeated Reviews ---');
  let identicalRuns = 0;
  const canonicalJson = JSON.stringify(reviewRunA);

  for (let i = 0; i < 10; i++) {
    const loopRes = await reviewerAgent.reviewAction(validAction, { userId: userA });
    if (JSON.stringify(loopRes) === canonicalJson) {
      identicalRuns++;
    }
  }

  assert(identicalRuns === 10, '17. Repeated review gives 10/10 strictly identical results');

  // -------------------------------------------------------------
  // TEST 18: AgentRegistry Registration & Capabilities
  // -------------------------------------------------------------
  console.log('\n--- 18. Registry & Architecture Verification ---');
  const registeredReviewer = agentRegistry.get('agent.reviewer');
  assert(registeredReviewer !== undefined, '18. ReviewerAgent is registered in AgentRegistry');
  assert(registeredReviewer?.id === 'agent.reviewer', '18b. Registered ID is agent.reviewer');
  assert(registeredReviewer?.capabilities.includes('review'), '18c. Includes capability: review');
  assert(registeredReviewer?.capabilities.includes('analysis'), '18d. Includes capability: analysis');

  // -------------------------------------------------------------
  // TEST 19: ReviewerAgent generates zero action proposals
  // -------------------------------------------------------------
  console.log('\n--- 19. Action Proposal Suppression Invariant ---');
  const agentExecutionResult = await reviewerAgent.execute({
    userId: userA,
    requestId: 'req_rev_exec',
    executionId: 'exec_rev_001',
    userRequest: 'Review proposed action safety',
    timestamp: new Date().toISOString(),
    timezone: 'UTC',
    parameters: {
      action: validAction,
    },
  });

  assert(agentExecutionResult.success === true, '19. ReviewerAgent execution succeeds');
  assert(agentExecutionResult.actions.length === 0, '19b. ReviewerAgent generates exactly zero action proposals');
  assert((agentExecutionResult.output as any)?.approved === true, '19c. Execution output contains review approval');

  // =============================================================
  // SUMMARY
  // =============================================================
  console.log('\n================================================================');
  console.log(`REVIEWER AGENT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runReviewerAgentTests().catch((err) => {
  console.error('Unhandled error in ReviewerAgent tests:', err);
  process.exit(1);
});
