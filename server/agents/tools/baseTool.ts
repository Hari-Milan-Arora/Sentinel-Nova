/**
 * BaseTool abstract class for Sentinel Nova tools.
 *
 * All tools:
 * 1. Define immutable metadata (ID, category, riskLevel, capabilities, requiresConfirmation).
 * 2. Validate input parameters strictly before execution.
 * 3. Enforce authenticated user isolation using context.userId (never trust input userId).
 * 4. Operate exclusively on their own domain resources through existing store services.
 */

import { ToolContext, ToolMetadata } from './types';

export interface ValidationResult<TInput> {
  valid: boolean;
  error?: string;
  validatedInput?: TInput;
}

export abstract class BaseTool<TInput = any, TOutput = any> {
  /**
   * Immutable tool metadata.
   */
  public abstract readonly metadata: ToolMetadata;

  /**
   * Validates tool input parameters at runtime.
   * Does NOT trust TypeScript types at runtime.
   */
  public abstract validate(input: unknown): ValidationResult<TInput>;

  /**
   * Executes the tool within the verified ToolContext.
   * context.userId is the ONLY authoritative identity.
   */
  public abstract execute(context: ToolContext, input: TInput): Promise<TOutput>;

  /**
   * Utility to check for malicious script/code injection in parameters.
   */
  protected hasCodeInjectionRisk(val: unknown): boolean {
    if (typeof val !== 'string') return false;
    const lower = val.toLowerCase();
    return (
      lower.includes('<script') ||
      lower.includes('javascript:') ||
      lower.includes('data:text/html') ||
      lower.includes('eval(') ||
      lower.includes('function(') ||
      lower.includes('process.exit') ||
      lower.includes('require(') ||
      lower.includes('import(')
    );
  }
}
