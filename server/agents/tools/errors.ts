/**
 * Domain-specific errors for Sentinel Nova Tool Manager and Tool Registry.
 */

import { ToolErrorCode } from './types';

export class BaseToolError extends Error {
  public readonly errorCode: ToolErrorCode;

  constructor(message: string, errorCode: ToolErrorCode) {
    super(message);
    this.name = this.constructor.name;
    this.errorCode = errorCode;
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class DuplicateToolRegistrationError extends BaseToolError {
  constructor(toolId: string) {
    super(`Tool with ID "${toolId}" is already registered. Duplicate registration is forbidden.`, 'TOOL_NOT_FOUND');
    this.name = 'DuplicateToolRegistrationError';
  }
}

export class ToolNotFoundError extends BaseToolError {
  constructor(toolId: string) {
    super(`Tool with ID "${toolId}" was not found in ToolRegistry.`, 'TOOL_NOT_FOUND');
    this.name = 'ToolNotFoundError';
  }
}

export class ConfirmationRequiredError extends BaseToolError {
  constructor(toolId: string) {
    super(`Explicit user confirmation is strictly required to execute tool "${toolId}".`, 'CONFIRMATION_REQUIRED');
    this.name = 'ConfirmationRequiredError';
  }
}

export class InvalidToolParametersError extends BaseToolError {
  constructor(toolId: string, details?: string) {
    super(`Invalid parameters supplied for tool "${toolId}": ${details || 'Validation failed'}`, 'INVALID_PARAMETERS');
    this.name = 'InvalidToolParametersError';
  }
}

export class UnauthorizedToolError extends BaseToolError {
  constructor(message = 'Access denied: Resource does not belong to authenticated user.') {
    super(message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedToolError';
  }
}

export class ActionNotAllowedError extends BaseToolError {
  constructor(actionType: string, toolId: string) {
    super(`Action type "${actionType}" is not allowed to invoke tool "${toolId}".`, 'ACTION_NOT_ALLOWED');
    this.name = 'ActionNotAllowedError';
  }
}

export class ToolTimeoutError extends BaseToolError {
  constructor(toolId: string, timeoutMs: number) {
    super(`Tool "${toolId}" timed out after ${timeoutMs}ms.`, 'TOOL_TIMEOUT');
    this.name = 'ToolTimeoutError';
  }
}

export class ToolExecutionError extends BaseToolError {
  constructor(toolId: string, message: string, errorCode: ToolErrorCode = 'TOOL_EXECUTION_FAILED') {
    super(`Execution of tool "${toolId}" failed: ${message}`, errorCode);
    this.name = 'ToolExecutionError';
  }
}

export class ResourceNotFoundError extends BaseToolError {
  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} with ID "${resourceId}" not found for authenticated user.`, 'RESOURCE_NOT_FOUND');
    this.name = 'ResourceNotFoundError';
  }
}
