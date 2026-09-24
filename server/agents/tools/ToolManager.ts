/**
 * ToolManager for Sentinel Nova Multi-Agent Runtime (Day 5C.1)
 *
 * Provides a centralized, secure execution boundary for Sentinel Nova.
 * Sits strictly downstream of agent proposals and user confirmation.
 *
 * Architectural Principle:
 * Agents THINK and PROPOSE.
 * Tool Manager VALIDATES and EXECUTES.
 *
 * SAFETY MANDATES:
 * 1. Require verified authenticated user identity (derived strictly from server context).
 * 2. Never trust client-provided or action-provided userId.
 * 3. Enforce strict Confirmation Gate: if tool requires confirmation, confirmed MUST be true.
 * 4. Enforce strict Action-to-Tool allowlist mapping.
 * 5. Bounded timeouts (DEFAULT_TOOL_TIMEOUT_MS = 5000ms, MAX = 10000ms).
 * 6. User Isolation: tools operate strictly on authenticated user's resources.
 * 7. Zero autonomous execution by agents (no agent may invoke tools directly).
 * 8. Error boundaries: catch and sanitize all exceptions; zero stack trace / secret leakage.
 * 9. Transient execution traces without credentials or auth secrets.
 */

import { AgentAction } from '../types';
import {
  ToolContext,
  ToolExecutionRequest,
  ToolExecutionResult,
  ToolExecutionTrace,
  ToolErrorCode,
} from './types';
import { ToolRegistry, toolRegistry as defaultRegistry } from './ToolRegistry';
import { BaseTool } from './baseTool';
import { CompleteTaskTool, ReopenTaskTool, ScheduleTaskTool } from './tools/TaskTools';
import { BaseToolError } from './errors';

export const DEFAULT_TOOL_TIMEOUT_MS = 5000;
export const MAX_TOOL_TIMEOUT_MS = 10000;
const MAX_TRACE_BUFFER_SIZE = 100;
const MAX_PAYLOAD_BYTES = 65536; // 64KB max parameter payload

// Strict Action-to-Tool Mapping allowlist
const ACTION_TO_TOOL_MAP: Readonly<Record<string, string>> = Object.freeze({
  COMPLETE_TASK: 'tool.task.complete',
  REOPEN_TASK: 'tool.task.reopen',
  SCHEDULE_TASK: 'tool.task.schedule',
});

// Tool-to-Action reverse mapping allowlist
const TOOL_TO_ACTION_MAP: Readonly<Record<string, string>> = Object.freeze({
  'tool.task.complete': 'COMPLETE_TASK',
  'tool.task.reopen': 'REOPEN_TASK',
  'tool.task.schedule': 'SCHEDULE_TASK',
});

// Backward compatibility context interface
export interface ToolExecutionContext {
  userId: string;
  userConfirmed: boolean;
  requestId?: string;
  executionId?: string;
}

export class ToolManager {
  private readonly registry: ToolRegistry;
  private readonly traces: ToolExecutionTrace[] = [];

  constructor(registry: ToolRegistry = defaultRegistry) {
    this.registry = registry;
  }

  /**
   * Primary Day 5C.1 Execution Boundary.
   * Executes a confirmed, authorized request against a registered tool.
   */
  public async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const startedAt = new Date().toISOString();
    const startTimeMs = Date.now();
    const executionId = request?.executionId || `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const actionId = request?.actionId;
    const sourceAgentId = request?.sourceAgentId;
    let toolId = request?.toolId || 'UNKNOWN';

    try {
      // 1. Validate Execution Request Structure
      if (!request || typeof request !== 'object' || Array.isArray(request)) {
        return this.createErrorResult({
          executionId,
          toolId: 'UNKNOWN',
          actionId,
          message: 'Malformed execution request: Request must be a JSON object.',
          errorCode: 'MALFORMED_REQUEST',
          durationMs: Date.now() - startTimeMs,
          startedAt,
          sourceAgentId,
        });
      }

      // 2. Validate Authenticated Identity (must be non-empty string)
      if (!request.userId || typeof request.userId !== 'string' || !request.userId.trim()) {
        return this.createErrorResult({
          executionId,
          toolId,
          actionId,
          message: 'Authentication failure: Valid authenticated userId is required.',
          errorCode: 'UNAUTHENTICATED',
          durationMs: Date.now() - startTimeMs,
          startedAt,
          sourceAgentId,
        });
      }
      const userId = request.userId.trim();

      // 3. Validate Tool ID
      if (!request.toolId || typeof request.toolId !== 'string' || !request.toolId.trim()) {
        return this.createErrorResult({
          executionId,
          toolId: 'UNKNOWN',
          actionId,
          message: 'Missing or invalid toolId.',
          errorCode: 'TOOL_NOT_FOUND',
          durationMs: Date.now() - startTimeMs,
          startedAt,
          sourceAgentId,
        });
      }
      toolId = request.toolId.trim();

      // 4. Resolve Tool from Registry
      const tool = this.registry.get(toolId);
      if (!tool) {
        return this.createErrorResult({
          executionId,
          toolId,
          actionId,
          message: `Tool with ID "${toolId}" was not found in ToolRegistry.`,
          errorCode: 'TOOL_NOT_FOUND',
          durationMs: Date.now() - startTimeMs,
          startedAt,
          sourceAgentId,
        });
      }

      // 5. Verify Action -> Tool Compatibility Mapping
      if (request.actionType) {
        const expectedToolId = ACTION_TO_TOOL_MAP[request.actionType];
        if (!expectedToolId) {
          return this.createErrorResult({
            executionId,
            toolId,
            actionId,
            message: `Action type "${request.actionType}" is not allowed or unrecognized.`,
            errorCode: 'ACTION_NOT_ALLOWED',
            durationMs: Date.now() - startTimeMs,
            startedAt,
            sourceAgentId,
          });
        }
        if (expectedToolId !== toolId) {
          return this.createErrorResult({
            executionId,
            toolId,
            actionId,
            message: `Action type "${request.actionType}" cannot be executed by tool "${toolId}" (expected "${expectedToolId}").`,
            errorCode: 'ACTION_NOT_ALLOWED',
            durationMs: Date.now() - startTimeMs,
            startedAt,
            sourceAgentId,
          });
        }
      }

      // 6. Confirmation Gate Enforcement
      if (tool.metadata.requiresConfirmation && request.confirmed !== true) {
        return this.createErrorResult({
          executionId,
          toolId,
          actionId,
          message: `Action rejected: Tool "${toolId}" strictly requires explicit user confirmation prior to execution.`,
          errorCode: 'CONFIRMATION_REQUIRED',
          durationMs: Date.now() - startTimeMs,
          startedAt,
          sourceAgentId,
        });
      }

      // 7. Global Parameter Boundary & Attack Checks
      const params = request.parameters;
      if (!params || typeof params !== 'object' || Array.isArray(params)) {
        return this.createErrorResult({
          executionId,
          toolId,
          actionId,
          message: 'Malformed tool parameters: Parameters must be a JSON object.',
          errorCode: 'INVALID_PARAMETERS',
          durationMs: Date.now() - startTimeMs,
          startedAt,
          sourceAgentId,
        });
      }

      // Check parameter size
      try {
        const rawJson = JSON.stringify(params);
        if (rawJson.length > MAX_PAYLOAD_BYTES) {
          return this.createErrorResult({
            executionId,
            toolId,
            actionId,
            message: `Parameter payload exceeds maximum limit of ${MAX_PAYLOAD_BYTES} bytes.`,
            errorCode: 'INVALID_PARAMETERS',
            durationMs: Date.now() - startTimeMs,
            startedAt,
            sourceAgentId,
          });
        }
      } catch {
        return this.createErrorResult({
          executionId,
          toolId,
          actionId,
          message: 'Failed to serialize parameters: Circular structure or invalid payload.',
          errorCode: 'INVALID_PARAMETERS',
          durationMs: Date.now() - startTimeMs,
          startedAt,
          sourceAgentId,
        });
      }

      // Global safety check against prototype pollution & shell/module execution
      if (this.detectInjectionAttacks(params)) {
        return this.createErrorResult({
          executionId,
          toolId,
          actionId,
          message: 'Execution rejected: Disallowed code execution, prototype manipulation, or module injection detected.',
          errorCode: 'INVALID_PARAMETERS',
          durationMs: Date.now() - startTimeMs,
          startedAt,
          sourceAgentId,
        });
      }

      // 8. Tool-Specific Parameter Validation
      const validation = tool.validate(params);
      if (!validation.valid || !validation.validatedInput) {
        const specificCode: ToolErrorCode =
          validation.error === 'INVALID_TIMESTAMPS' || validation.error === 'INVALID_TIME_RANGE'
            ? validation.error
            : 'INVALID_PARAMETERS';
        return this.createErrorResult({
          executionId,
          toolId,
          actionId,
          message: `Parameter validation failed: ${validation.error || 'Invalid parameters.'}`,
          errorCode: specificCode,
          durationMs: Date.now() - startTimeMs,
          startedAt,
          sourceAgentId,
        });
      }

      // 9. Build Execution Context (userId derived strictly from request.userId)
      const abortController = new AbortController();
      const toolContext: ToolContext = {
        userId,
        executionId,
        actionId,
        sourceAgentId,
        userConfirmed: request.confirmed,
        signal: abortController.signal,
      };

      // 10. Bounded Execution with Timeout
      const output = await this.executeWithTimeout(
        tool,
        toolContext,
        validation.validatedInput,
        abortController,
        DEFAULT_TOOL_TIMEOUT_MS
      );

      const durationMs = Date.now() - startTimeMs;
      const completedAt = new Date().toISOString();

      // Record successful trace
      this.recordTrace({
        executionId,
        actionId,
        toolId,
        sourceAgentId,
        startedAt,
        completedAt,
        durationMs,
        status: 'success',
      });

      // Format result with backwards compatibility data if present
      const outputObj = output as Record<string, unknown> | undefined;
      return {
        success: true,
        executionId,
        toolId,
        actionId,
        output,
        message: (outputObj && typeof outputObj.message === 'string') ? outputObj.message : `Tool "${toolId}" executed successfully.`,
        durationMs,
        toolName: toolId,
        rollbackAvailable: Boolean(outputObj?.rollbackAvailable),
        previousState: outputObj?.previousState as any,
        data: outputObj?.data ? (outputObj.data as any) : outputObj,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTimeMs;
      const completedAt = new Date().toISOString();

      let errorCode: ToolErrorCode = 'TOOL_EXECUTION_FAILED';
      let message = 'An unexpected tool execution error occurred.';

      if (err instanceof BaseToolError) {
        errorCode = err.errorCode;
        message = err.message;
      } else if (err?.message === 'TIMEOUT') {
        errorCode = 'TOOL_TIMEOUT';
        message = `Execution of tool "${toolId}" timed out after ${DEFAULT_TOOL_TIMEOUT_MS}ms.`;
      } else if (typeof err?.message === 'string') {
        // Sanitize error message to ensure no secrets or local filesystem paths leak
        message = this.sanitizeErrorMessage(err.message);
      }

      const status = errorCode === 'TOOL_TIMEOUT' ? 'timeout' : 'failed';
      this.recordTrace({
        executionId,
        actionId,
        toolId,
        sourceAgentId,
        startedAt,
        completedAt,
        durationMs,
        status,
        errorCode,
      });

      return {
        success: false,
        executionId,
        toolId,
        actionId,
        error: errorCode,
        message,
        errorCode,
        durationMs,
        toolName: toolId,
      };
    }
  }

  /**
   * Backward-compatible execution entrypoint for AgentAction objects.
   * Preserves full compatibility with ReviewerAgent and existing test suites.
   */
  public async executeAction(
    action: AgentAction,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    if (!context || !context.userId || typeof context.userId !== 'string' || !context.userId.trim()) {
      return {
        success: false,
        executionId: context?.executionId || 'unknown',
        toolId: (action && action.type) || 'UNKNOWN',
        toolName: (action && action.type) || 'UNKNOWN',
        actionId: (action && action.actionId) || '',
        message: 'Authentication failure: Context must contain a valid authenticated userId.',
        error: 'UNAUTHENTICATED',
        errorCode: 'UNAUTHENTICATED',
        durationMs: 0,
      };
    }

    if (!action || typeof action !== 'object') {
      return {
        success: false,
        executionId: context.executionId || 'unknown',
        toolId: 'UNKNOWN',
        toolName: 'UNKNOWN',
        actionId: '',
        message: 'Malformed action proposal received.',
        error: 'MALFORMED_REQUEST',
        errorCode: 'MALFORMED_REQUEST',
        durationMs: 0,
      };
    }

    const actionType = action.type;
    const toolId = ACTION_TO_TOOL_MAP[actionType];

    if (!toolId) {
      return {
        success: false,
        executionId: context.executionId || 'unknown',
        toolId: actionType || 'UNKNOWN',
        toolName: actionType || 'UNKNOWN',
        actionId: action.actionId || '',
        message: `Action type "${actionType}" is not supported by ToolManager.`,
        error: 'UNSUPPORTED_ACTION_TYPE',
        errorCode: 'ACTION_NOT_ALLOWED',
        durationMs: 0,
      };
    }

    // Adapt parameters (e.g. merge target into taskId if needed)
    const params: Record<string, unknown> = { ...(action.parameters || {}) };
    if (!params.taskId && action.target) {
      params.taskId = action.target;
    }

    const request: ToolExecutionRequest = {
      executionId: context.executionId,
      actionId: action.actionId,
      actionType,
      toolId,
      userId: context.userId,
      parameters: params,
      confirmed: context.userConfirmed === true,
      sourceAgentId: action.sourceAgentId,
    };

    const res = await this.execute(request);

    // Map error code to legacy error strings if needed
    let legacyError = res.error || res.errorCode;
    if (res.errorCode === 'ACTION_NOT_ALLOWED') {
      legacyError = 'UNSUPPORTED_ACTION_TYPE';
    } else if (res.errorCode === 'RESOURCE_NOT_FOUND') {
      legacyError = 'TASK_NOT_FOUND';
    } else if (res.errorCode === 'UNAUTHORIZED') {
      legacyError = 'FORBIDDEN';
    }

    return {
      ...res,
      error: legacyError,
      toolName: actionType,
    };
  }

  /**
   * Retrieves transient execution traces for auditing.
   */
  public getRecentTraces(): ToolExecutionTrace[] {
    return Object.freeze([...this.traces]) as ToolExecutionTrace[];
  }

  /**
   * Clears trace buffer (primarily for test cleanup).
   */
  public clearTraces(): void {
    this.traces.length = 0;
  }

  /**
   * Bounded execution race with AbortSignal.
   */
  private async executeWithTimeout<TInput, TOutput>(
    tool: BaseTool<TInput, TOutput>,
    context: ToolContext,
    input: TInput,
    abortController: AbortController,
    timeoutMs: number
  ): Promise<TOutput> {
    let timer: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abortController.abort();
        reject(new Error('TIMEOUT'));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        tool.execute(context, input),
        timeoutPromise,
      ]);
      return result;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private detectInjectionAttacks(payload: Record<string, unknown>): boolean {
    const serialized = JSON.stringify(payload).toLowerCase();
    const disallowed = [
      '__proto__',
      'constructor',
      'prototype',
      'process.exit',
      'require(',
      'import(',
      'child_process',
      'fs/promises',
      'eval(',
      'function(',
      'spawn(',
      'exec(',
    ];
    return disallowed.some(term => serialized.includes(term));
  }

  private sanitizeErrorMessage(raw: string): string {
    return raw
      .replace(/\/[\w./-]+/g, '[PATH_REDACTED]')
      .replace(/(?:key|token|secret|password)=[\w.-]+/gi, '$1=[REDACTED]');
  }

  private createErrorResult(opts: {
    executionId: string;
    toolId: string;
    actionId?: string;
    message: string;
    errorCode: ToolErrorCode;
    durationMs: number;
    startedAt: string;
    sourceAgentId?: string;
  }): ToolExecutionResult {
    const completedAt = new Date().toISOString();
    this.recordTrace({
      executionId: opts.executionId,
      actionId: opts.actionId,
      toolId: opts.toolId,
      sourceAgentId: opts.sourceAgentId,
      startedAt: opts.startedAt,
      completedAt,
      durationMs: opts.durationMs,
      status: 'rejected',
      errorCode: opts.errorCode,
    });

    return {
      success: false,
      executionId: opts.executionId,
      toolId: opts.toolId,
      actionId: opts.actionId,
      message: opts.message,
      error: opts.errorCode,
      errorCode: opts.errorCode,
      durationMs: opts.durationMs,
      toolName: opts.toolId,
    };
  }

  private recordTrace(trace: ToolExecutionTrace): void {
    if (this.traces.length >= MAX_TRACE_BUFFER_SIZE) {
      this.traces.shift();
    }
    this.traces.push(Object.freeze({ ...trace }));
  }
}

// Initialize tools in default registry
const completeTaskTool = new CompleteTaskTool();
const reopenTaskTool = new ReopenTaskTool();
const scheduleTaskTool = new ScheduleTaskTool();

if (!defaultRegistry.has(completeTaskTool.metadata.id)) {
  defaultRegistry.register(completeTaskTool);
}
if (!defaultRegistry.has(reopenTaskTool.metadata.id)) {
  defaultRegistry.register(reopenTaskTool);
}
if (!defaultRegistry.has(scheduleTaskTool.metadata.id)) {
  defaultRegistry.register(scheduleTaskTool);
}

export const toolManager = new ToolManager(defaultRegistry);
