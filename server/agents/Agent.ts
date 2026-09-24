/**
 * Base Agent Abstraction for Sentinel Nova Multi-Agent Runtime (Day 5A)
 *
 * Provides lifecycle isolation, safe execution timeouts, error normalization,
 * and standard action proposal creation.
 */

import {
  AgentCapability,
  AgentContext,
  AgentId,
  AgentMetadata,
  AgentResult,
  AgentAction,
  AgentActionType,
  RiskLevel,
} from './types';
import { createErrorResult, createSuccessResult, validateAgentResult } from './AgentResult';

export abstract class BaseAgent implements AgentMetadata {
  public abstract readonly id: AgentId;
  public abstract readonly name: string;
  public abstract readonly description: string;
  public abstract readonly version: string;
  public abstract readonly capabilities: AgentCapability[];
  public readonly timeoutMs: number = 10000; // Default 10 second timeout

  constructor(customTimeoutMs?: number) {
    if (customTimeoutMs && customTimeoutMs > 0) {
      this.timeoutMs = customTimeoutMs;
    }
  }

  /**
   * Determine whether this agent can handle the provided context and request.
   */
  public abstract canHandle(context: AgentContext): boolean | Promise<boolean>;

  /**
   * Internal agent execution logic implemented by concrete agents.
   * Can be deterministic or invoke an external service like Gemini.
   */
  protected abstract run(
    context: AgentContext
  ): Promise<Partial<AgentResult> | AgentResult>;

  /**
   * Public execution entry point.
   * Wraps the agent's run() in strict error isolation, timeout enforcement,
   * and result schema validation.
   */
  public async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    const { executionId } = context;

    try {
      // Enforce timeout using Promise.race
      const executionPromise = this.run(context);
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          clearTimeout(timer);
          reject(new Error(`AGENT_TIMEOUT: Agent '${this.id}' exceeded timeout limit of ${this.timeoutMs}ms.`));
        }, this.timeoutMs);
      });

      const rawResult = await Promise.race([executionPromise, timeoutPromise]);
      const durationMs = Date.now() - startTime;

      return validateAgentResult(rawResult, this.id, executionId, durationMs);
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const isTimeout = err instanceof Error && err.message.startsWith('AGENT_TIMEOUT:');

      return createErrorResult({
        agentId: this.id,
        executionId,
        error: {
          code: isTimeout ? 'TIMEOUT' : 'EXECUTION_FAILED',
          message: err instanceof Error ? err.message : 'Unknown execution error occurred.',
        },
        durationMs,
      });
    }
  }

  /**
   * Safe helper to construct an Action Proposal.
   * Day 5A Mandate: Action Proposals are never executed directly by the agent.
   */
  protected createActionProposal(params: {
    type: AgentActionType;
    description: string;
    target: string;
    parameters?: Record<string, unknown>;
    riskLevel?: RiskLevel;
    requiresConfirmation?: boolean;
  }): AgentAction {
    return {
      actionId: `act_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      type: params.type,
      description: params.description,
      target: params.target,
      parameters: params.parameters || {},
      riskLevel: params.riskLevel || 'medium',
      requiresConfirmation: params.requiresConfirmation !== false,
      sourceAgentId: this.id,
    };
  }

  /**
   * Safe helper to construct a successful result directly.
   */
  protected createSuccess<T>(
    context: AgentContext,
    output: T,
    options?: {
      confidence?: number;
      actions?: AgentAction[];
      warnings?: string[];
      metadata?: Record<string, unknown>;
    }
  ): AgentResult<T> {
    return createSuccessResult({
      agentId: this.id,
      executionId: context.executionId,
      output,
      confidence: options?.confidence,
      actions: options?.actions,
      warnings: options?.warnings,
      metadata: options?.metadata,
      durationMs: 0, // will be computed in execute()
    });
  }
}
