/**
 * Agent Result Utilities for Sentinel Nova Multi-Agent Runtime
 */

import { AgentAction, AgentError, AgentResult } from './types';

/**
 * Normalizes confidence scores into the standard [0.0, 1.0] range.
 * Returns undefined if confidence is undefined, null, or NaN.
 */
export function normalizeConfidence(value?: number | null): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return undefined;
  }
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Math.round(value * 1000) / 1000;
}

/**
 * Factory for a successful AgentResult.
 */
export function createSuccessResult<T = unknown>(params: {
  agentId: string;
  executionId: string;
  output: T;
  confidence?: number;
  actions?: AgentAction[];
  warnings?: string[];
  metadata?: Record<string, unknown>;
  durationMs: number;
}): AgentResult<T> {
  return {
    success: true,
    agentId: params.agentId,
    executionId: params.executionId,
    output: params.output,
    confidence: normalizeConfidence(params.confidence),
    actions: params.actions || [],
    warnings: params.warnings || [],
    errors: [],
    metadata: params.metadata || {},
    durationMs: Math.max(0, params.durationMs),
  };
}

/**
 * Factory for an error AgentResult.
 * Does not expose stack traces or internal secrets.
 */
export function createErrorResult(params: {
  agentId: string;
  executionId: string;
  error: AgentError;
  warnings?: string[];
  metadata?: Record<string, unknown>;
  durationMs: number;
}): AgentResult<null> {
  return {
    success: false,
    agentId: params.agentId,
    executionId: params.executionId,
    output: null,
    confidence: undefined,
    actions: [],
    warnings: params.warnings || [],
    errors: [params.error],
    metadata: params.metadata || {},
    durationMs: Math.max(0, params.durationMs),
  };
}

/**
 * Validates and normalizes an arbitrary agent output into a strictly formed AgentResult.
 */
export function validateAgentResult(result: unknown, agentId: string, executionId: string, durationMs: number): AgentResult {
  if (!result || typeof result !== 'object') {
    return createErrorResult({
      agentId,
      executionId,
      error: {
        code: 'MALFORMED_OUTPUT',
        message: 'Agent returned a non-object result.',
      },
      durationMs,
    });
  }

  const res = result as Partial<AgentResult>;

  return {
    success: typeof res.success === 'boolean' ? res.success : true,
    agentId: typeof res.agentId === 'string' ? res.agentId : agentId,
    executionId: typeof res.executionId === 'string' ? res.executionId : executionId,
    output: res.output !== undefined ? res.output : null,
    confidence: normalizeConfidence(res.confidence),
    actions: Array.isArray(res.actions) ? res.actions : [],
    warnings: Array.isArray(res.warnings) ? res.warnings.map(String) : [],
    errors: Array.isArray(res.errors) ? (res.errors as AgentError[]) : [],
    metadata: res.metadata && typeof res.metadata === 'object' ? (res.metadata as Record<string, unknown>) : {},
    durationMs: typeof res.durationMs === 'number' ? res.durationMs : durationMs,
  };
}
