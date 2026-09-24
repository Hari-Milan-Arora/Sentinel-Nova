/**
 * Nova Orchestrator for Sentinel Nova Multi-Agent Runtime (Day 5A)
 *
 * Coordinates execution lifecycle, context construction, agent selection,
 * execution tracing, error isolation, and action proposal aggregation.
 *
 * Day 5A Safety Mandate:
 * Agents produce Action Proposals ONLY. The Orchestrator collects proposals
 * and returns them in the final OrchestrationResult. ZERO autonomous execution.
 */

import crypto from 'crypto';
import { AgentRegistry, agentRegistry as defaultRegistry } from './AgentRegistry';
import { buildAgentContext } from './AgentContext';
import {
  AgentAction,
  AgentCapability,
  AgentError,
  AgentRequest,
  AgentResult,
  AgentTrace,
  ExecutionLifecycleStatus,
  OrchestrationResult,
} from './types';
import { BaseAgent } from './Agent';
import { chiefOfStaffWorkflow } from './workflow/ChiefOfStaffWorkflow';
import { ChiefOfStaffWorkflowContext, WorkflowStartRequest } from './workflow/types';

export interface OrchestratorOptions {
  registry?: AgentRegistry;
  defaultTimeoutMs?: number;
}

export class NovaOrchestrator {
  private registry: AgentRegistry;
  private defaultTimeoutMs: number;

  constructor(options?: OrchestratorOptions) {
    this.registry = options?.registry || defaultRegistry;
    this.defaultTimeoutMs = options?.defaultTimeoutMs || 15000;
  }

  /**
   * Main entry point to orchestrate an agent workflow.
   */
  public async orchestrate(
    request: AgentRequest,
    userSession: { userId: string }
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const executionId = `exec_${crypto.randomUUID()}`;
    const requestId = request.requestId || `req_${crypto.randomUUID()}`;

    let lifecycleStatus: ExecutionLifecycleStatus = 'REQUESTED';
    const traces: AgentTrace[] = [];
    const agentResults: AgentResult[] = [];
    const proposedActions: AgentAction[] = [];

    // Overall timeout protection
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error(`ORCHESTRATION_TIMEOUT: Total workflow exceeded ${this.defaultTimeoutMs}ms limit.`));
      }, this.defaultTimeoutMs);
    });

    const workflowPromise = (async (): Promise<OrchestrationResult> => {
      try {
        // Step 1: Context Building
        lifecycleStatus = 'CONTEXT_BUILDING';
        const context = await buildAgentContext({
          userId: userSession.userId,
          requestId,
          executionId,
          userRequest: request.userRequest || '',
          scope: request.scope,
          parameters: request.parameters,
        });

        // Step 2: Check for Multi-Agent Pipeline (e.g., "Schedule my highest priority task")
        const userReq = (request.userRequest || '').toLowerCase();
        const isScheduleHighestPriority =
          !request.preferredAgentId &&
          (userReq.includes('schedule') || userReq.includes('fit in') || userReq.includes('when to do') || userReq.includes('find time')) &&
          (userReq.includes('highest priority') || userReq.includes('top priority') || userReq.includes('most important'));

        const prioritizer = this.registry.get('agent.prioritizer');
        const scheduler = this.registry.get('agent.scheduler');

        if (isScheduleHighestPriority && prioritizer && scheduler) {
          lifecycleStatus = 'RUNNING';
          // Step 2a: Run Prioritizer
          const pStartTime = Date.now();
          const pResult = await prioritizer.execute(context);
          const pEndTime = Date.now();

          agentResults.push(pResult);
          traces.push({
            agentId: prioritizer.id,
            executionId,
            startTime: pStartTime,
            endTime: pEndTime,
            durationMs: pEndTime - pStartTime,
            status: pResult.success ? 'completed' : 'failed',
            success: pResult.success,
            confidence: pResult.confidence,
            warnings: pResult.warnings,
            error: pResult.errors.length > 0 ? pResult.errors[0] : undefined,
          });

          if (pResult.actions && Array.isArray(pResult.actions)) {
            proposedActions.push(...pResult.actions);
          }

          // Identify top prioritized task
          const pOutput = pResult.output as any;
          const topItem = pOutput?.prioritizedItems?.[0] || pOutput?.topPriorities?.[0];
          const topTaskId = topItem?.taskId || (context.tasks && context.tasks.length > 0 ? context.tasks[0].id : undefined);
          const topTaskTitle = topItem?.title || (context.tasks && context.tasks.length > 0 ? context.tasks[0].title : 'top priority task');

          if (pResult.success && topTaskId) {
            // Step 2b: Run Scheduler for the identified top task
            const schedulerContext = {
              ...context,
              parameters: {
                ...(context.parameters || {}),
                taskId: topTaskId,
              },
            };

            const sStartTime = Date.now();
            const sResult = await scheduler.execute(schedulerContext);
            const sEndTime = Date.now();

            agentResults.push(sResult);
            traces.push({
              agentId: scheduler.id,
              executionId,
              startTime: sStartTime,
              endTime: sEndTime,
              durationMs: sEndTime - sStartTime,
              status: sResult.success ? 'completed' : 'failed',
              success: sResult.success,
              confidence: sResult.confidence,
              warnings: sResult.warnings,
              error: sResult.errors.length > 0 ? sResult.errors[0] : undefined,
            });

            if (sResult.actions && Array.isArray(sResult.actions)) {
              proposedActions.push(...sResult.actions);
            }

            lifecycleStatus = sResult.success ? 'COMPLETED' : 'FAILED';
            const summary = sResult.success
              ? `Prioritized workload and scheduled top task "${topTaskTitle}" via SchedulerAgent.`
              : `Prioritized workload, but SchedulerAgent failed: ${sResult.errors[0]?.message || 'Unknown error'}.`;

            return {
              success: sResult.success,
              requestId,
              executionId,
              lifecycleStatus,
              agentResults,
              proposedActions,
              traces,
              summary,
              durationMs: Date.now() - startTime,
              error: sResult.errors.length > 0 ? sResult.errors[0] : undefined,
            };
          } else {
            lifecycleStatus = pResult.success ? 'COMPLETED' : 'FAILED';
            const summary = pResult.success
              ? 'Prioritized workload, but no eligible active tasks were available to schedule.'
              : `Prioritizer failed: ${pResult.errors[0]?.message || 'Unknown error'}.`;

            return {
              success: pResult.success,
              requestId,
              executionId,
              lifecycleStatus,
              agentResults,
              proposedActions,
              traces,
              summary,
              durationMs: Date.now() - startTime,
              error: pResult.errors.length > 0 ? pResult.errors[0] : undefined,
            };
          }
        }

        // Step 3: Single Agent Selection
        lifecycleStatus = 'AGENT_SELECTED';
        const selectedAgent = await this.selectAgent(request, context);

        if (!selectedAgent) {
          lifecycleStatus = 'FAILED';
          const error: AgentError = {
            code: 'NO_CAPABLE_AGENT',
            message: request.preferredAgentId
              ? `Requested agent '${request.preferredAgentId}' is not registered or cannot handle this context.`
              : 'No registered agent is capable of handling the current request.',
          };

          return {
            success: false,
            requestId,
            executionId,
            lifecycleStatus,
            agentResults: [],
            proposedActions: [],
            traces: [],
            summary: 'Orchestration failed: No capable agent found.',
            durationMs: Date.now() - startTime,
            error,
          };
        }

        // Step 4: Running Selected Agent
        lifecycleStatus = 'RUNNING';
        const agentStartTime = Date.now();

        const result = await selectedAgent.execute(context);
        const agentEndTime = Date.now();

        lifecycleStatus = 'RESULT_RECEIVED';
        agentResults.push(result);

        // Record trace for observability
        const trace: AgentTrace = {
          agentId: selectedAgent.id,
          executionId,
          startTime: agentStartTime,
          endTime: agentEndTime,
          durationMs: agentEndTime - agentStartTime,
          status: result.success ? 'completed' : 'failed',
          success: result.success,
          confidence: result.confidence,
          warnings: result.warnings,
          error: result.errors.length > 0 ? result.errors[0] : undefined,
        };
        traces.push(trace);

        // Collect proposed actions (NO EXECUTION - Day 5A safety requirement)
        if (result.actions && Array.isArray(result.actions)) {
          proposedActions.push(...result.actions);
        }

        lifecycleStatus = result.success ? 'COMPLETED' : 'FAILED';

        const summary = result.success
          ? `Executed agent '${selectedAgent.name}' successfully (${trace.durationMs}ms).`
          : `Agent '${selectedAgent.name}' reported failure: ${result.errors[0]?.message || 'Unknown error'}.`;

        return {
          success: result.success,
          requestId,
          executionId,
          lifecycleStatus,
          agentResults,
          proposedActions,
          traces,
          summary,
          durationMs: Date.now() - startTime,
          error: result.errors.length > 0 ? result.errors[0] : undefined,
        };
      } catch (err: unknown) {
        lifecycleStatus = 'FAILED';
        const errorMessage = err instanceof Error ? err.message : 'Orchestration error occurred.';
        const error: AgentError = {
          code: 'ORCHESTRATION_ERROR',
          message: errorMessage,
        };

        return {
          success: false,
          requestId,
          executionId,
          lifecycleStatus,
          agentResults,
          proposedActions,
          traces,
          summary: `Orchestration encountered fatal error: ${errorMessage}`,
          durationMs: Date.now() - startTime,
          error,
        };
      }
    })();

    try {
      return await Promise.race([workflowPromise, timeoutPromise]);
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.message.startsWith('ORCHESTRATION_TIMEOUT:');
      const error: AgentError = {
        code: isTimeout ? 'TIMEOUT' : 'FATAL_ERROR',
        message: err instanceof Error ? err.message : 'Unknown orchestration failure.',
      };

      return {
        success: false,
        requestId,
        executionId,
        lifecycleStatus: 'FAILED',
        agentResults,
        proposedActions,
        traces,
        summary: `Orchestration aborted: ${error.message}`,
        durationMs: Date.now() - startTime,
        error,
      };
    }
  }

  /**
   * Resolves the most suitable agent for the request.
   */
  private async selectAgent(
    request: AgentRequest,
    context: any
  ): Promise<BaseAgent | null> {
    // 1. Direct ID preference
    if (request.preferredAgentId) {
      const agent = this.registry.get(request.preferredAgentId);
      if (agent) {
        const canHandle = await agent.canHandle(context);
        if (canHandle) return agent;
      }
      return null;
    }

    // 2. Intent-specific routing based on user request keywords
    const reqText = (request.userRequest || '').toLowerCase();

    // 2a. Memory intent
    const isMemoryIntent = [
      'remember',
      'recall',
      'forget',
      'what do you know about me',
      'my preferences',
      'working style',
      'scheduling preference',
      'store memory',
      'delete memory',
    ].some((k) => reqText.includes(k));
    if (isMemoryIntent) {
      const memory = this.registry.get('agent.memory');
      if (memory && (await memory.canHandle(context))) return memory;
    }

    // 2b. Scheduler intent (specific scheduling, availability, or window reasoning)
    const isSchedulerIntent = [
      'when should i work on',
      'when should i',
      'when can i',
      'why should i work on this at',
      'why at',
      'schedule task',
      'schedule window',
      'free slot',
      'time slot',
      'calendar slot',
      'find time for',
      'reschedule',
      'fit in',
    ].some((k) => reqText.includes(k));
    if (isSchedulerIntent) {
      const scheduler = this.registry.get('agent.scheduler');
      if (scheduler && (await scheduler.canHandle(context))) return scheduler;
    }

    // 2c. Prioritizer intent (ranking, importance, what to do first)
    const isPrioritizerIntent = [
      'what should i work on first',
      'what is most important',
      'what to do first',
      'which task deserves my attention',
      'prioritize',
      'priority ranking',
      'order of importance',
      'rank my tasks',
    ].some((k) => reqText.includes(k));
    if (isPrioritizerIntent) {
      const prioritizer = this.registry.get('agent.prioritizer');
      if (prioritizer && (await prioritizer.canHandle(context))) return prioritizer;
    }

    // 2d. Planner intent (day planning, schedule overview, overall sequence)
    const isPlannerIntent = [
      'plan my day',
      'daily plan',
      'execution plan',
      "today's plan",
      'plan today',
    ].some((k) => reqText.includes(k));
    if (isPlannerIntent) {
      const planner = this.registry.get('agent.planner');
      if (planner && (await planner.canHandle(context))) return planner;
    }

    // 2e. Recovery intent (self correction, execution failure diagnosis)
    const isRecoveryIntent = [
      'recovery',
      'recover',
      'diagnose failure',
      'execution failed',
      'self correct',
      'handle error',
    ].some((k) => reqText.includes(k));
    if (isRecoveryIntent) {
      const recovery = this.registry.get('agent.recovery');
      if (recovery && (await recovery.canHandle(context))) return recovery;
    }

    // 3. Capability matching
    if (request.requiredCapabilities && request.requiredCapabilities.length > 0) {
      for (const cap of request.requiredCapabilities) {
        const matching = this.registry.findByCapability(cap);
        for (const candidate of matching) {
          const canHandle = await candidate.canHandle(context);
          if (canHandle) return candidate;
        }
      }
    }

    // 3. Fallback discovery across all registered agents
    const all = this.registry.list();
    for (const meta of all) {
      const agent = this.registry.get(meta.id);
      if (agent) {
        const canHandle = await agent.canHandle(context);
        if (canHandle) return agent;
      }
    }

    return null;
  }

  /**
   * Runs an end-to-end Chief of Staff workflow with safety review,
   * confirmation binding, and ToolManager execution handoff (Day 5C.5).
   */
  public async runWorkflow(
    request: WorkflowStartRequest,
    sessionUser: { userId: string }
  ): Promise<ChiefOfStaffWorkflowContext> {
    return chiefOfStaffWorkflow.startWorkflow(request, sessionUser);
  }
}

export const novaOrchestrator = new NovaOrchestrator();
