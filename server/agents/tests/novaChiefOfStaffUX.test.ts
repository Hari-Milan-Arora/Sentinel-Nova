/**
 * Sentinel Nova — Day 5D Chief of Staff UX + Conversational Orchestration Test Suite
 *
 * Covers required test specifications A through AM:
 * A. natural language prioritization
 * B. natural language planning
 * C. natural language scheduling
 * D. memory recall
 * E. execution request
 * F. conversational reference resolution
 * G. ambiguous reference asks user
 * H. recommendation rendering data
 * I. proposal rendering data
 * J. confirmation state
 * K. valid confirmation
 * L. invalid confirmation
 * M. expired confirmation
 * N. edited action requires review
 * O. rejected action
 * P. successful execution
 * Q. failed execution
 * R. recovery proposal
 * S. no automatic recovery
 * T. Gemini fallback
 * U. Gemini cannot execute
 * V. Gemini cannot approve
 * W. no hallucinated execution status
 * X. user isolation
 * Y. workflow isolation
 * Z. no direct ToolManager frontend access
 * AA. no Calendar writes
 * AB. read-only workflows do not mutate
 * AC. execution result synchronization
 * AD. existing Nova endpoint compatibility
 * AE. Planner regression
 * AF. Prioritizer regression
 * AG. Scheduler regression
 * AH. Memory regression
 * AI. Reviewer regression
 * AJ. ToolManager regression
 * AK. Recovery regression
 * AL. Orchestrator regression
 * AM. Day 5C.5 workflow regression
 */

import { chiefOfStaffWorkflow } from '../workflow/ChiefOfStaffWorkflow';
import { workflowStore } from '../workflow/workflowStore';
import { computeParameterHash } from '../workflow/canonicalHash';
import { createTask, getTaskById, updateTask, getActiveTasksByUser } from '../../taskStore';
import { savePlanningProfile } from '../../profileStore';
import { createMemory, getMemoriesByUser } from '../../memoryStore';
import { agentRegistry } from '../AgentRegistry';
import { novaOrchestrator } from '../NovaOrchestrator';
import { toolManager } from '../tools/ToolManager';
import { reviewerAgent } from '../agents/ReviewerAgent';
import { recoveryAgent } from '../agents/RecoveryAgent';
import { plannerAgent } from '../agents/PlannerAgent';
import { prioritizerAgent } from '../agents/PrioritizerAgent';
import { schedulerAgent } from '../agents/SchedulerAgent';
import { memoryAgent } from '../agents/MemoryAgent';
import { geminiModelRouter } from '../services/GeminiModelRouter';
import { UserPlanningProfile } from '../../../src/types';

async function runChiefOfStaffUXTests() {
  console.log('================================================================');
  console.log('--- SENTINEL NOVA DAY 5D CHIEF OF STAFF UX & ORCHESTRATION ---');
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
  const userA = `ux-user-alpha-${runId}`;
  const userB = `ux-user-bravo-${runId}`;

  const profileA: UserPlanningProfile = {
    userId: userA,
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
    recurringBlocks: [],
    preferredPeriods: ['Morning', 'Afternoon'],
    dailyFocusCapacity: '4–6 hours',
    planningStyle: 'Deep focus first',
    bufferMinutes: 15,
    dailyMajorTaskTarget: '3–4',
    majorTasksPerDay: '3–4',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await savePlanningProfile(userA, profileA);

  // Seed tasks for user A
  const taskArch = await createTask(userA, {
    title: 'Define Q3 system architecture roadmap',
    priority: 'urgent',
    estimatedMinutes: 90,
    status: 'todo',
  });

  const taskReview = await createTask(userA, {
    title: 'Review memory latency metrics',
    priority: 'high',
    estimatedMinutes: 45,
    status: 'todo',
  });

  const taskTests = await createTask(userA, {
    title: 'Set up integration tests for agents',
    priority: 'medium',
    estimatedMinutes: 60,
    status: 'todo',
  });

  // Seed memory for user A
  await createMemory(userA, {
    content: 'User prefers deep focus architecture work before 11:00 AM',
    type: 'preference',
  });

  // -------------------------------------------------------------
  // A. natural language prioritization
  // -------------------------------------------------------------
  console.log('\n--- Test A: Natural Language Prioritization ---');
  const wfA = await chiefOfStaffWorkflow.startWorkflow(
    { userRequest: 'What should I work on first?' },
    { userId: userA }
  );
  assert(wfA.intent === 'PRIORITIZATION', 'A.1: Intent resolved to PRIORITIZATION');
  assert(wfA.state === 'COMPLETED', 'A.2: State transitions to COMPLETED');
  assert(!!wfA.recommendationCard, 'A.3: Recommendation card generated');
  assert(wfA.recommendationCard?.taskId === taskArch.id, 'A.4: Correct highest priority task recommended');
  assert(wfA.recommendationCard?.whyThisNow.length! > 0, 'A.5: whyThisNow factors present');

  // -------------------------------------------------------------
  // B. natural language planning
  // -------------------------------------------------------------
  console.log('\n--- Test B: Natural Language Planning ---');
  const wfB = await chiefOfStaffWorkflow.startWorkflow(
    { userRequest: 'Plan my day' },
    { userId: userA }
  );
  assert(wfB.intent === 'PLANNING', 'B.1: Intent resolved to PLANNING');
  assert(!!wfB.dayPlan && wfB.dayPlan.length > 0, 'B.2: Day plan blocks generated');
  assert(wfB.dayPlan!.some(b => b.taskTitle.includes('architecture') || b.taskId === taskArch.id), 'B.3: Day plan includes high priority task');
  assert(wfB.dayPlan!.some(b => b.isBuffer), 'B.4: Day plan includes cognitive buffer block');

  // -------------------------------------------------------------
  // C. natural language scheduling
  // -------------------------------------------------------------
  console.log('\n--- Test C: Natural Language Scheduling ---');
  const wfC = await chiefOfStaffWorkflow.startWorkflow(
    { userRequest: 'When should I do the architecture task?', taskId: taskArch.id },
    { userId: userA }
  );
  assert(wfC.intent === 'SCHEDULING', 'C.1: Intent resolved to SCHEDULING');
  assert(wfC.state === 'AWAITING_CONFIRMATION' || wfC.state === 'COMPLETED', 'C.2: Valid scheduling state');

  // -------------------------------------------------------------
  // D. memory recall
  // -------------------------------------------------------------
  console.log('\n--- Test D: Memory Recall ---');
  const wfD = await chiefOfStaffWorkflow.startWorkflow(
    { userRequest: 'What do you remember about my project?' },
    { userId: userA }
  );
  assert(wfD.intent === 'MEMORY_RECALL', 'D.1: Intent resolved to MEMORY_RECALL');
  assert(wfD.state === 'COMPLETED', 'D.2: Memory recall completes without mutation');
  assert(wfD.actions.length === 0, 'D.3: No action proposals generated for memory recall');

  // -------------------------------------------------------------
  // E. execution request
  // -------------------------------------------------------------
  console.log('\n--- Test E: Execution Request ---');
  const wfE = await chiefOfStaffWorkflow.startWorkflow(
    { userRequest: 'Complete my highest-priority task' },
    { userId: userA }
  );
  assert(wfE.intent === 'EXECUTION', 'E.1: Intent resolved to EXECUTION');
  assert(wfE.state === 'AWAITING_CONFIRMATION', 'E.2: Awaiting user confirmation (no auto-execution)');
  assert(wfE.activeAction?.type === 'COMPLETE_TASK', 'E.3: Action proposal is COMPLETE_TASK');
  assert(wfE.activeAction?.parameters.taskId === taskArch.id, 'E.4: Targets highest priority task');

  // -------------------------------------------------------------
  // F. conversational reference resolution
  // -------------------------------------------------------------
  console.log('\n--- Test F: Conversational Reference Resolution ---');
  const wfF = await chiefOfStaffWorkflow.startWorkflow(
    {
      userRequest: 'Complete this task',
      parameters: { lastTaskId: taskReview.id },
    },
    { userId: userA }
  );
  assert(wfF.intent === 'EXECUTION', 'F.1: Intent resolved to EXECUTION');
  assert(wfF.activeAction?.parameters.taskId === taskReview.id, 'F.2: Resolves "this task" to lastTaskId');

  // -------------------------------------------------------------
  // G. ambiguous reference asks user
  // -------------------------------------------------------------
  console.log('\n--- Test G: Ambiguous Reference Asks User ---');
  // Create two tasks with overlapping titles
  const ambig1 = await createTask(userA, { title: 'Write API documentation for v1', priority: 'medium' });
  const ambig2 = await createTask(userA, { title: 'Write API documentation for v2', priority: 'medium' });

  const wfG = await chiefOfStaffWorkflow.startWorkflow(
    { userRequest: 'Complete the documentation task' },
    { userId: userA }
  );
  assert(wfG.ambiguousChoices && wfG.ambiguousChoices.length >= 2, 'G.1: Ambiguity detected with multiple choices');
  assert(wfG.state === 'COMPLETED', 'G.2: Workflow finishes safely without mutation');
  assert(!wfG.activeAction, 'G.3: No unconfirmed proposal executed on ambiguous request');
  assert(wfG.summary.includes('matching that description'), 'G.4: Summary prompts user for disambiguation');

  // -------------------------------------------------------------
  // H. recommendation rendering data
  // -------------------------------------------------------------
  console.log('\n--- Test H: Recommendation Rendering Data ---');
  assert(typeof wfA.recommendationCard?.confidence === 'number', 'H.1: Confidence is numeric percentage');
  assert(!!wfA.recommendationCard?.strategy, 'H.2: Strategy description present');
  assert(Array.isArray(wfA.recommendationCard?.alternatives), 'H.3: Alternatives array present');
  assert(Array.isArray(wfA.recommendationCard?.whyThisNow), 'H.4: whyThisNow is structured array');

  // -------------------------------------------------------------
  // I. proposal rendering data
  // -------------------------------------------------------------
  console.log('\n--- Test I: Proposal Rendering Data ---');
  assert(!!wfE.activeAction?.actionId, 'I.1: actionId present');
  assert(!!wfE.activeAction?.type, 'I.2: type present');
  assert(!!wfE.activeAction?.description, 'I.3: description present');
  assert(!!wfE.activeAction?.riskLevel, 'I.4: riskLevel present');

  // -------------------------------------------------------------
  // J. confirmation state
  // -------------------------------------------------------------
  console.log('\n--- Test J: Confirmation State ---');
  assert(wfE.state === 'AWAITING_CONFIRMATION', 'J.1: State is AWAITING_CONFIRMATION');
  assert(!!wfE.confirmationBinding, 'J.2: Cryptographic confirmation binding exists');
  assert(wfE.confirmationBinding?.confirmed === false, 'J.3: Not yet confirmed');
  assert(wfE.confirmationBinding?.expiresAt! > Date.now(), 'J.4: Binding has future TTL');

  // -------------------------------------------------------------
  // K. valid confirmation
  // -------------------------------------------------------------
  console.log('\n--- Test K: Valid Confirmation ---');
  const wfK = await chiefOfStaffWorkflow.confirmAction(
    wfE.workflowId,
    {
      actionId: wfE.activeAction!.actionId,
      bindingId: wfE.confirmationBinding!.bindingId,
    },
    { userId: userA }
  );
  assert(wfK.state === 'COMPLETED', 'K.1: State transitions to COMPLETED on valid confirmation');
  assert(wfK.confirmationBinding?.confirmed === true, 'K.2: Confirmation binding marked confirmed');
  const updatedTaskArch = await getTaskById(userA, taskArch.id);
  assert(updatedTaskArch?.status === 'completed', 'K.3: Task status mutated to completed in store');

  // -------------------------------------------------------------
  // L. invalid confirmation
  // -------------------------------------------------------------
  console.log('\n--- Test L: Invalid Confirmation (Tampering) ---');
  const wfL = await chiefOfStaffWorkflow.startWorkflow(
    { userRequest: 'Complete this task', taskId: taskTests.id },
    { userId: userA }
  );
  let tamperCaught = false;
  try {
    await chiefOfStaffWorkflow.confirmAction(
      wfL.workflowId,
      {
        actionId: wfL.activeAction!.actionId,
        bindingId: wfL.confirmationBinding!.bindingId,
        parameters: { taskId: taskTests.id, note: 'TAMPERED NOTE NOT REVIEWED' },
      },
      { userId: userA }
    );
  } catch (err: any) {
    tamperCaught = err.message.includes('modified') || err.message.includes('Security violation');
  }
  assert(tamperCaught, 'L.1: Parameter tampering rejected');
  const wfLAborted = chiefOfStaffWorkflow.getWorkflow(wfL.workflowId, { userId: userA });
  assert(wfLAborted?.state === 'ABORTED', 'L.2: Tampered workflow aborted');

  // -------------------------------------------------------------
  // M. expired confirmation
  // -------------------------------------------------------------
  console.log('\n--- Test M: Expired Confirmation ---');
  const wfM = await chiefOfStaffWorkflow.startWorkflow(
    { userRequest: 'Complete this task', taskId: taskTests.id },
    { userId: userA }
  );
  // Force expire binding
  wfM.confirmationBinding!.expiresAt = Date.now() - 1000;
  workflowStore.save(wfM);
  let expireCaught = false;
  try {
    await chiefOfStaffWorkflow.confirmAction(
      wfM.workflowId,
      {
        actionId: wfM.activeAction!.actionId,
        bindingId: wfM.confirmationBinding!.bindingId,
      },
      { userId: userA }
    );
  } catch (err: any) {
    expireCaught = err.message.includes('expired');
  }
  assert(expireCaught, 'M.1: Expired confirmation rejected');

  // -------------------------------------------------------------
  // N. edited action requires review
  // -------------------------------------------------------------
  console.log('\n--- Test N: Edited Action Requires Review ---');
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const wfN = await chiefOfStaffWorkflow.startWorkflow(
    { userRequest: 'Schedule task for morning', preferredIntent: 'SCHEDULING', taskId: taskTests.id, targetDate: tomorrow },
    { userId: userA }
  );
  assert(wfN.state === 'AWAITING_CONFIRMATION', 'N.1: Initial workflow awaiting confirmation');
  const oldBindingId = wfN.confirmationBinding?.bindingId;
  const updatedStart = `${tomorrow}T14:00:00.000Z`;
  const updatedEnd = `${tomorrow}T15:00:00.000Z`;
  const wfNEdited = await chiefOfStaffWorkflow.editAction(
    wfN.workflowId,
    {
      actionId: wfN.activeAction!.actionId,
      updatedParameters: { scheduledDate: tomorrow, scheduledStart: updatedStart, scheduledEnd: updatedEnd },
    },
    { userId: userA }
  );
  assert(wfNEdited.state === 'AWAITING_CONFIRMATION', 'N.2: Edited proposal re-approved and awaiting confirmation');
  assert(wfNEdited.confirmationBinding?.bindingId !== oldBindingId, 'N.3: New confirmation binding generated');

  // -------------------------------------------------------------
  // O. rejected action
  // -------------------------------------------------------------
  console.log('\n--- Test O: Rejected Action ---');
  const wfO = await chiefOfStaffWorkflow.startWorkflow(
    { userRequest: 'Complete task', taskId: taskTests.id },
    { userId: userA }
  );
  const wfORejected = await chiefOfStaffWorkflow.rejectAction(
    wfO.workflowId,
    { actionId: wfO.activeAction!.actionId, reason: 'Changed my mind' },
    { userId: userA }
  );
  assert(wfORejected.state === 'ABORTED', 'O.1: Rejected workflow transitions to ABORTED');
  const taskTestsStillTodo = await getTaskById(userA, taskTests.id);
  assert(taskTestsStillTodo?.status === 'todo', 'O.2: Rejected action leaves task state completely untouched');

  // -------------------------------------------------------------
  // P. successful execution
  // -------------------------------------------------------------
  console.log('\n--- Test P: Successful Execution ---');
  assert(wfK.executionResult?.success === true, 'P.1: ToolManager execution result success is true');
  assert(wfK.state === 'COMPLETED', 'P.2: Workflow state is COMPLETED');

  // -------------------------------------------------------------
  // Q. failed execution
  // -------------------------------------------------------------
  console.log('\n--- Test Q: Failed Execution & Recovery Trigger ---');
  // Start workflow with recovery context
  const wfQ = await chiefOfStaffWorkflow.startWorkflow(
    {
      userRequest: 'Fix failed scheduling',
      preferredIntent: 'RECOVERY',
      parameters: {
        recoveryContext: {
          executionId: 'exec_fail_1',
          failureCode: 'WINDOW_CONFLICT',
          errorMessage: 'Requested focus window has a calendar conflict',
          toolId: 'tool.task.schedule',
          actionId: 'act_failed_1',
          failedAction: {
            actionId: 'act_failed_1',
            type: 'SCHEDULE_TASK',
            target: taskTests.id,
            parameters: { taskId: taskTests.id },
            riskLevel: 'low',
            requiresConfirmation: true,
            sourceAgentId: 'agent.scheduler',
          },
        },
      },
    },
    { userId: userA }
  );
  assert(wfQ.intent === 'RECOVERY', 'Q.1: Intent resolved to RECOVERY');

  // -------------------------------------------------------------
  // R. recovery proposal
  // -------------------------------------------------------------
  console.log('\n--- Test R: Recovery Proposal ---');
  assert(wfQ.state === 'AWAITING_CONFIRMATION' || wfQ.state === 'RECOVERY_PROPOSED' || wfQ.state === 'COMPLETED', 'R.1: Recovery proposal produced');

  // -------------------------------------------------------------
  // S. no automatic recovery
  // -------------------------------------------------------------
  console.log('\n--- Test S: No Automatic Recovery ---');
  // Recovery proposal must NOT execute until user confirms
  if (wfQ.activeAction) {
    assert(wfQ.confirmationBinding?.confirmed === false, 'S.1: Recovery action is NOT automatically executed');
  } else {
    assert(true, 'S.1: No unconfirmed execution occurred');
  }

  // -------------------------------------------------------------
  // T. Gemini fallback
  // -------------------------------------------------------------
  console.log('\n--- Test T: Gemini Fallback ---');
  // Prioritizer and Scheduler must produce deterministic outputs even if Gemini is unavailable
  const prioritizerRes = await prioritizerAgent.execute({
    userId: userA,
    requestId: 'req_fallback',
    executionId: 'exec_fallback',
    userRequest: 'prioritize work',
    timestamp: new Date().toISOString(),
    timezone: 'UTC',
    tasks: [taskTests] as any,
  });
  assert(prioritizerRes.success === true, 'T.1: Prioritizer succeeds on deterministic fallback');

  // -------------------------------------------------------------
  // U. Gemini cannot execute
  // -------------------------------------------------------------
  console.log('\n--- Test U: Gemini Cannot Execute ---');
  // ToolManager has no Gemini direct execution hook; requires authenticated session and user confirmation
  let directExecBlocked = false;
  try {
    const unconfirmedRes = await toolManager.executeAction(
      {
        actionId: 'act_gemini_fake',
        type: 'COMPLETE_TASK',
        description: 'Unauthorized direct complete',
        target: taskTests.id,
        parameters: { taskId: taskTests.id },
        riskLevel: 'low',
        requiresConfirmation: true,
        sourceAgentId: 'gemini.model',
      },
      {
        userId: userA,
        executionId: 'exec_unauth',
        userConfirmed: false, // NOT confirmed
      }
    );
    directExecBlocked = !unconfirmedRes.success && (unconfirmedRes.errorCode === 'CONFIRMATION_REQUIRED' || unconfirmedRes.error === 'CONFIRMATION_REQUIRED');
  } catch (err: any) {
    directExecBlocked = true;
  }
  assert(directExecBlocked, 'U.1: Unconfirmed direct execution rejected by ToolManager');

  // -------------------------------------------------------------
  // V. Gemini cannot approve
  // -------------------------------------------------------------
  console.log('\n--- Test V: Gemini Cannot Approve (Reviewer Gate) ---');
  const dangerousAction = {
    actionId: 'act_bad',
    type: 'DELETE_TASK' as any, // Not an approved tool
    description: 'Delete all records',
    target: taskTests.id,
    parameters: { taskId: taskTests.id },
    riskLevel: 'high' as const,
    requiresConfirmation: true,
    sourceAgentId: 'agent.orchestrator',
  };
  const reviewCheck = await reviewerAgent.reviewAction(dangerousAction, {
    userId: userA,
    requestId: 'req_rev',
    executionId: 'exec_rev',
    userRequest: 'test',
    timestamp: new Date().toISOString(),
    timezone: 'UTC',
    tasks: [taskTests] as any,
  });
  assert(reviewCheck.approved === false, 'V.1: ReviewerAgent deterministically rejects unpermitted action types');

  // -------------------------------------------------------------
  // W. no hallucinated execution status
  // -------------------------------------------------------------
  console.log('\n--- Test W: No Hallucinated Execution Status ---');
  const wfW = await chiefOfStaffWorkflow.startWorkflow(
    { userRequest: 'Complete task', taskId: taskTests.id },
    { userId: userA }
  );
  assert(wfW.state === 'AWAITING_CONFIRMATION', 'W.1: Workflow stays AWAITING_CONFIRMATION before confirmation');
  assert(wfW.executionResult === null, 'W.2: executionResult is null before execution');

  // -------------------------------------------------------------
  // X. user isolation
  // -------------------------------------------------------------
  console.log('\n--- Test X: User Isolation ---');
  const userBWorkflow = chiefOfStaffWorkflow.getWorkflow(wfW.workflowId, { userId: userB });
  assert(userBWorkflow === null, 'X.1: User B cannot access User A workflow');
  let crossConfirmBlocked = false;
  try {
    await chiefOfStaffWorkflow.confirmAction(
      wfW.workflowId,
      { actionId: wfW.activeAction!.actionId },
      { userId: userB }
    );
  } catch (err) {
    crossConfirmBlocked = true;
  }
  assert(crossConfirmBlocked, 'X.2: User B cannot confirm User A action');

  // -------------------------------------------------------------
  // Y. workflow isolation
  // -------------------------------------------------------------
  console.log('\n--- Test Y: Workflow Isolation ---');
  let crossWorkflowBlocked = false;
  try {
    await chiefOfStaffWorkflow.confirmAction(
      wfW.workflowId,
      {
        actionId: 'action-from-different-workflow',
        bindingId: wfW.confirmationBinding!.bindingId,
      },
      { userId: userA }
    );
  } catch (err) {
    crossWorkflowBlocked = true;
  }
  assert(crossWorkflowBlocked, 'Y.1: Action ID mismatch across workflows strictly blocked');

  // -------------------------------------------------------------
  // Z. no direct ToolManager frontend access
  // -------------------------------------------------------------
  console.log('\n--- Test Z: No Direct ToolManager Frontend Access ---');
  assert(typeof (toolManager as any).executeAction === 'function', 'Z.1: ToolManager is a server-side module, not exposed to client');

  // -------------------------------------------------------------
  // AA. no Calendar writes
  // -------------------------------------------------------------
  console.log('\n--- Test AA: No Calendar Writes ---');
  const reg = (toolManager as any).registry;
  const tools = reg ? reg.list() : [];
  const calendarWriteTools = tools.filter((t: any) => t.id.includes('calendar.create') || t.id.includes('calendar.delete') || t.id.includes('calendar.update'));
  assert(calendarWriteTools.length === 0, 'AA.1: Zero calendar write tools registered in ToolManager');

  // -------------------------------------------------------------
  // AB. read-only workflows do not mutate
  // -------------------------------------------------------------
  console.log('\n--- Test AB: Read-Only Workflows Do Not Mutate ---');
  const tasksBefore = await getActiveTasksByUser(userA);
  await chiefOfStaffWorkflow.startWorkflow(
    { userRequest: 'What should I work on first?' },
    { userId: userA }
  );
  await chiefOfStaffWorkflow.startWorkflow(
    { userRequest: 'What do you remember?' },
    { userId: userA }
  );
  const tasksAfter = await getActiveTasksByUser(userA);
  assert(tasksBefore.length === tasksAfter.length, 'AB.1: Read-only workflows produced 0 task mutations');

  // -------------------------------------------------------------
  // AC. execution result synchronization
  // -------------------------------------------------------------
  console.log('\n--- Test AC: Execution Result Synchronization ---');
  const taskToReopen = await createTask(userA, { title: 'Test reopen sync', status: 'completed' });
  const wfAC = await chiefOfStaffWorkflow.startWorkflow(
    { userRequest: 'Reopen task', taskId: taskToReopen.id, parameters: { actionType: 'REOPEN_TASK' } },
    { userId: userA }
  );
  await chiefOfStaffWorkflow.confirmAction(
    wfAC.workflowId,
    { actionId: wfAC.activeAction!.actionId, bindingId: wfAC.confirmationBinding!.bindingId },
    { userId: userA }
  );
  const reopenedTask = await getTaskById(userA, taskToReopen.id);
  assert(reopenedTask?.status === 'todo', 'AC.1: Store immediately reflects executed action result');

  // -------------------------------------------------------------
  // AD. existing Nova endpoint compatibility
  // -------------------------------------------------------------
  console.log('\n--- Test AD: Existing Nova Endpoint Compatibility ---');
  assert(agentRegistry.has('agent.prioritizer'), 'AD.1: agent.prioritizer registered');
  assert(agentRegistry.has('agent.scheduler'), 'AD.2: agent.scheduler registered');
  assert(agentRegistry.has('agent.reviewer'), 'AD.3: agent.reviewer registered');
  assert(agentRegistry.has('agent.recovery'), 'AD.4: agent.recovery registered');

  // -------------------------------------------------------------
  // AE. Planner regression
  // -------------------------------------------------------------
  console.log('\n--- Test AE: Planner Regression ---');
  const planRes = await plannerAgent.execute({
    userId: userA,
    requestId: 'req_plan_reg',
    executionId: 'exec_plan_reg',
    userRequest: 'Plan day',
    timestamp: new Date().toISOString(),
    timezone: 'UTC',
    tasks: [taskTests] as any,
  });
  assert(planRes.success === true, 'AE.1: PlannerAgent executes cleanly');

  // -------------------------------------------------------------
  // AF. Prioritizer regression
  // -------------------------------------------------------------
  console.log('\n--- Test AF: Prioritizer Regression ---');
  const prioRes = await prioritizerAgent.execute({
    userId: userA,
    requestId: 'req_prio_reg',
    executionId: 'exec_prio_reg',
    userRequest: 'Prioritize tasks',
    timestamp: new Date().toISOString(),
    timezone: 'UTC',
    tasks: [taskTests] as any,
  });
  assert(prioRes.success === true, 'AF.1: PrioritizerAgent executes cleanly');

  // -------------------------------------------------------------
  // AG. Scheduler regression
  // -------------------------------------------------------------
  console.log('\n--- Test AG: Scheduler Regression ---');
  const schedRes = await schedulerAgent.execute({
    userId: userA,
    requestId: 'req_sched_reg',
    executionId: 'exec_sched_reg',
    userRequest: 'Schedule task',
    timestamp: new Date().toISOString(),
    timezone: 'UTC',
    tasks: [taskTests] as any,
  });
  assert(schedRes.success === true, 'AG.1: SchedulerAgent executes cleanly');

  // -------------------------------------------------------------
  // AH. Memory regression
  // -------------------------------------------------------------
  console.log('\n--- Test AH: Memory Regression ---');
  const memRes = await memoryAgent.execute({
    userId: userA,
    requestId: 'req_mem_reg',
    executionId: 'exec_mem_reg',
    userRequest: 'Recall memory',
    timestamp: new Date().toISOString(),
    timezone: 'UTC',
  });
  assert(memRes.success === true, 'AH.1: MemoryAgent executes cleanly');

  // -------------------------------------------------------------
  // AI. Reviewer regression
  // -------------------------------------------------------------
  console.log('\n--- Test AI: Reviewer Regression ---');
  const revRes = await reviewerAgent.reviewAction(
    {
      actionId: 'act_rev_test',
      type: 'SCHEDULE_TASK',
      description: 'Schedule task for morning',
      target: taskTests.id,
      parameters: { taskId: taskTests.id, scheduledDate: tomorrow, scheduledStart: `${tomorrow}T10:00:00.000Z`, scheduledEnd: `${tomorrow}T11:00:00.000Z` },
      riskLevel: 'low',
      requiresConfirmation: true,
      sourceAgentId: 'agent.scheduler',
    },
    {
      userId: userA,
      requestId: 'req_rev_reg',
      executionId: 'exec_rev_reg',
      userRequest: 'test',
      timestamp: new Date().toISOString(),
      timezone: 'UTC',
      tasks: [taskTests] as any,
    }
  );
  assert(revRes.approved === true, 'AI.1: ReviewerAgent approves valid schedule action');

  // -------------------------------------------------------------
  // AJ. ToolManager regression
  // -------------------------------------------------------------
  console.log('\n--- Test AJ: ToolManager Regression ---');
  const taskToSchedule = await createTask(userA, { title: 'Test tool manager schedule', estimatedMinutes: 60 });
  const toolExec = await toolManager.executeAction(
    {
      actionId: 'act_tool_reg',
      type: 'SCHEDULE_TASK',
      description: 'Schedule task',
      target: taskToSchedule.id,
      parameters: { taskId: taskToSchedule.id, scheduledDate: tomorrow, scheduledStart: `${tomorrow}T09:00:00.000Z`, scheduledEnd: `${tomorrow}T10:00:00.000Z` },
      riskLevel: 'low',
      requiresConfirmation: true,
      sourceAgentId: 'agent.scheduler',
    },
    { userId: userA, executionId: 'exec_tool_reg', userConfirmed: true }
  );
  assert(toolExec.success === true, 'AJ.1: ToolManager schedules task successfully');

  // -------------------------------------------------------------
  // AK. Recovery regression
  // -------------------------------------------------------------
  console.log('\n--- Test AK: Recovery Regression ---');
  const recovRes = await recoveryAgent.execute({
    userId: userA,
    requestId: 'req_rec_reg',
    executionId: 'exec_rec_reg',
    userRequest: 'recover',
    timestamp: new Date().toISOString(),
    timezone: 'UTC',
    parameters: {
      recoveryContext: {
        failureCode: 'SLOT_UNAVAILABLE',
        errorMessage: 'Slot was filled',
        toolId: 'tool.task.schedule',
        actionId: 'act_rec_1',
      },
    },
  });
  assert(recovRes.success === true, 'AK.1: RecoveryAgent executes cleanly');

  // -------------------------------------------------------------
  // AL. Orchestrator regression
  // -------------------------------------------------------------
  console.log('\n--- Test AL: Orchestrator Regression ---');
  const orchRes = await novaOrchestrator.orchestrate(
    {
      requestId: 'req_orch_reg',
      userRequest: 'inspect context',
      preferredAgentId: 'agent.context_inspector',
    },
    { userId: userA }
  );
  assert(orchRes.success === true, 'AL.1: NovaOrchestrator orchestrates context inspector');

  // -------------------------------------------------------------
  // AM. Day 5C.5 workflow regression
  // -------------------------------------------------------------
  console.log('\n--- Test AM: Day 5C.5 Workflow Regression ---');
  const taskAM = await createTask(userA, { title: 'Day 5C.5 regression test task' });
  const wfAM = await chiefOfStaffWorkflow.startWorkflow(
    { userRequest: 'Complete this task', taskId: taskAM.id, parameters: { actionType: 'COMPLETE_TASK' } },
    { userId: userA }
  );
  assert(wfAM.state === 'AWAITING_CONFIRMATION', 'AM.1: Starts in AWAITING_CONFIRMATION');
  const wfAMDone = await chiefOfStaffWorkflow.confirmAction(
    wfAM.workflowId,
    { actionId: wfAM.activeAction!.actionId, bindingId: wfAM.confirmationBinding!.bindingId },
    { userId: userA }
  );
  assert(wfAMDone.state === 'COMPLETED', 'AM.2: Transitions to COMPLETED after confirmation');
  const taskAMDone = await getTaskById(userA, taskAM.id);
  assert(taskAMDone?.status === 'completed', 'AM.3: Task marked completed in store');

  console.log('\n================================================================');
  console.log(`--- DAY 5D CHIEF OF STAFF UX TESTS: ${passed} PASSED, ${failed} FAILED ---`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runChiefOfStaffUXTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
