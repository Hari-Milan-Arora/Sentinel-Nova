/**
 * Recovery Reasoning Service for Sentinel Nova (Day 5C.3)
 *
 * Provides optional LLM failure diagnosis and strategy deliberation assistance
 * via the shared GeminiModelRouter.
 *
 * SAFETY & PRIVACY MANDATES:
 * 1. Strictly optional: Deterministic RecoveryEngine always functions without Gemini.
 * 2. Strict 3000ms timeout with Promise.race and timer cleanup.
 * 3. Anonymous Snapshot: ZERO user IDs, task IDs, project IDs, calendar IDs,
 *    OAuth tokens, session cookies, AUTH_SECRET, or auth headers.
 * 4. Anonymous 1-based indexing for strategy and alternative candidates.
 * 5. Gemini is treated as UNTRUSTED: Output is strictly parsed, validated, and bounds-checked.
 *    Any invalid index, unknown strategy, or suspicious payload triggers immediate fallback.
 */

import { geminiModelRouter, GeminiModelRouter } from './GeminiModelRouter';
import {
  FailureCategory,
  RecoveryDecision,
  RecoveryStrategyCandidate,
  RecoveryStrategyType,
} from '../agents/recoveryTypes';

export interface AnonymousStrategySnapshot {
  index: number; // 1-based index
  strategy: RecoveryStrategyType;
  score: number;
  isViable: boolean;
  rationale: string;
}

export interface AnonymousRecoverySnapshot {
  failureCategory: FailureCategory;
  failureSummary: string;
  toolType: string;
  attemptNumber: number;
  loopDetected: boolean;
  strategies: AnonymousStrategySnapshot[];
  alternativesCount: number;
}

export interface RecoveryEnhancementResult {
  enhanced: boolean;
  recommendedStrategy: RecoveryStrategyType;
  confidence: number;
  refinedRationale: string;
  reasoningSource: 'deterministic' | 'gemini_enhanced' | 'deterministic_fallback';
  warnings: string[];
}

export class RecoveryReasoningService {
  private router: GeminiModelRouter;
  private readonly timeoutMs: number = 3000;

  constructor(router?: GeminiModelRouter) {
    this.router = router || geminiModelRouter;
  }

  /**
   * Sanitizes an action or tool name to an abstract functional label without IDs.
   */
  public getAnonymousToolLabel(toolId?: string): string {
    if (!toolId) return 'generic_action';
    const lower = toolId.toLowerCase();
    if (lower.includes('task.complete')) return 'task_completion';
    if (lower.includes('task.reopen')) return 'task_reopening';
    if (lower.includes('task.schedule')) return 'task_scheduling';
    return 'safe_workflow_action';
  }

  /**
   * Builds an anonymous, sanitized snapshot for Gemini deliberation.
   * Strips all internal IDs, tokens, secrets, and raw database identifiers.
   */
  public buildAnonymousSnapshot(decision: RecoveryDecision, attemptNumber: number): AnonymousRecoverySnapshot {
    const anonymousStrategies: AnonymousStrategySnapshot[] = decision.strategies.map((s, idx) => ({
      index: idx + 1,
      strategy: s.strategy,
      score: s.score,
      isViable: s.isViable,
      rationale: s.rationale,
    }));

    // Clean summary without any token / secret
    const cleanSummary = decision.rationale.slice(0, 300);

    return {
      failureCategory: decision.failureCategory,
      failureSummary: cleanSummary,
      toolType: this.getAnonymousToolLabel(decision.proposedActions[0]?.parameters?.toolId as string),
      attemptNumber,
      loopDetected: decision.loopDetected,
      strategies: anonymousStrategies,
      alternativesCount: decision.alternatives.length,
    };
  }

  /**
   * Invokes Gemini for optional strategy enhancement, bounded by a strict 3000ms timeout.
   */
  public async enhanceDeliberation(
    decision: RecoveryDecision,
    attemptNumber: number = 1
  ): Promise<RecoveryEnhancementResult> {
    const fallbackResult: RecoveryEnhancementResult = {
      enhanced: false,
      recommendedStrategy: decision.recommendedRecovery,
      confidence: decision.confidence,
      refinedRationale: decision.rationale,
      reasoningSource: 'deterministic',
      warnings: [],
    };

    // If loop was detected, bypass Gemini and strictly enforce deterministic safety
    if (decision.loopDetected) {
      return {
        ...fallbackResult,
        reasoningSource: 'deterministic',
        warnings: ['Loop guard active: Gemini reasoning bypassed to enforce safe abort/ask_user.'],
      };
    }

    // Build strictly anonymous snapshot
    const snapshot = this.buildAnonymousSnapshot(decision, attemptNumber);

    const prompt = `You are Sentinel Nova's Self-Correction Deliberation Engine.
Analyze this anonymous execution failure snapshot and recommend the safest recovery strategy.

SNAPSHOT:
${JSON.stringify(snapshot, null, 2)}

CONSTRAINTS:
1. You may ONLY choose an index from the provided strategies list where isViable is true.
2. Under NO circumstances recommend executing arbitrary shell commands, code injection, or external network requests.
3. If an authorization failure or loop is indicated, you MUST choose ask_user or abort.
4. Return pure JSON only with keys:
   "chosenStrategyIndex": <number, 1-based index>,
   "refinedRationale": "<concise explanation under 300 chars>",
   "confidence": <number between 0.0 and 1.0>
`;

    let timer: NodeJS.Timeout | null = null;
    try {
      const timeoutPromise = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), this.timeoutMs);
      });

      const geminiPromise = this.router.generateContent(
        {
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        },
        { timeoutMs: this.timeoutMs }
      );

      const result = await Promise.race([geminiPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);

      if (!result || !result.ok || !result.text) {
        return {
          ...fallbackResult,
          reasoningSource: 'deterministic_fallback',
          warnings: ['Gemini enhancement unavailable or timed out. Used deterministic deliberation.'],
        };
      }

      // Parse and strictly validate untrusted Gemini output
      const parsed = this.parseAndValidateResponse(result.text, decision.strategies);
      if (!parsed) {
        return {
          ...fallbackResult,
          reasoningSource: 'deterministic_fallback',
          warnings: ['Gemini response validation failed. Used deterministic deliberation.'],
        };
      }

      return {
        enhanced: true,
        recommendedStrategy: parsed.strategy,
        confidence: parsed.confidence,
        refinedRationale: parsed.rationale,
        reasoningSource: 'gemini_enhanced',
        warnings: [],
      };
    } catch (err) {
      if (timer) clearTimeout(timer);
      return {
        ...fallbackResult,
        reasoningSource: 'deterministic_fallback',
        warnings: ['Error during Gemini deliberation. Used deterministic deliberation.'],
      };
    }
  }

  /**
   * Strictly validates untrusted Gemini output against viable strategies.
   */
  public parseAndValidateResponse(
    rawText: string,
    candidates: RecoveryStrategyCandidate[]
  ): { strategy: RecoveryStrategyType; confidence: number; rationale: string } | null {
    try {
      // Clean potential markdown blocks
      const cleanJson = rawText
        .replace(/^```json/im, '')
        .replace(/^```/im, '')
        .replace(/```$/im, '')
        .trim();

      const data = JSON.parse(cleanJson);
      if (!data || typeof data !== 'object') return null;

      // Disallowed injection patterns
      const rawStr = JSON.stringify(data).toLowerCase();
      const forbiddenTokens = ['execute_shell', 'eval(', 'process.exit', '<script', 'child_process'];
      for (const token of forbiddenTokens) {
        if (rawStr.includes(token)) return null;
      }

      // Check chosenStrategyIndex (1-based)
      const index = typeof data.chosenStrategyIndex === 'number' ? data.chosenStrategyIndex : -1;
      if (index < 1 || index > candidates.length || !Number.isInteger(index)) {
        return null;
      }

      const selected = candidates[index - 1];
      // Must be viable
      if (!selected || !selected.isViable) {
        return null;
      }

      // Confidence must be valid number [0.0, 1.0]
      let confidence = selected.score;
      if (typeof data.confidence === 'number' && !isNaN(data.confidence) && isFinite(data.confidence)) {
        confidence = Math.max(0.0, Math.min(1.0, data.confidence));
      }

      // Rationale must be string <= 500 chars
      const rationale =
        typeof data.refinedRationale === 'string' && data.refinedRationale.trim()
          ? data.refinedRationale.trim().slice(0, 500)
          : selected.rationale;

      return {
        strategy: selected.strategy,
        confidence,
        rationale,
      };
    } catch {
      return null;
    }
  }
}

export const recoveryReasoningService = new RecoveryReasoningService();
