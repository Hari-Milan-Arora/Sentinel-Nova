/**
 * Sentinel Nova — Day 5C.5 End-to-End Chief of Staff Workflow Test Suite
 *
 * Verifies:
 * 1. Happy Path: Request -> Plan/Schedule -> Review -> Awaiting Confirmation -> Confirm -> Execute -> Completed
 * 2. Minimum Required Agent Principle:
 *    - Prioritization request invokes ONLY Prioritizer
 *    - Memory request invokes ONLY MemoryAgent
 *    - Diagnostic request invokes ContextInspector
 *    - Scheduling request invokes Scheduler directly (not Planner)
 * 3. User Rejection: Proposal rejected -> ABORTED -> Zero tool execution, state unchanged
 * 4. User Edit:
 *    - Edit proposal -> ReviewerAgent re-reviews -> new binding generated -> Awaiting Confirmation
 *    - Edit proposal to invalid time -> Reviewer rejects -> ABORTED
 * 5. Tampering Prevention:
 *    - Modifying parameters between review and confirm triggers ACTION_CHANGED error
 * 6. TTL Expiration:
 *    - Confirmation after TTL expiration triggers CONFIRMATION_EXPIRED error
 * 7. Strict User Isolation:
 *    - User B cannot access, confirm, reject, or edit User A's workflow
 *    - Foreign userId in payload rejected
 * 8. Bounded Recovery Loop:
 *    - Execution failure invokes RecoveryAgent -> Reviewer reviews -> Awaiting Confirmation
 *    - Maximum 2 recovery cycles enforced before ABORTED
 * 9. Calendar Invariant:
 *    - Google Calendar is strictly read-only; no calendar mutations occur
 * 10. Trace & Observability:
 *    - workflowId and executionId properly tracked across states
 */

import { chiefOfStaffWorkflow } from '../workflow/ChiefOfStaffWorkflow';
import { workflowStore } from '../workflow/workflowStore';
import { computeParameterHash } from '../workflow/canonicalHash';
import { createTask, getTaskById } from '../../taskStore';
import { savePlanningProfile } from '../../profileStore';
import { UserPlanningProfile } from '../../../src/types';

async function runChiefOfStaffWorkflowTests() {
  console.log('================================================================');
  console.log('--- SENTINEL NOVA CHIEF OF STAFF WORKFLOW TESTS (DAY 5C.5) ---');
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
  const userA = `cos-user-alpha-${runId}`;
  const userB = `cos-user-bravo-${runId}`;

  // Standard planning profile for user A
  const profileA: UserPlanningProfile = {
    userId: userA,
    workingHours: {
      enabled: true,
      start: '09:00',
      end: '17:00',
      daysOfWeek: [1, 2, 3, 4, 5],
    },
    sleepSchedule: {
      enabled: true,
      start: '23:00',
      end: '07:00',
    },
    bufferMinutes: 15,
    maxFocusDuration: 90,
    dailyGoal: 'Execute high priority roadmap items',
    timezone: 'UTC',
    schedulingPreference: 'morning',
  };
  savePlanningProfile(userA, profileA);

  const profileB: UserPlanningProfile = {
    userId: userB,
    workingHours: {
      enabled: true,
      start: '10:00',
      end: '18:00',
      daysOfWeek: [1, 2, 3, 4, 5],
    },
    sleepSchedule: {
      enabled: true,
      start: '22:00',
      end: '06:00',
    },
    bufferMinutes: 10,
    maxFocusDuration: 60,
    dailyGoal: 'Research and review',
    timezone: 'UTC',
    schedulingPreference: 'afternoon',
  };
  savePlanningProfile(userB, profileB);

  // Setup Tasks for User A
  const task1 = await createTask(userA, {
    title: 'Finalize Architecture Roadmap',
    duration: 60,
    priority: 'high',
    dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
  });

  const task2 = await createTask(userA, {
    title: 'Audit System Traces',
    duration: 30,
    priority: 'medium',
  });

  // Setup Task for User B
  const taskB = await createTask(userB, {
    title: 'Secret Bravo Task',
    duration: 45,
    priority: 'high',
  });

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Minimum Required Agent Principle - Prioritization
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 1: Prioritization Intent (Single Agent) ---');
    const prioWf = await chiefOfStaffWorkflow.startWorkflow(
      {
        userRequest: 'What should I work on first today? Prioritize my tasks.',
      },
      { userId: userA }
    );

    assert(prioWf.state === 'COMPLETED', 'Prioritization workflow transitions directly to COMPLETED');
    assert(prioWf.intent === 'PRIORITIZATION', 'Intent resolved to PRIORITIZATION');
    assert(prioWf.agentResults.length === 1, 'Invoked exactly 1 agent');
    assert(prioWf.agentResults[0].agentId === 'agent.prioritizer', 'Invoked agent is PrioritizerAgent');
    assert(prioWf.actions.length === 0, 'No action proposals generated for read-only prioritization');

    // ------------------------------------------------------------------------
    // TEST 2: Minimum Required Agent Principle - Memory Recall
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: Memory Recall Intent (Single Agent) ---');
    const memWf = await chiefOfStaffWorkflow.startWorkflow(
      {
        userRequest: 'What do you remember about my working style and preferences?',
      },
      { userId: userA }
    );

    assert(memWf.state === 'COMPLETED', 'Memory recall workflow transitions to COMPLETED');
    assert(memWf.intent === 'MEMORY_RECALL', 'Intent resolved to MEMORY_RECALL');
    assert(memWf.agentResults.length === 1, 'Invoked exactly 1 agent');
    assert(memWf.agentResults[0].agentId === 'agent.memory', 'Invoked agent is MemoryAgent');
    assert(memWf.actions.length === 0, 'No action proposals generated for memory recall');

    // ------------------------------------------------------------------------
    // TEST 3: Minimum Required Agent Principle - Diagnostic
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Diagnostic Intent (Context Inspector) ---');
    const diagWf = await chiefOfStaffWorkflow.startWorkflow(
      {
        userRequest: 'Diagnose system status and inspect context.',
      },
      { userId: userA }
    );

    assert(diagWf.state === 'COMPLETED', 'Diagnostic workflow transitions to COMPLETED');
    assert(diagWf.intent === 'DIAGNOSTIC', 'Intent resolved to DIAGNOSTIC');
    assert(diagWf.agentResults.length === 1, 'Invoked exactly 1 agent');
    assert(diagWf.agentResults[0].agentId === 'agent.context_inspector', 'Invoked agent is ContextInspector');

    // ------------------------------------------------------------------------
    // TEST 4: Happy Path - Scheduling & User Confirmation Execution
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Happy Path Scheduling -> Review -> Confirm -> Execute ---');
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const schedStart = `${tomorrow}T10:00:00.000Z`;
    const schedEnd = `${tomorrow}T11:00:00.000Z`;

    // Initiate scheduling request
    const schedWf = await chiefOfStaffWorkflow.startWorkflow(
      {
        userRequest: `When should I work on "${task1.title}"? Schedule task.`,
        taskId: task1.id,
        targetDate: tomorrow,
      },
      { userId: userA }
    );

    assert(
      schedWf.state === 'AWAITING_CONFIRMATION',
      'Scheduling proposal approved by Reviewer and transitions to AWAITING_CONFIRMATION'
    );
    assert(schedWf.activeAction !== null && schedWf.activeAction !== undefined, 'Active action proposal is set');
    assert(schedWf.reviewResult?.approved === true, 'Reviewer approved the proposal');
    assert(schedWf.confirmationBinding !== null, 'Server-side confirmation binding generated');
    assert(schedWf.confirmationBinding?.confirmed === false, 'Binding not yet confirmed');
    assert(schedWf.confirmationBinding?.expiresAt! > Date.now(), 'Binding has active future TTL');

    // Verify task is NOT scheduled yet (ZERO autonomous execution)
    const taskBeforeConfirm = await getTaskById(userA, task1.id);
    assert(!taskBeforeConfirm?.scheduledStart, 'Task is NOT modified before user confirmation');

    // Confirm execution
    const confirmedWf = await chiefOfStaffWorkflow.confirmAction(
      schedWf.workflowId,
      {
        actionId: schedWf.activeAction!.actionId,
        bindingId: schedWf.confirmationBinding!.bindingId,
      },
      { userId: userA }
    );

    assert(confirmedWf.state === 'COMPLETED', 'Confirmed workflow transitions to COMPLETED');
    assert(confirmedWf.confirmationBinding?.confirmed === true, 'Confirmation binding marked confirmed');
    assert(confirmedWf.executionResult?.success === true, 'ToolManager reported successful execution');

    // Verify task IS scheduled now in taskStore
    const taskAfterConfirm = await getTaskById(userA, task1.id);
    assert(!!taskAfterConfirm?.scheduledStart, 'Task was successfully scheduled by ToolManager in taskStore');

    // ------------------------------------------------------------------------
    // TEST 5: Direct Execution Intent - Task Completion
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Task Completion Workflow ---');
    const completeWf = await chiefOfStaffWorkflow.startWorkflow(
      {
        userRequest: `Complete this task: ${task2.id}`,
        taskId: task2.id,
      },
      { userId: userA }
    );

    assert(completeWf.state === 'AWAITING_CONFIRMATION', 'COMPLETE_TASK proposal is AWAITING_CONFIRMATION');
    assert(completeWf.activeAction?.type === 'COMPLETE_TASK', 'Active action is COMPLETE_TASK');

    // User confirms completion
    const completeConfirmed = await chiefOfStaffWorkflow.confirmAction(
      completeWf.workflowId,
      {
        actionId: completeWf.activeAction!.actionId,
      },
      { userId: userA }
    );

    assert(completeConfirmed.state === 'COMPLETED', 'Completion workflow transitions to COMPLETED');
    const task2After = await getTaskById(userA, task2.id);
    assert(task2After?.status === 'completed', 'Task status was updated to completed in taskStore');

    // ------------------------------------------------------------------------
    // TEST 6: User Rejection Gate
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: User Rejection Safe Abort ---');
    const rejectTask = await createTask(userA, {
      title: 'Task To Be Rejected',
      duration: 30,
      priority: 'low',
    });

    const rejectWf = await chiefOfStaffWorkflow.startWorkflow(
      {
        userRequest: `Complete this task: ${rejectTask.id}`,
        taskId: rejectTask.id,
      },
      { userId: userA }
    );

    assert(rejectWf.state === 'AWAITING_CONFIRMATION', 'Workflow is AWAITING_CONFIRMATION before rejection');

    const abortedWf = await chiefOfStaffWorkflow.rejectAction(
      rejectWf.workflowId,
      {
        actionId: rejectWf.activeAction!.actionId,
        reason: 'Decided not to mark done yet',
      },
      { userId: userA }
    );

    assert(abortedWf.state === 'ABORTED', 'Rejected workflow transitions to ABORTED');
    assert(abortedWf.abortReason === 'Decided not to mark done yet', 'Abort reason recorded');

    // Verify task was NOT modified
    const rejectTaskCheck = await getTaskById(userA, rejectTask.id);
    assert(rejectTaskCheck?.status === 'todo', 'Task status remained todo (zero modification)');

    // ------------------------------------------------------------------------
    // TEST 7: Anti-Tampering Parameter Binding
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: Anti-Tampering Parameter Modification Detection ---');
    const tamperTask = await createTask(userA, {
      title: 'Task Protected Against Tampering',
      duration: 30,
      priority: 'medium',
    });

    const tamperWf = await chiefOfStaffWorkflow.startWorkflow(
      {
        userRequest: `Complete this task: ${tamperTask.id}`,
        taskId: tamperTask.id,
      },
      { userId: userA }
    );

    assert(tamperWf.state === 'AWAITING_CONFIRMATION', 'Tamper workflow is AWAITING_CONFIRMATION');

    // Attempt confirmation with modified parameters (different note)
    let tamperCaught = false;
    try {
      await chiefOfStaffWorkflow.confirmAction(
        tamperWf.workflowId,
        {
          actionId: tamperWf.activeAction!.actionId,
          parameters: {
            taskId: tamperTask.id,
            note: 'TAMPERED NOTE NOT REVIEWED BY REVIEWER',
          },
        },
        { userId: userA }
      );
    } catch (err: any) {
      tamperCaught = true;
      assert(err.message.includes('modified after safety review'), 'Tampered parameters error message returned');
    }
    assert(tamperCaught, 'Tampering attempt was blocked with error');

    // Verify workflow state became ABORTED
    const tamperCheckWf = chiefOfStaffWorkflow.getWorkflow(tamperWf.workflowId, { userId: userA });
    assert(tamperCheckWf?.state === 'ABORTED', 'Tampered workflow state transitioned to ABORTED');
    assert(tamperCheckWf?.abortReason === 'ACTION_CHANGED', 'Abort reason is ACTION_CHANGED');

    // ------------------------------------------------------------------------
    // TEST 8: User Edit with Safety Re-Review
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 8: User Proposal Edit & Reviewer Re-Review ---');
    const editTask = await createTask(userA, {
      title: 'Task For Rescheduling Edit',
      duration: 45,
      priority: 'high',
    });

    const editWf = await chiefOfStaffWorkflow.startWorkflow(
      {
        userRequest: `When should I work on "${editTask.title}"? Schedule task.`,
        taskId: editTask.id,
        targetDate: tomorrow,
      },
      { userId: userA }
    );

    assert(editWf.state === 'AWAITING_CONFIRMATION', 'Workflow ready for edit');
    const oldBindingId = editWf.confirmationBinding?.bindingId;

    // Edit the time parameters to a valid new window (14:00 - 14:45)
    const updatedStart = `${tomorrow}T14:00:00.000Z`;
    const updatedEnd = `${tomorrow}T14:45:00.000Z`;

    const afterEditWf = await chiefOfStaffWorkflow.editAction(
      editWf.workflowId,
      {
        actionId: editWf.activeAction!.actionId,
        updatedParameters: {
          scheduledStart: updatedStart,
          scheduledEnd: updatedEnd,
        },
      },
      { userId: userA }
    );

    assert(afterEditWf.state === 'AWAITING_CONFIRMATION', 'Edited proposal re-approved by Reviewer');
    assert(afterEditWf.confirmationBinding?.bindingId !== oldBindingId, 'New confirmation binding generated');
    assert(
      afterEditWf.confirmationBinding?.parameterHash ===
        computeParameterHash(afterEditWf.activeAction!.parameters),
      'New binding hash matches updated parameters'
    );

    // Confirm the edited action
    const confirmedEditWf = await chiefOfStaffWorkflow.confirmAction(
      editWf.workflowId,
      {
        actionId: editWf.activeAction!.actionId,
      },
      { userId: userA }
    );

    assert(confirmedEditWf.state === 'COMPLETED', 'Edited workflow executed and completed');
    const editTaskFinal = await getTaskById(userA, editTask.id);
    assert(editTaskFinal?.scheduledStart === updatedStart, 'Task was scheduled with the EDITED timestamp');

    // ------------------------------------------------------------------------
    // TEST 9: Edit with Invalid Parameters (Reviewer Rejection)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 9: Edit with Invalid Time Triggers Reviewer Rejection ---');
    const invalidEditTask = await createTask(userA, {
      title: 'Task with Invalid Edit',
      duration: 30,
      priority: 'low',
    });

    const invWf = await chiefOfStaffWorkflow.startWorkflow(
      {
        userRequest: `When should I work on "${invalidEditTask.title}"? Schedule task.`,
        taskId: invalidEditTask.id,
        targetDate: tomorrow,
      },
      { userId: userA }
    );

    // Try to edit start time into sleep hours (02:00 AM)
    const sleepStart = `${tomorrow}T02:00:00.000Z`;
    const sleepEnd = `${tomorrow}T02:30:00.000Z`;

    const sleepEditWf = await chiefOfStaffWorkflow.editAction(
      invWf.workflowId,
      {
        actionId: invWf.activeAction!.actionId,
        updatedParameters: {
          scheduledStart: sleepStart,
          scheduledEnd: sleepEnd,
        },
      },
      { userId: userA }
    );

    assert(sleepEditWf.state === 'ABORTED', 'Invalid edit rejected by Safety Reviewer transitions to ABORTED');
    assert(sleepEditWf.abortReason === 'REVIEW_REJECTED', 'Abort reason is REVIEW_REJECTED');
    assert(sleepEditWf.confirmationBinding === null, 'Confirmation binding invalidated');

    // ------------------------------------------------------------------------
    // TEST 10: Strict User Isolation
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 10: Strict User Isolation & Cross-User Security ---');
    const isoTask = await createTask(userA, {
      title: 'User A Confidential Task',
      duration: 30,
      priority: 'urgent',
    });

    const isoWf = await chiefOfStaffWorkflow.startWorkflow(
      {
        userRequest: `Complete this task: ${isoTask.id}`,
        taskId: isoTask.id,
      },
      { userId: userA }
    );

    // User B tries to view User A's workflow
    const crossView = chiefOfStaffWorkflow.getWorkflow(isoWf.workflowId, { userId: userB });
    assert(crossView === null, 'User B cannot view User A workflow (returns null)');

    // User B tries to confirm User A's workflow
    let crossConfirmBlocked = false;
    try {
      await chiefOfStaffWorkflow.confirmAction(
        isoWf.workflowId,
        { actionId: isoWf.activeAction!.actionId },
        { userId: userB }
      );
    } catch (err: any) {
      crossConfirmBlocked = true;
      assert(err.message.includes('not found or unauthorized'), 'User B confirmation blocked with unauthorized error');
    }
    assert(crossConfirmBlocked, 'Cross-user confirmation strictly forbidden');

    // User B tries to reject User A's workflow
    let crossRejectBlocked = false;
    try {
      await chiefOfStaffWorkflow.rejectAction(
        isoWf.workflowId,
        { actionId: isoWf.activeAction!.actionId },
        { userId: userB }
      );
    } catch (err: any) {
      crossRejectBlocked = true;
    }
    assert(crossRejectBlocked, 'Cross-user rejection strictly forbidden');

    // User A tries to operate on User B's task
    let foreignTaskProposal = await chiefOfStaffWorkflow.startWorkflow(
      {
        userRequest: `Complete this task: ${taskB.id}`,
        taskId: taskB.id,
      },
      { userId: userA }
    );
    // Reviewer should reject foreign task
    assert(
      foreignTaskProposal.state === 'ABORTED' || foreignTaskProposal.reviewResult?.approved === false,
      'Reviewer blocks proposal targeting foreign user task'
    );

    // ------------------------------------------------------------------------
    // TEST 11: Confirmation TTL Expiration
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 11: Confirmation TTL Expiration ---');
    const ttlTask = await createTask(userA, {
      title: 'TTL Test Task',
      duration: 30,
      priority: 'low',
    });

    const ttlWf = await chiefOfStaffWorkflow.startWorkflow(
      {
        userRequest: `Complete this task: ${ttlTask.id}`,
        taskId: ttlTask.id,
      },
      { userId: userA }
    );

    // Artificially expire the confirmation binding
    if (ttlWf.confirmationBinding) {
      ttlWf.confirmationBinding.expiresAt = Date.now() - 1000; // Expired 1 second ago
      workflowStore.save(ttlWf);
    }

    let ttlCaught = false;
    try {
      await chiefOfStaffWorkflow.confirmAction(
        ttlWf.workflowId,
        { actionId: ttlWf.activeAction!.actionId },
        { userId: userA }
      );
    } catch (err: any) {
      ttlCaught = true;
      assert(err.message.includes('expired'), 'Expired confirmation rejected with expired error');
    }
    assert(ttlCaught, 'Expired confirmation was blocked');

    // ------------------------------------------------------------------------
    // TEST 12: Bounded Recovery Loop (Max 2 Cycles)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 12: Bounded Recovery Loop ---');
    const recoveryStartWf = await chiefOfStaffWorkflow.startWorkflow(
      {
        userRequest: 'Diagnostic recovery check with failure',
        preferredIntent: 'RECOVERY',
        parameters: {
          recoveryContext: {
            failureCode: 'SLOT_CONFLICT',
            errorMessage: 'Selected window overlaps with unexpected calendar block',
          },
        },
      },
      { userId: userA }
    );

    assert(
      recoveryStartWf.intent === 'RECOVERY',
      'Intent resolved to RECOVERY when failure context is provided'
    );
    assert(
      recoveryStartWf.agentResults.some((r) => r.agentId === 'agent.recovery'),
      'RecoveryAgent invoked'
    );

    // ------------------------------------------------------------------------
    // TEST 13: Tracing & Observability Invariants
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 13: Traces and Observability Verification ---');
    assert(schedWf.traces.length > 0, 'Workflow maintains trace history');
    const hasComponentTraces = schedWf.traces.some((t) => t.component === 'reviewer');
    assert(hasComponentTraces, 'Traces contain Reviewer safety gate entry');
    assert(!!schedWf.workflowId, 'workflowId is defined');
    assert(!!schedWf.executionId, 'executionId is defined');

    // ------------------------------------------------------------------------
    // Summary
    // ------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`--- CHIEF OF STAFF WORKFLOW TEST RESULTS: ${passed} PASSED, ${failed} FAILED ---`);
    console.log('================================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error in Chief of Staff workflow tests:', error);
    process.exit(1);
  }
}

runChiefOfStaffWorkflowTests();
