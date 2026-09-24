/**
 * Prioritization Reasoning Service for Sentinel Nova (Day 5B.2)
 *
 * Provides optional LLM enhancement via Gemini for the Prioritizer Agent.
 *
 * Security & Reliability Mandate:
 * - Deterministic fallback if Gemini is missing, times out, or throws
 * - Sanitized compact prioritization snapshot:
 *   ZERO task IDs, goal IDs, project IDs, user IDs, OAuth tokens, cookies, or secrets
 * - Anonymous positional indices only (0 to N-1, bounded to max 10 tasks)
 * - Strict 3000ms bounded timeout via Promise.race
 * - Untrusted output validation:
 *   Validates JSON schema, validates integer indexes [0, activeTasks.length - 1],
 *   clamps confidence [0.0, 1.0], rejects arbitrary strings/IDs
 * - Never persists prompts or chain-of-thought
 * - NEVER executes actions
 */

import {
  PrioritizerOutput,
  PrioritizationStrategyId,
} from '../agents/prioritizerTypes';
import { geminiModelRouter, GeminiModelRouter } from './GeminiModelRouter';

export interface CompactPrioritizationSnapshotTask {
  index: number;
  title: string;
  priority: string;
  estimatedMinutes: number;
  hasDueDate: boolean;
  isOverdue: boolean;
  isBlockingOthers: boolean;
}

export interface CompactPrioritizationSnapshot {
  userRequest: string;
  activeGoalCount: number;
  activeProjectCount: number;
  activeTasks: CompactPrioritizationSnapshotTask[];
  recommendedStrategyName: string;
}

export interface PrioritizationEnhancement {
  refinedRationale?: string;
  executiveInsight?: string;
  additionalRisks?: string[];
  suggestedConfidenceAdjustment?: number;
  highlightedItemIndexes?: number[];
  suggestedAlternativeStrategyId?: PrioritizationStrategyId;
}

export class PrioritizationReasoningService {
  private router: GeminiModelRouter;
  private readonly timeoutMs: number = 3000;

  constructor(customRouter?: GeminiModelRouter) {
    this.router = customRouter || geminiModelRouter;
  }

  /**
   * Constructs a strictly sanitized, bounded compact snapshot for Gemini reasoning.
   * Zero internal database IDs (task IDs, goal IDs, project IDs, calendar IDs, user IDs),
   * zero tokens, zero cookies, zero secrets. Uses anonymous positional indices only.
   */
  public buildSanitizedSnapshot(
    deterministicOutput: PrioritizerOutput,
    userRequest: string
  ): CompactPrioritizationSnapshot {
    return {
      userRequest: (userRequest || '').slice(0, 300),
      activeGoalCount: deterministicOutput.workloadSummary.activeGoals,
      activeProjectCount: deterministicOutput.workloadSummary.activeProjects,
      activeTasks: deterministicOutput.prioritizedItems.slice(0, 10).map((p, idx) => ({
        index: idx,
        title: p.title.slice(0, 100),
        priority: p.importanceScore > 0.7 ? 'high' : p.importanceScore > 0.4 ? 'medium' : 'low',
        estimatedMinutes: Math.round(p.effortScore * 60) || 30,
        hasDueDate: p.urgencyScore > 0.2,
        isOverdue: p.urgencyScore === 1.0,
        isBlockingOthers: p.blockingImpactScore > 0.0,
      })),
      recommendedStrategyName: deterministicOutput.recommendedStrategy.name,
    };
  }

  /**
   * Enhances deterministic prioritization using Gemini reasoning if available.
   * Guaranteed to settle within timeoutMs and never throw.
   */
  public async enhancePrioritization(
    deterministicOutput: PrioritizerOutput,
    userRequest: string
  ): Promise<{ output: PrioritizerOutput; enhanced: boolean }> {
    if (!process.env.GEMINI_API_KEY) {
      return { output: deterministicOutput, enhanced: false };
    }

    try {
      const snapshot = this.buildSanitizedSnapshot(deterministicOutput, userRequest);

      const systemPrompt = `You are the executive chief-of-staff reasoning engine for Sentinel Nova.
Review the following deterministic prioritization snapshot and output a strict JSON object with executive critique:
{
  "refinedRationale": "Concise 1-2 sentence executive summary of what to pay attention to first and why.",
  "executiveInsight": "One actionable insight regarding workload focus.",
  "additionalRisks": ["Risk 1", "Risk 2"],
  "suggestedConfidenceAdjustment": 0.0,
  "highlightedItemIndexes": [0]
}
Rules:
- JSON only. No markdown formatting.
- No chain-of-thought or reasoning steps.
- Only reference tasks by their anonymous 0-based integer index from the snapshot. Never invent or output database IDs.
- Keep text concise, professional, and directly actionable.`;

      const invocation = (async (): Promise<PrioritizationEnhancement | null> => {
        const response = await this.router.generateContent(
          {
            contents: `${systemPrompt}\n\nSnapshot:\n${JSON.stringify(snapshot)}`,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          },
          { timeoutMs: this.timeoutMs }
        );

        if (!response?.ok || !response?.text) return null;
        const cleaned = response.text.trim().replace(/^```json/i, '').replace(/```$/i, '').trim();
        return JSON.parse(cleaned) as PrioritizationEnhancement;
      })();

      // Enforce 3000ms bounded timeout with timer cleanup
      let timerId: any;
      const timeoutPromise = new Promise<null>((resolve) => {
        timerId = setTimeout(() => resolve(null), this.timeoutMs);
      });

      const enhancement = await Promise.race<PrioritizationEnhancement | null>([
        invocation,
        timeoutPromise,
      ]);

      if (timerId) {
        clearTimeout(timerId);
      }

      if (!enhancement) {
        return { output: deterministicOutput, enhanced: false };
      }

      // Treat Gemini output as untrusted: validate, sanitize, and clamp
      const mergedOutput: PrioritizerOutput = {
        ...deterministicOutput,
        reasoningSource: 'gemini_enhanced',
      };

      if (enhancement.refinedRationale && typeof enhancement.refinedRationale === 'string') {
        mergedOutput.rationale = `${enhancement.refinedRationale.trim()} [Strategy: ${deterministicOutput.recommendedStrategy.name}]`;
      }

      if (Array.isArray(enhancement.additionalRisks)) {
        const safeRisks = enhancement.additionalRisks
          .filter((r) => typeof r === 'string' && r.length < 200)
          .slice(0, 3);
        if (safeRisks.length > 0) {
          mergedOutput.risks = [...deterministicOutput.risks, ...safeRisks];
        }
      }

      const confAdjustment = enhancement.suggestedConfidenceAdjustment;
      if (typeof confAdjustment === 'number' && !isNaN(confAdjustment)) {
        const adjusted = deterministicOutput.confidence + confAdjustment;
        mergedOutput.confidence = Math.min(1.0, Math.max(0.1, Number(adjusted.toFixed(2))));
      }

      // Validate anonymous positional index mapping: index -> local snapshot item -> trusted taskId
      if (Array.isArray(enhancement.highlightedItemIndexes)) {
        const validIndices = enhancement.highlightedItemIndexes.filter(
          (idx) =>
            typeof idx === 'number' &&
            Number.isInteger(idx) &&
            idx >= 0 &&
            idx < snapshot.activeTasks.length
        );

        // Map strictly server-side: Gemini never provided the taskId
        const mappedTaskIds = validIndices
          .map((idx) => deterministicOutput.prioritizedItems[idx]?.taskId)
          .filter((id): id is string => typeof id === 'string');

        if (mappedTaskIds.length > 0) {
          mergedOutput.metadata = {
            ...(mergedOutput.metadata || {}),
            highlightedTaskIds: mappedTaskIds,
          };
        }
      }

      return { output: mergedOutput, enhanced: true };
    } catch (err: any) {
      console.warn('PrioritizationReasoningService: Enhancement failed, falling back to deterministic:', err?.message || err);
      return {
        output: { ...deterministicOutput, reasoningSource: 'deterministic_fallback' },
        enhanced: false,
      };
    }
  }
}

export const prioritizationReasoningService = new PrioritizationReasoningService();
