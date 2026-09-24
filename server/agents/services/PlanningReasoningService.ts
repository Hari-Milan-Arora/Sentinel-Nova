/**
 * Planning Reasoning Service for Sentinel Nova (Day 5B.1)
 *
 * Provides optional LLM enhancement via Gemini for the Planner Agent.
 *
 * Security & Reliability Boundaries:
 * - Deterministic fallback if Gemini is missing, times out, or errors
 * - Sanitized compact planning snapshot (zero tokens, cookies, secrets, or raw context)
 * - Strict 3000ms timeout via Promise.race
 * - Untrusted output validation: rejects unknown task IDs, clamps confidence [0.0, 1.0]
 * - Never persists prompts or chain-of-thought
 * - NEVER executes actions
 */

import { PlannerOutput } from '../agents/plannerTypes';
import { geminiModelRouter, GeminiModelRouter } from './GeminiModelRouter';

export interface CompactPlanningSnapshotTask {
  index: number;
  title: string;
  priority: string;
  estimatedMinutes: number;
  hasDueDate: boolean;
}

export interface CompactPlanningSnapshot {
  userRequest: string;
  activeGoalCount: number;
  activeProjectCount: number;
  activeTasks: CompactPlanningSnapshotTask[];
  candidateStrategyNames: string[];
  recommendedStrategyName: string;
}

export interface ReasoningEnhancement {
  refinedRationale?: string;
  strategicInsight?: string;
  additionalRisks?: string[];
  suggestedConfidenceAdjustment?: number;
  highlightedItemIndexes?: number[];
}

export class PlanningReasoningService {
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
    deterministicPlan: PlannerOutput,
    userRequest: string
  ): CompactPlanningSnapshot {
    return {
      userRequest: (userRequest || '').slice(0, 300),
      activeGoalCount: deterministicPlan.objectiveSummary.activeGoals,
      activeProjectCount: deterministicPlan.objectiveSummary.activeProjects,
      activeTasks: deterministicPlan.prioritizedItems.slice(0, 10).map((p, idx) => ({
        index: idx,
        title: p.title.slice(0, 100),
        priority: p.priorityScore > 0.7 ? 'high' : p.priorityScore > 0.4 ? 'medium' : 'low',
        estimatedMinutes: p.effortScore ? Math.round(p.effortScore * 120) : 30,
        hasDueDate: p.deadlineScore > 0.2,
      })),
      candidateStrategyNames: deterministicPlan.strategyCandidates.map((c) => c.name),
      recommendedStrategyName: deterministicPlan.recommendedStrategy.name,
    };
  }

  /**
   * Enhances a deterministic plan using Gemini reasoning if available.
   * Guaranteed to settle within timeoutMs and never throw.
   */
  public async enhancePlan(
    deterministicPlan: PlannerOutput,
    userRequest: string
  ): Promise<{ plan: PlannerOutput; enhanced: boolean }> {
    if (!process.env.GEMINI_API_KEY) {
      return { plan: deterministicPlan, enhanced: false };
    }

    try {
      // Build strictly sanitized, bounded compact snapshot (max 10 active tasks, anonymous indexes only)
      const snapshot = this.buildSanitizedSnapshot(deterministicPlan, userRequest);

      const systemPrompt = `You are the executive reasoning engine for Sentinel Nova Chief of Staff.
Review the following deterministic planning snapshot and output a strict JSON object with strategic critique:
{
  "refinedRationale": "Concise 1-2 sentence executive summary explaining why ${snapshot.recommendedStrategyName} fits the user's workload.",
  "strategicInsight": "One actionable strategic recommendation for execution.",
  "additionalRisks": ["Risk 1", "Risk 2"],
  "suggestedConfidenceAdjustment": 0.0,
  "highlightedItemIndexes": [0]
}
Rules:
- JSON only. No markdown formatting.
- No chain-of-thought or reasoning steps.
- Only reference tasks by their anonymous 0-based integer index from the snapshot. Never use, invent, or output database IDs.
- Keep text concise, professional, and directly actionable.`;

      const invocation = (async (): Promise<ReasoningEnhancement | null> => {
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
        return JSON.parse(cleaned) as ReasoningEnhancement;
      })();

      // Enforce 3000ms bounded timeout with timer cleanup
      let timerId: any;
      const timeoutPromise = new Promise<null>((resolve) => {
        timerId = setTimeout(() => resolve(null), this.timeoutMs);
      });

      const enhancement = await Promise.race<ReasoningEnhancement | null>([
        invocation,
        timeoutPromise,
      ]);

      if (timerId) {
        clearTimeout(timerId);
      }

      if (!enhancement) {
        return { plan: deterministicPlan, enhanced: false };
      }

      // Treat Gemini output as untrusted: validate, sanitize, and clamp
      const mergedPlan: PlannerOutput = {
        ...deterministicPlan,
        reasoningSource: 'gemini_enhanced',
      };

      if (enhancement.refinedRationale && typeof enhancement.refinedRationale === 'string') {
        mergedPlan.rationale = `${enhancement.refinedRationale.trim()} [Strategy: ${deterministicPlan.recommendedStrategy.name}]`;
      }

      if (Array.isArray(enhancement.additionalRisks)) {
        const safeRisks = enhancement.additionalRisks
          .filter((r) => typeof r === 'string' && r.length < 200)
          .slice(0, 3);
        if (safeRisks.length > 0) {
          mergedPlan.risks = [...deterministicPlan.risks, ...safeRisks];
        }
      }

      const confAdjustment = enhancement.suggestedConfidenceAdjustment;
      if (typeof confAdjustment === 'number' && !isNaN(confAdjustment)) {
        const adjusted = deterministicPlan.confidence + confAdjustment;
        mergedPlan.confidence = Math.min(1.0, Math.max(0.1, Number(adjusted.toFixed(2))));
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
          .map((idx) => deterministicPlan.prioritizedItems[idx]?.taskId)
          .filter((id): id is string => typeof id === 'string');

        if (mappedTaskIds.length > 0) {
          mergedPlan.metadata = {
            ...(mergedPlan.metadata || {}),
            highlightedTaskIds: mappedTaskIds,
          };
        }
      }

      return { plan: mergedPlan, enhanced: true };
    } catch (err) {
      console.warn('PlanningReasoningService: Enhancement failed, falling back to deterministic plan:', err);
      return {
        plan: { ...deterministicPlan, reasoningSource: 'deterministic_fallback' },
        enhanced: false,
      };
    }
  }
}

export const planningReasoningService = new PlanningReasoningService();
