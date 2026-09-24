/**
 * Tool Contract and Types for Sentinel Nova Execution Boundary (Day 5C.1)
 *
 * Architectural Principle:
 * Agents THINK and PROPOSE.
 * Tool Manager VALIDATES and EXECUTES.
 *
 * All mutations MUST flow through ToolManager and verified registered tools.
 * Zero autonomous execution. Zero agent tool invocations.
 */

export type ToolRiskLevel = 'low' | 'medium' | 'high';

export type ToolCategory = 'task' | 'goal' | 'project' | 'scheduling' | 'system';

export type ToolErrorCode =
  | 'TOOL_NOT_FOUND'
  | 'INVALID_PARAMETERS'
  | 'INVALID_TIMESTAMPS'
  | 'INVALID_TIME_RANGE'
  | 'CONFIRMATION_REQUIRED'
  | 'UNAUTHORIZED'
  | 'RESOURCE_NOT_FOUND'
  | 'ACTION_NOT_ALLOWED'
  | 'TOOL_EXECUTION_FAILED'
  | 'TOOL_TIMEOUT'
  | 'UNAUTHENTICATED'
  | 'MALFORMED_REQUEST'
  | 'STORE_ERROR'
  | 'WINDOW_UNAVAILABLE'
  | 'TASK_CONFLICT'
  | 'DURATION_MISMATCH';

/**
 * Immutable metadata declared by every registered tool.
 */
export interface ToolMetadata {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly category: ToolCategory;
  readonly riskLevel: ToolRiskLevel;
  readonly requiresConfirmation: boolean;
  readonly capabilities: readonly string[];
  readonly inputSchema?: Record<string, unknown>;
  readonly outputDescription?: string;
}

/**
 * Execution context supplied strictly by the server / ToolManager.
 * The tool must NEVER receive arbitrary secrets, raw tokens, or client-spoofed identities.
 */
export interface ToolContext {
  readonly userId: string; // Authenticated identity from verified session
  readonly executionId: string;
  readonly actionId?: string;
  readonly sourceAgentId?: string;
  readonly userConfirmed: boolean;
  readonly signal?: AbortSignal;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Structured request submitted to ToolManager for approved execution.
 */
export interface ToolExecutionRequest {
  readonly executionId?: string;
  readonly actionId?: string;
  readonly actionType?: string;
  readonly toolId: string;
  readonly userId: string; // Verified from authenticated session
  readonly parameters: Record<string, unknown>;
  readonly confirmed: boolean; // Confirmation Gate
  readonly sourceAgentId?: string;
}

/**
 * Standardized execution result returned by ToolManager.
 */
export interface ToolExecutionResult {
  readonly success: boolean;
  readonly executionId: string;
  readonly toolId: string;
  readonly actionId?: string;
  readonly output?: unknown;
  readonly message?: string;
  readonly error?: string;
  readonly errorCode?: ToolErrorCode;
  readonly durationMs: number;
  readonly metadata?: Record<string, unknown>;
  // Backward compatibility fields for scheduling operations
  readonly toolName?: string;
  readonly rollbackAvailable?: boolean;
  readonly previousState?: {
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
  };
  readonly data?: Record<string, unknown>;
}

/**
 * Transient execution trace for security auditing.
 * MUST NOT contain passwords, OAuth tokens, cookies, auth headers, or raw secrets.
 */
export interface ToolExecutionTrace {
  readonly executionId: string;
  readonly actionId?: string;
  readonly toolId: string;
  readonly sourceAgentId?: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly status: 'success' | 'failed' | 'timeout' | 'rejected';
  readonly errorCode?: ToolErrorCode | string;
}
