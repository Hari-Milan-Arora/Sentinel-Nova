/**
 * Chief of Staff Workflow Engine (Day 5C.5)
 *
 * Implements the end-to-end Chief of Staff execution loop:
 * AGENTS THINK -> REVIEWER REVIEWS -> USER CONFIRMS -> TOOL MANAGER EXECUTES -> RECOVERY PROPOSES CORRECTION.
 *
 * SAFETY INVARIANTS:
 * 1. Agents generate proposals only. No agent can call ToolManager directly.
 * 2. ReviewerAgent deterministically validates proposals before user confirmation.
 * 3. User confirmation is cryptographically/structurally bound to the exact reviewed parameters.
 * 4. Modifying parameters after review strictly invalidates the confirmation binding.
 * 5. ToolManager executes only with valid unexpired confirmation matching the reviewed action.
 * 6. Recovery loop is bounded: MAX_WORKFLOW_RECOVERY_CYCLES = 2.
 * 7. Google Calendar is strictly read-only; no calendar write tools exist.
 * 8. User isolation: client userId is NEVER trusted; authenticated session identity is enforced.
 */

import crypto from 'crypto';
import { AgentAction, AgentContext, AgentResult, RiskLevel } from '../types';
import { agentRegistry } from '../AgentRegistry';
import { reviewerAgent, ActionReviewResult } from '../agents/ReviewerAgent';
import { toolManager } from '../tools/ToolManager';
import { recoveryAgent } from '../agents/RecoveryAgent';
import { plannerAgent } from '../agents/PlannerAgent';
import { prioritizerAgent } from '../agents/PrioritizerAgent';
import { memoryAgent } from '../agents/MemoryAgent';
import { schedulerAgent } from '../agents/SchedulerAgent';
import { ContextInspectorAgent } from '../agents/ContextInspectorAgent';
import { getPlanningProfile } from '../../profileStore';
import { getCachedEvents, getUserCalendarStatus } from '../../calendarStore';
import { getActiveTasksByUser, getTaskById, ServerTask } from '../../taskStore';
import { calculateAvailability } from '../../../src/utils/availabilityEngine';
import { computeParameterHash } from './canonicalHash';
import { workflowStore } from './workflowStore';
import {
  ChiefOfStaffWorkflowContext,
  ConfirmationBinding,
  CONFIRMATION_TTL_MS,
  MAX_WORKFLOW_RECOVERY_CYCLES,
  WorkflowConfirmRequest,
  WorkflowEditRequest,
  WorkflowIntent,
  WorkflowRejectRequest,
  WorkflowStartRequest,
  WorkflowState,
  WorkflowTrace,
} from './types';

function ensureAgentsRegistered(): void {
  if (!agentRegistry.has('agent.context_inspector')) {
    agentRegistry.register(new ContextInspectorAgent());
  }
  if (!agentRegistry.has('agent.planner')) {
    agentRegistry.register(plannerAgent);
  }
  if (!agentRegistry.has('agent.prioritizer')) {
    agentRegistry.register(prioritizerAgent);
  }
  if (!agentRegistry.has('agent.memory')) {
    agentRegistry.register(memoryAgent);
  }
  if (!agentRegistry.has('agent.scheduler')) {
    agentRegistry.register(schedulerAgent);
  }
  if (!agentRegistry.has('agent.reviewer')) {
    agentRegistry.register(reviewerAgent);
  }
  if (!agentRegistry.has('agent.recovery')) {
    agentRegistry.register(recoveryAgent);
  }
}

export class ChiefOfStaffWorkflowEngine {
  constructor() {
    ensureAgentsRegistered();
  }
  /**
   * Starts a new Chief of Staff workflow based on a user request.
   */
  public async startWorkflow(
    request: WorkflowStartRequest,
    sessionUser: { userId: string }
  ): Promise<ChiefOfStaffWorkflowContext> {
    const userId = sessionUser?.userId?.trim();
    if (!userId) {
      throw new Error('Unauthorized: Valid authenticated userId is required.');
    }

    const workflowId = `wf_${crypto.randomUUID()}`;
    const executionId = `exec_${crypto.randomUUID()}`;
    const now = Date.now();

    const traces: WorkflowTrace[] = [];
    const recordTrace = (
      state: WorkflowState,
      component: WorkflowTrace['component'],
      durationMs: number,
      status: WorkflowTrace['status'],
      message?: string
    ) => {
      traces.push({
        workflowId,
        timestamp: new Date().toISOString(),
        state,
        component,
        durationMs,
        status,
        message,
      });
    };

    recordTrace('REQUESTED', 'orchestrator', 0, 'completed', 'Workflow requested');

    // 1. Context Building
    const contextStart = Date.now();
    const context = await this.buildAgentContext(userId, executionId, request.userRequest || '', request);
    recordTrace('CONTEXT_BUILDING', 'orchestrator', Date.now() - contextStart, 'completed', 'Context constructed');

    // 2. Intent Resolution
    const intent = this.resolveIntent(request);
    recordTrace('INTENT_RESOLVED', 'orchestrator', 0, 'completed', `Intent resolved to ${intent}`);

    let currentState: WorkflowState = 'INTENT_RESOLVED';
    const agentResults: AgentResult[] = [];
    let proposedActions: AgentAction[] = [];
    let summary = '';

    // 3. Minimum Required Agent Pipeline Execution
    switch (intent) {
      case 'PRIORITIZATION': {
        // Only invoke PrioritizerAgent
        const agentStart = Date.now();
        const prioritizer = agentRegistry.get('agent.prioritizer');
        if (prioritizer) {
          const res = await prioritizer.execute(context);
          agentResults.push(res);
          summary = typeof res.output === 'object' && res.output && 'explanation' in res.output
            ? String((res.output as any).explanation)
            : 'Prioritization analysis completed.';
          recordTrace('PRIORITIZED', 'prioritizer', Date.now() - agentStart, 'completed', 'Tasks prioritized');
          currentState = 'COMPLETED';
        } else {
          currentState = 'FAILED';
          summary = 'Prioritizer agent unavailable.';
        }
        break;
      }

      case 'MEMORY_RECALL': {
        // Only invoke MemoryAgent
        const agentStart = Date.now();
        const memoryAgent = agentRegistry.get('agent.memory');
        if (memoryAgent) {
          const res = await memoryAgent.execute(context);
          agentResults.push(res);
          summary = 'Memory recall completed.';
          recordTrace('MEMORY_RETRIEVED', 'memory', Date.now() - agentStart, 'completed', 'Memories recalled');
          currentState = 'COMPLETED';
        } else {
          currentState = 'FAILED';
          summary = 'Memory agent unavailable.';
        }
        break;
      }

      case 'DIAGNOSTIC': {
        const agentStart = Date.now();
        const inspector = agentRegistry.get('agent.context_inspector');
        if (inspector) {
          const res = await inspector.execute(context);
          agentResults.push(res);
          summary = 'System diagnostic and context inspection completed.';
          recordTrace('COMPLETED', 'orchestrator', Date.now() - agentStart, 'completed', 'Diagnostics complete');
          currentState = 'COMPLETED';
        } else {
          currentState = 'FAILED';
          summary = 'Diagnostic agent unavailable.';
        }
        break;
      }

      case 'SCHEDULING': {
        // Invoke SchedulerAgent directly
        const agentStart = Date.now();
        const scheduler = agentRegistry.get('agent.scheduler');
        if (scheduler) {
          const res = await scheduler.execute(context);
          agentResults.push(res);
          proposedActions = res.actions || [];
          summary = 'Scheduling analysis completed.';
          recordTrace('SCHEDULED', 'scheduler', Date.now() - agentStart, 'completed', 'Schedule computed');
          currentState = proposedActions.length > 0 ? 'PROPOSED' : 'COMPLETED';
        } else {
          currentState = 'FAILED';
          summary = 'Scheduler agent unavailable.';
        }
        break;
      }

      case 'PLANNING': {
        // Chained execution: Memory -> Prioritizer -> Planner -> Scheduler
        const memoryAgent = agentRegistry.get('agent.memory');
        if (memoryAgent) {
          const mStart = Date.now();
          const mRes = await memoryAgent.execute(context);
          agentResults.push(mRes);
          recordTrace('MEMORY_RETRIEVED', 'memory', Date.now() - mStart, 'completed', 'Preferences retrieved');
        }

        const prioritizer = agentRegistry.get('agent.prioritizer');
        if (prioritizer) {
          const pStart = Date.now();
          const pRes = await prioritizer.execute(context);
          agentResults.push(pRes);
          context.priorResults = [...agentResults];
          recordTrace('PRIORITIZED', 'prioritizer', Date.now() - pStart, 'completed', 'Tasks prioritized');
        }

        const planner = agentRegistry.get('agent.planner');
        if (planner) {
          const plStart = Date.now();
          const plRes = await planner.execute(context);
          agentResults.push(plRes);
          context.priorResults = [...agentResults];
          recordTrace('PLANNED', 'planner', Date.now() - plStart, 'completed', 'Plan formulated');
        }

        const scheduler = agentRegistry.get('agent.scheduler');
        if (scheduler) {
          const sStart = Date.now();
          const sRes = await scheduler.execute(context);
          agentResults.push(sRes);
          proposedActions = sRes.actions || [];
          recordTrace('SCHEDULED', 'scheduler', Date.now() - sStart, 'completed', 'Schedule candidate proposed');
        }

        summary = 'Daily planning and scheduling cycle completed.';
        currentState = proposedActions.length > 0 ? 'PROPOSED' : 'COMPLETED';
        break;
      }

      case 'EXECUTION': {
        // Direct execution request: construct proposal (e.g. COMPLETE_TASK or REOPEN_TASK)
        const execStart = Date.now();
        const actionProposal = await this.buildExecutionProposal(userId, request, context);
        if (actionProposal) {
          proposedActions = [actionProposal];
          currentState = 'PROPOSED';
          summary = `Proposed ${actionProposal.type} for target task.`;
          recordTrace('PROPOSED', 'orchestrator', Date.now() - execStart, 'completed', summary);
        } else {
          currentState = 'FAILED';
          summary = 'Could not resolve target task for execution proposal.';
          recordTrace('FAILED', 'orchestrator', Date.now() - execStart, 'failed', summary);
        }
        break;
      }

      case 'RECOVERY': {
        const recStart = Date.now();
        const recRes = await recoveryAgent.execute(context);
        agentResults.push(recRes);
        proposedActions = recRes.actions || [];
        summary = 'Recovery analysis and proposal formulated.';
        currentState = proposedActions.length > 0 ? 'RECOVERY_PROPOSED' : 'COMPLETED';
        recordTrace('RECOVERY_PROPOSED', 'recovery', Date.now() - recStart, 'completed', summary);
        break;
      }
    }

    // 4. Safety Review Step (if actions proposed)
    let reviewResult: ActionReviewResult | null = null;
    let confirmationBinding: ConfirmationBinding | null = null;
    let activeAction: AgentAction | null = null;

    if (proposedActions.length > 0 && (currentState === 'PROPOSED' || currentState === 'RECOVERY_PROPOSED')) {
      activeAction = proposedActions[0];
      const reviewStart = Date.now();
      currentState = 'REVIEWING';

      reviewResult = await reviewerAgent.reviewAction(activeAction, context);
      recordTrace(
        'REVIEWING',
        'reviewer',
        Date.now() - reviewStart,
        reviewResult.approved ? 'completed' : 'failed',
        reviewResult.approved
          ? 'Safety Reviewer approved action proposal'
          : `Safety Reviewer rejected action: ${reviewResult.reasons.join('; ')}`
      );

      if (!reviewResult.approved) {
        currentState = 'ABORTED';
        summary = `Action proposed was rejected by Safety Reviewer: ${reviewResult.reasons.join('; ')}`;
      } else {
        // Approved by Reviewer! Create server-side cryptographic/structural confirmation binding
        const bindingId = `bind_${crypto.randomUUID()}`;
        const parameterHash = computeParameterHash(activeAction.parameters || {});
        const expiresAt = Date.now() + CONFIRMATION_TTL_MS;

        confirmationBinding = {
          bindingId,
          workflowId,
          actionId: activeAction.actionId,
          userId,
          toolId: this.resolveToolIdForAction(activeAction.type),
          actionType: activeAction.type,
          parameterHash,
          reviewedParameters: JSON.parse(JSON.stringify(activeAction.parameters || {})),
          expiresAt,
          reviewedAt: Date.now(),
          confirmed: false,
          reviewApproved: true,
          reviewerRiskLevel: reviewResult.riskLevel,
          reasons: reviewResult.reasons,
        };

        currentState = 'AWAITING_CONFIRMATION';
        summary = `Action ${activeAction.type} approved by Reviewer and awaiting user confirmation.`;
      }
    }

    const workflowContext: ChiefOfStaffWorkflowContext = {
      workflowId,
      executionId,
      userId,
      userRequest: request.userRequest || '',
      intent,
      state: currentState,
      agentResults,
      actions: proposedActions,
      activeAction,
      reviewResult,
      confirmationBinding,
      executionResult: null,
      recoveryContext: request.parameters?.recoveryContext as Record<string, unknown> || null,
      recoveryCycleCount: 0,
      traces,
      createdAt: now,
      updatedAt: Date.now(),
      abortReason: currentState === 'ABORTED' ? (reviewResult?.reasons?.join('; ') || 'REVIEW_REJECTED') : undefined,
      summary,
    };

    workflowStore.save(workflowContext);
    return workflowContext;
  }

  /**
   * Confirms an awaiting action proposal and executes it through ToolManager.
   * Enforces all confirmation safety invariants.
   */
  public async confirmAction(
    workflowId: string,
    confirmRequest: WorkflowConfirmRequest,
    sessionUser: { userId: string }
  ): Promise<ChiefOfStaffWorkflowContext> {
    const userId = sessionUser?.userId?.trim();
    if (!userId) {
      throw new Error('Unauthorized: Valid authenticated userId is required.');
    }

    const workflow = workflowStore.get(workflowId, userId);
    if (!workflow) {
      throw new Error(`Workflow "${workflowId}" not found or unauthorized.`);
    }

    const now = Date.now();
    const recordTrace = (
      state: WorkflowState,
      component: WorkflowTrace['component'],
      durationMs: number,
      status: WorkflowTrace['status'],
      message?: string
    ) => {
      workflow.traces.push({
        workflowId,
        timestamp: new Date().toISOString(),
        state,
        component,
        durationMs,
        status,
        message,
      });
    };

    // 1. Verify workflow state
    if (workflow.state !== 'AWAITING_CONFIRMATION') {
      throw new Error(`Invalid state transition: Workflow is in state "${workflow.state}", expected "AWAITING_CONFIRMATION".`);
    }

    const binding = workflow.confirmationBinding;
    if (!binding) {
      workflow.state = 'ABORTED';
      workflow.abortReason = 'MISSING_CONFIRMATION_BINDING';
      workflowStore.save(workflow);
      throw new Error('Security violation: Missing confirmation binding.');
    }

    // 2. Verify actionId matching
    if (binding.actionId !== confirmRequest.actionId) {
      workflow.state = 'ABORTED';
      workflow.abortReason = 'ACTION_MISMATCH';
      workflowStore.save(workflow);
      throw new Error(`Action mismatch: Expected action "${binding.actionId}", received "${confirmRequest.actionId}".`);
    }

    // 3. Verify bindingId if provided
    if (confirmRequest.bindingId && confirmRequest.bindingId !== binding.bindingId) {
      workflow.state = 'ABORTED';
      workflow.abortReason = 'BINDING_MISMATCH';
      workflowStore.save(workflow);
      throw new Error('Security violation: Confirmation bindingId mismatch.');
    }

    // 4. Verify TTL / Expiration
    if (now > binding.expiresAt) {
      workflow.state = 'ABORTED';
      workflow.abortReason = 'CONFIRMATION_EXPIRED';
      workflow.summary = 'User confirmation expired. Action cancelled.';
      recordTrace('ABORTED', 'orchestrator', 0, 'failed', 'Confirmation TTL expired');
      workflowStore.save(workflow);
      throw new Error('Confirmation expired. Workflow aborted.');
    }

    // 5. Verify Parameter Immutability (Anti-Tampering Gate)
    if (confirmRequest.parameters) {
      const submittedHash = computeParameterHash(confirmRequest.parameters);
      if (submittedHash !== binding.parameterHash) {
        workflow.state = 'ABORTED';
        workflow.abortReason = 'ACTION_CHANGED';
        workflow.summary = 'Security violation: Action parameters were modified after review.';
        recordTrace('ABORTED', 'orchestrator', 0, 'failed', 'Action parameter tampering detected');
        workflowStore.save(workflow);
        throw new Error('Confirmation invalid: Action parameters were modified after safety review.');
      }
    }

    // 6. Verify Reviewer approved
    if (!binding.reviewApproved) {
      workflow.state = 'ABORTED';
      workflow.abortReason = 'UNREVIEWED_ACTION';
      workflowStore.save(workflow);
      throw new Error('Cannot execute action that was not approved by Safety Reviewer.');
    }

    const actionToExecute = workflow.activeAction;
    if (!actionToExecute) {
      workflow.state = 'ABORTED';
      workflow.abortReason = 'MISSING_ACTIVE_ACTION';
      workflowStore.save(workflow);
      throw new Error('Missing active action to execute.');
    }

    // 7. Transition to EXECUTING
    workflow.state = 'EXECUTING';
    recordTrace('EXECUTING', 'toolManager', 0, 'started', `Executing action ${actionToExecute.type}`);

    // 8. ToolManager Execution Handoff
    const execStart = Date.now();
    const toolExecResult = await toolManager.executeAction(actionToExecute, {
      userId,
      executionId: workflow.executionId,
      userConfirmed: true,
    });
    const execDuration = Date.now() - execStart;
    workflow.executionResult = toolExecResult;

    if (toolExecResult.success) {
      // SUCCESS PATH
      binding.confirmed = true;
      binding.confirmedAt = now;
      workflow.state = 'EXECUTED';
      recordTrace('EXECUTED', 'toolManager', execDuration, 'completed', toolExecResult.message);
      workflow.state = 'COMPLETED';
      workflow.summary = toolExecResult.message || 'Action executed successfully.';
      workflow.updatedAt = Date.now();
      workflowStore.save(workflow);
      return workflow;
    }

    // FAILURE PATH -> Trigger bounded Recovery Loop
    workflow.state = 'FAILED';
    recordTrace('FAILED', 'toolManager', execDuration, 'failed', toolExecResult.message);

    if (workflow.recoveryCycleCount >= MAX_WORKFLOW_RECOVERY_CYCLES) {
      // Hard upper bound reached
      workflow.state = 'ABORTED';
      workflow.abortReason = 'RECOVERY_LIMIT_REACHED';
      workflow.summary = `Execution failed and recovery cycle limit (${MAX_WORKFLOW_RECOVERY_CYCLES}) reached. Aborted.`;
      recordTrace('ABORTED', 'recovery', 0, 'failed', workflow.summary);
      workflow.updatedAt = Date.now();
      workflowStore.save(workflow);
      return workflow;
    }

    // Increment recovery count and transition to RECOVERING
    workflow.recoveryCycleCount += 1;
    workflow.state = 'RECOVERING';
    recordTrace('RECOVERING', 'recovery', 0, 'started', `Entering recovery cycle ${workflow.recoveryCycleCount}/${MAX_WORKFLOW_RECOVERY_CYCLES}`);

    const recoveryContext = {
      executionId: workflow.executionId,
      failureCode: toolExecResult.errorCode || toolExecResult.error || 'EXECUTION_FAILED',
      errorMessage: toolExecResult.message,
      toolId: toolExecResult.toolId,
      actionId: actionToExecute.actionId,
      failedAction: actionToExecute,
    };
    workflow.recoveryContext = recoveryContext;

    // Invoke RecoveryAgent
    const agentContext = await this.buildAgentContext(userId, workflow.executionId, workflow.userRequest, {
      parameters: { recoveryContext },
    });

    const recoveryRes = await recoveryAgent.execute(agentContext);
    workflow.agentResults.push(recoveryRes);

    if (recoveryRes.actions && recoveryRes.actions.length > 0) {
      const recoveryProposal = recoveryRes.actions[0];
      workflow.state = 'RECOVERY_PROPOSED';
      workflow.activeAction = recoveryProposal;

      // Review the recovery proposal
      const revStart = Date.now();
      const recReview = await reviewerAgent.reviewAction(recoveryProposal, agentContext);
      workflow.reviewResult = recReview;
      recordTrace(
        'REVIEWING',
        'reviewer',
        Date.now() - revStart,
        recReview.approved ? 'completed' : 'failed',
        recReview.approved
          ? 'Safety Reviewer approved recovery proposal'
          : `Safety Reviewer rejected recovery proposal: ${recReview.reasons.join('; ')}`
      );

      if (recReview.approved) {
        // Create new confirmation binding for the recovery action
        const newBindingId = `bind_${crypto.randomUUID()}`;
        const newParamHash = computeParameterHash(recoveryProposal.parameters || {});
        workflow.confirmationBinding = {
          bindingId: newBindingId,
          workflowId,
          actionId: recoveryProposal.actionId,
          userId,
          toolId: this.resolveToolIdForAction(recoveryProposal.type),
          actionType: recoveryProposal.type,
          parameterHash: newParamHash,
          reviewedParameters: JSON.parse(JSON.stringify(recoveryProposal.parameters || {})),
          expiresAt: Date.now() + CONFIRMATION_TTL_MS,
          reviewedAt: Date.now(),
          confirmed: false,
          reviewApproved: true,
          reviewerRiskLevel: recReview.riskLevel,
          reasons: recReview.reasons,
        };
        workflow.state = 'AWAITING_CONFIRMATION';
        workflow.summary = `Execution failed. Recovery proposal formulated and awaiting user confirmation: ${recoveryProposal.description}`;
      } else {
        workflow.state = 'ABORTED';
        workflow.abortReason = 'REVIEW_REJECTED';
        workflow.summary = `Recovery proposal rejected by Safety Reviewer: ${recReview.reasons.join('; ')}`;
      }
    } else {
      workflow.state = 'ABORTED';
      workflow.abortReason = 'NO_RECOVERY_PROPOSAL';
      workflow.summary = 'Recovery agent could not generate an alternative execution proposal.';
    }

    workflow.updatedAt = Date.now();
    workflowStore.save(workflow);
    return workflow;
  }

  /**
   * Rejects an awaiting action proposal, safely aborting the workflow without mutation.
   */
  public async rejectAction(
    workflowId: string,
    rejectRequest: WorkflowRejectRequest,
    sessionUser: { userId: string }
  ): Promise<ChiefOfStaffWorkflowContext> {
    const userId = sessionUser?.userId?.trim();
    if (!userId) {
      throw new Error('Unauthorized: Valid authenticated userId is required.');
    }

    const workflow = workflowStore.get(workflowId, userId);
    if (!workflow) {
      throw new Error(`Workflow "${workflowId}" not found or unauthorized.`);
    }

    // Invalidate binding
    if (workflow.confirmationBinding) {
      workflow.confirmationBinding.confirmed = false;
    }

    workflow.state = 'ABORTED';
    workflow.abortReason = rejectRequest?.reason || 'USER_REJECTED';
    workflow.summary = 'Action rejected by user. Workflow aborted safely with zero modifications.';
    workflow.traces.push({
      workflowId,
      timestamp: new Date().toISOString(),
      state: 'ABORTED',
      component: 'orchestrator',
      durationMs: 0,
      status: 'completed',
      message: 'User rejected action proposal. Zero tool execution.',
    });

    workflow.updatedAt = Date.now();
    workflowStore.save(workflow);
    return workflow;
  }

  /**
   * Allows user to edit parameters of an awaiting proposal.
   * Safety Mandate: Re-reviews updated proposal with ReviewerAgent BEFORE re-entering AWAITING_CONFIRMATION.
   * Never allows Review -> Edit -> Execute without re-review.
   */
  public async editAction(
    workflowId: string,
    editRequest: WorkflowEditRequest,
    sessionUser: { userId: string }
  ): Promise<ChiefOfStaffWorkflowContext> {
    const userId = sessionUser?.userId?.trim();
    if (!userId) {
      throw new Error('Unauthorized: Valid authenticated userId is required.');
    }

    const workflow = workflowStore.get(workflowId, userId);
    if (!workflow) {
      throw new Error(`Workflow "${workflowId}" not found or unauthorized.`);
    }

    if (workflow.state !== 'AWAITING_CONFIRMATION') {
      throw new Error(`Cannot edit action when workflow is in state "${workflow.state}".`);
    }

    if (!workflow.activeAction || workflow.activeAction.actionId !== editRequest.actionId) {
      throw new Error(`Action "${editRequest.actionId}" not found in workflow.`);
    }

    // 1. Invalidate previous confirmation binding
    workflow.confirmationBinding = null;

    // 2. Update action parameters
    workflow.activeAction.parameters = {
      ...workflow.activeAction.parameters,
      ...editRequest.updatedParameters,
    };

    // 3. Re-review through ReviewerAgent
    workflow.state = 'REVIEWING';
    const context = await this.buildAgentContext(userId, workflow.executionId, workflow.userRequest, {});
    const reviewResult = await reviewerAgent.reviewAction(workflow.activeAction, context);
    workflow.reviewResult = reviewResult;

    if (!reviewResult.approved) {
      workflow.state = 'ABORTED';
      workflow.abortReason = 'REVIEW_REJECTED';
      workflow.summary = `Edited action was rejected by Safety Reviewer: ${reviewResult.reasons.join('; ')}`;
      workflow.traces.push({
        workflowId,
        timestamp: new Date().toISOString(),
        state: 'ABORTED',
        component: 'reviewer',
        durationMs: 0,
        status: 'failed',
        message: workflow.summary,
      });
      workflow.updatedAt = Date.now();
      workflowStore.save(workflow);
      return workflow;
    }

    // 4. Create new confirmation binding for edited action
    const bindingId = `bind_${crypto.randomUUID()}`;
    const parameterHash = computeParameterHash(workflow.activeAction.parameters || {});
    workflow.confirmationBinding = {
      bindingId,
      workflowId,
      actionId: workflow.activeAction.actionId,
      userId,
      toolId: this.resolveToolIdForAction(workflow.activeAction.type),
      actionType: workflow.activeAction.type,
      parameterHash,
      reviewedParameters: JSON.parse(JSON.stringify(workflow.activeAction.parameters || {})),
      expiresAt: Date.now() + CONFIRMATION_TTL_MS,
      reviewedAt: Date.now(),
      confirmed: false,
      reviewApproved: true,
      reviewerRiskLevel: reviewResult.riskLevel,
      reasons: reviewResult.reasons,
    };

    workflow.state = 'AWAITING_CONFIRMATION';
    workflow.summary = `Edited parameters re-reviewed and approved by Safety Reviewer. Awaiting user confirmation.`;
    workflow.traces.push({
      workflowId,
      timestamp: new Date().toISOString(),
      state: 'AWAITING_CONFIRMATION',
      component: 'reviewer',
      durationMs: 0,
      status: 'completed',
      message: 'Edited action re-reviewed and approved.',
    });

    workflow.updatedAt = Date.now();
    workflowStore.save(workflow);
    return workflow;
  }

  /**
   * Retrieves workflow by ID for authenticated user.
   */
  public getWorkflow(workflowId: string, sessionUser: { userId: string }): ChiefOfStaffWorkflowContext | null {
    const userId = sessionUser?.userId?.trim();
    if (!userId) return null;
    return workflowStore.get(workflowId, userId);
  }

  /**
   * Resolves workflow intent deterministically.
   */
  private resolveIntent(request: WorkflowStartRequest): WorkflowIntent {
    if (request.preferredIntent) {
      return request.preferredIntent;
    }

    const text = (request.userRequest || '').toLowerCase();
    const params = request.parameters || {};

    // 1. Explicit failure or recovery parameters
    if (params.recoveryContext || params.failureContext || params.failure || params.executionFailure) {
      return 'RECOVERY';
    }

    // 2. Execution intent (complete or reopen tasks)
    const isExecution =
      params.actionType === 'COMPLETE_TASK' ||
      params.actionType === 'REOPEN_TASK' ||
      text.includes('complete this task') ||
      text.includes('mark task as completed') ||
      text.includes('finish task') ||
      text.includes('mark done') ||
      text.includes('reopen task') ||
      text.includes('uncomplete task') ||
      text.includes('complete my highest');
    if (isExecution) {
      return 'EXECUTION';
    }

    // 3. Diagnostic intent
    if (text.includes('diagnose system') || text.includes('inspect context') || text.includes('system status')) {
      return 'DIAGNOSTIC';
    }

    // 4. Memory recall intent
    const isMemory =
      text.includes('what do you remember') ||
      text.includes('recall') ||
      text.includes('my preferences') ||
      text.includes('working style') ||
      text.includes('what do you know about me') ||
      text.includes('store memory') ||
      text.includes('delete memory');
    if (isMemory) {
      return 'MEMORY_RECALL';
    }

    // 5. Scheduling intent (specific window finding / when to do)
    const isScheduling =
      text.includes('when should i work on') ||
      text.includes('when should i') ||
      text.includes('when can i') ||
      text.includes('find time for') ||
      text.includes('schedule task') ||
      text.includes('time slot') ||
      text.includes('calendar slot') ||
      text.includes('fit in') ||
      text.includes('reschedule');
    if (isScheduling && !text.includes('plan my day') && !text.includes("today's plan")) {
      return 'SCHEDULING';
    }

    // 6. Planning intent (multi-agent coordination)
    const isPlanning =
      text.includes('plan my day') ||
      text.includes('daily plan') ||
      text.includes('execution plan') ||
      text.includes("today's plan") ||
      text.includes('plan today');
    if (isPlanning) {
      return 'PLANNING';
    }

    // 7. Prioritization intent
    const isPrioritization =
      text.includes('what should i work on first') ||
      text.includes('what to do first') ||
      text.includes('what is most important') ||
      text.includes('prioritize') ||
      text.includes('priority ranking') ||
      text.includes('rank my tasks') ||
      text.includes('order of importance');
    if (isPrioritization) {
      return 'PRIORITIZATION';
    }

    // Default fallback
    return 'PRIORITIZATION';
  }

  /**
   * Builds an execution proposal for direct task actions (COMPLETE_TASK or REOPEN_TASK).
   */
  private async buildExecutionProposal(
    userId: string,
    request: WorkflowStartRequest,
    context: AgentContext
  ): Promise<AgentAction | null> {
    const text = (request.userRequest || '').toLowerCase();
    const params = request.parameters || {};

    let actionType: 'COMPLETE_TASK' | 'REOPEN_TASK' = 'COMPLETE_TASK';
    if (params.actionType === 'REOPEN_TASK' || text.includes('reopen') || text.includes('uncomplete')) {
      actionType = 'REOPEN_TASK';
    }

    let targetTaskId: string | null = (request.taskId || params.taskId || '') as string;

    if (!targetTaskId) {
      // Resolve target task from user request or prioritize highest
      const tasks = context.tasks || (await getActiveTasksByUser(userId));
      if (tasks && tasks.length > 0) {
        if (text.includes('highest') || text.includes('first') || text.includes('top')) {
          // Find highest priority active task
          const highTask = tasks.find((t) => t.priority === 'urgent') ||
            tasks.find((t) => t.priority === 'high') ||
            tasks[0];
          targetTaskId = highTask.id;
        } else {
          // Check if request mentions a title or task ID
          for (const t of tasks) {
            if (text.includes(t.title.toLowerCase()) || text.includes(t.id.toLowerCase())) {
              targetTaskId = t.id;
              break;
            }
          }
          if (!targetTaskId) {
            targetTaskId = tasks[0].id;
          }
        }
      }
    }

    if (!targetTaskId) return null;

    const task = (context.tasks || []).find((t) => t.id === targetTaskId) || (await getTaskById(userId, targetTaskId));
    const taskTitle = task ? task.title : targetTaskId;

    return {
      actionId: `act_${crypto.randomUUID()}`,
      type: actionType,
      description: `${actionType === 'COMPLETE_TASK' ? 'Complete' : 'Reopen'} task "${taskTitle}"`,
      target: targetTaskId,
      parameters: {
        taskId: targetTaskId,
        note: (params.note as string) || `Action proposed via Chief of Staff workflow (${actionType}).`,
      },
      riskLevel: 'low',
      requiresConfirmation: true,
      sourceAgentId: 'agent.orchestrator',
    };
  }

  /**
   * Resolves the corresponding tool ID for an action type.
   */
  private resolveToolIdForAction(actionType: string): string {
    switch (actionType) {
      case 'SCHEDULE_TASK':
        return 'tool.task.schedule';
      case 'COMPLETE_TASK':
        return 'tool.task.complete';
      case 'REOPEN_TASK':
        return 'tool.task.reopen';
      case 'RECOVERY_RETRY':
      case 'RECOVERY_ADJUST':
      case 'RECOVERY_REPLAN':
      case 'RECOVERY_ALTERNATIVE':
        return 'tool.task.schedule';
      default:
        return 'tool.unknown';
    }
  }

  /**
   * Constructs the scoped AgentContext for workflow agents.
   */
  private async buildAgentContext(
    userId: string,
    executionId: string,
    userRequest: string,
    request: WorkflowStartRequest | { parameters?: Record<string, unknown> }
  ): Promise<AgentContext> {
    const targetDate = (request as WorkflowStartRequest).targetDate || new Date().toISOString().split('T')[0];

    const profile = await getPlanningProfile(userId);
    const calStatus = getUserCalendarStatus(userId);
    const calendarEvents = getCachedEvents(userId);
    const tasks = await getActiveTasksByUser(userId);

    const availability = calculateAvailability({
      dateStr: targetDate,
      profile,
      events: calendarEvents,
      selectedCalendarIds: calStatus?.selectedCalendarIds || [],
      tasks: tasks as ServerTask[],
    });

    const effectiveTaskId = (request as WorkflowStartRequest).taskId || request.parameters?.taskId;
    const parameters = {
      ...(request.parameters || {}),
      ...(effectiveTaskId ? { taskId: effectiveTaskId } : {}),
      targetDate,
    };

    return {
      userId,
      requestId: `req_${crypto.randomUUID()}`,
      executionId,
      userRequest,
      timestamp: new Date().toISOString(),
      timezone: profile?.timezone || 'UTC',
      profile,
      tasks: tasks as any,
      calendarStatus: calStatus,
      calendarEvents,
      availability,
      parameters,
    };
  }
}

export const chiefOfStaffWorkflow = new ChiefOfStaffWorkflowEngine();
