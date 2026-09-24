/**
 * Scheduling Reasoning Service for Sentinel Nova (Day 5B.4)
 *
 * Provides optional LLM reasoning assistance via the shared GeminiModelRouter.
 *
 * Safety, Privacy, & Feasibility Mandates:
 * - Deterministic fallback if Gemini is missing, times out, throws, or router is exhausted.
 * - Gemini NEVER determines hard-constraint feasibility or invents scheduling windows.
 * - Gemini only selects/ranks among deterministic feasible candidates supplied to it.
 * - Strictly sanitized anonymous snapshot: ZERO database IDs (task, goal, project, calendar, user),
 *   zero tokens, cookies, secrets, or raw sensitive memories.
 * - Anonymous 1-based positional indexing only.
 * - Bounded snapshot text and candidate counts (max 5 candidates).
 * - Strict bounded timeout (3000ms) with Promise.race and timer cleanup.
 * - Untrusted response validation: verifies index bounds [1, candidates.length], clamps confidence,
 *   falls back to deterministic candidate if invalid.
 */

import { geminiModelRouter, GeminiModelRouter } from './GeminiModelRouter';
import {
  SchedulingStrategy,
  CandidateScheduleWindow,
} from '../agents/schedulerTypes';
import { Task } from '../../../src/types';

export interface AnonymousCandidateSnapshot {
  index: number; // 1-based index
  start: string;
  end: string;
  durationMinutes: number;
  fit: string;
  score: number;
  inFocusPeriod: boolean;
  reasons: string[];
}

export interface AnonymousSchedulingSnapshot {
  userRequest: string;
  strategy: SchedulingStrategy;
  task: {
    title: string;
    durationMinutes: number;
    priority: string;
    hasDueDate: boolean;
  };
  candidates: AnonymousCandidateSnapshot[];
}

export interface SchedulingEnhancementResponse {
  chosenCandidateIndex?: number; // 1-based index matching one of the provided candidates
  refinedRationale?: string;
  tradeoffInsight?: string;
  confidenceAdjustment?: number;
}

export interface SchedulingEnhancementResult {
  enhanced: boolean;
  chosenCandidate: CandidateScheduleWindow;
  rationale: string;
  tradeoffs: string[];
  confidenceScore: number;
}

export class SchedulingReasoningService {
  private router: GeminiModelRouter;
  private readonly timeoutMs: number = 3000;

  constructor(customRouter?: GeminiModelRouter) {
    this.router = customRouter || geminiModelRouter;
  }

  /**
   * Constructs a strictly sanitized, anonymous snapshot for Gemini reasoning.
   * Zero internal database IDs, zero tokens, zero cookies, zero secrets.
   * Uses 1-based anonymous positional indices only.
   */
  public buildSanitizedSnapshot(
    task: Task,
    candidates: CandidateScheduleWindow[],
    strategy: SchedulingStrategy,
    userRequest?: string
  ): AnonymousSchedulingSnapshot {
    return {
      userRequest: (userRequest || '').slice(0, 300),
      strategy,
      task: {
        title: (task.title || 'Untitled task').slice(0, 100),
        durationMinutes: task.estimatedMinutes || 30,
        priority: task.priority || 'medium',
        hasDueDate: Boolean(task.dueDate),
      },
      candidates: candidates.slice(0, 5).map((cand, idx) => ({
        index: idx + 1,
        start: cand.window.startFormatted || cand.suggestedStart.slice(11, 16),
        end: cand.window.endFormatted || cand.suggestedEnd.slice(11, 16),
        durationMinutes: cand.taskDuration,
        fit: cand.fit,
        score: cand.score,
        inFocusPeriod: Boolean(cand.window.inPreferredFocusPeriod),
        reasons: (cand.reasons || []).slice(0, 3).map((r) => r.slice(0, 100)),
      })),
    };
  }

  /**
   * Enhances deterministic scheduling evaluation using Gemini reasoning if available.
   * Guaranteed to settle within timeoutMs and never throw.
   * ALWAYS falls back to the deterministic bestWindow if anything fails.
   */
  public async enhanceScheduling(
    task: Task,
    candidates: CandidateScheduleWindow[],
    deterministicBest: CandidateScheduleWindow,
    strategy: SchedulingStrategy,
    userRequest?: string
  ): Promise<SchedulingEnhancementResult> {
    const fallbackResult: SchedulingEnhancementResult = {
      enhanced: false,
      chosenCandidate: deterministicBest,
      rationale:
        deterministicBest.reasons.length > 0
          ? deterministicBest.reasons.join(' ')
          : `Deterministic scheduling selected window ${deterministicBest.window.startFormatted} - ${deterministicBest.window.endFormatted}.`,
      tradeoffs: deterministicBest.conflictsDetected || [],
      confidenceScore: deterministicBest.score,
    };

    if (!process.env.GEMINI_API_KEY || !candidates || candidates.length === 0) {
      return fallbackResult;
    }

    try {
      const snapshot = this.buildSanitizedSnapshot(task, candidates, strategy, userRequest);

      const systemPrompt = `You are the executive scheduling advisor for Sentinel Nova.
Review the following deterministic candidate scheduling windows (all guaranteed feasible) for a task under the '${strategy}' strategy.
Select the single best candidate by index and provide a concise rationale.

Output a strict JSON object:
{
  "chosenCandidateIndex": 1,
  "refinedRationale": "Concise 1-2 sentence executive explanation for why this slot is optimal.",
  "tradeoffInsight": "One concise sentence on any tradeoff or alternative.",
  "confidenceAdjustment": 0.0
}

Rules:
- JSON only. No markdown formatting, code blocks, or conversational filler.
- "chosenCandidateIndex" MUST be an integer between 1 and ${snapshot.candidates.length}.
- NEVER invent a time window or date outside the provided candidates.
- Keep explanation clear, objective, and professional.`;

      const invocation = (async (): Promise<SchedulingEnhancementResponse | null> => {
        const response = await this.router.generateContent(
          {
            contents: `${systemPrompt}\n\nCandidate Snapshot:\n${JSON.stringify(snapshot)}`,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          },
          { timeoutMs: this.timeoutMs }
        );

        if (!response?.ok || !response?.text) return null;
        const cleaned = response.text.trim().replace(/^```json/i, '').replace(/```$/i, '').trim();
        return JSON.parse(cleaned) as SchedulingEnhancementResponse;
      })();

      // Enforce 3000ms bounded timeout with timer cleanup
      let timerId: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<null>((resolve) => {
        timerId = setTimeout(() => resolve(null), this.timeoutMs);
      });

      const enhancement = await Promise.race<SchedulingEnhancementResponse | null>([
        invocation,
        timeoutPromise,
      ]);

      if (timerId) {
        clearTimeout(timerId);
      }

      if (!enhancement) {
        return fallbackResult;
      }

      // Untrusted output validation:
      // 1. Verify chosenCandidateIndex exists and is within [1, candidates.length]
      let chosenCandidate = deterministicBest;
      if (
        typeof enhancement.chosenCandidateIndex === 'number' &&
        Number.isInteger(enhancement.chosenCandidateIndex) &&
        enhancement.chosenCandidateIndex >= 1 &&
        enhancement.chosenCandidateIndex <= candidates.length
      ) {
        chosenCandidate = candidates[enhancement.chosenCandidateIndex - 1];
      }

      // 2. Validate rationale string
      let rationale = fallbackResult.rationale;
      if (typeof enhancement.refinedRationale === 'string' && enhancement.refinedRationale.trim()) {
        rationale = enhancement.refinedRationale.trim().slice(0, 300);
      }

      // 3. Validate tradeoff insight
      const tradeoffs = [...(chosenCandidate.conflictsDetected || [])];
      if (typeof enhancement.tradeoffInsight === 'string' && enhancement.tradeoffInsight.trim()) {
        tradeoffs.push(enhancement.tradeoffInsight.trim().slice(0, 200));
      }

      // 4. Validate and clamp confidence
      let confidence = chosenCandidate.score;
      if (
        typeof enhancement.confidenceAdjustment === 'number' &&
        Number.isFinite(enhancement.confidenceAdjustment)
      ) {
        const clampedAdj = Math.max(-0.1, Math.min(0.1, enhancement.confidenceAdjustment));
        confidence = Math.max(0.0, Math.min(1.0, confidence + clampedAdj));
      }

      return {
        enhanced: true,
        chosenCandidate,
        rationale,
        tradeoffs,
        confidenceScore: Math.round(confidence * 1000) / 1000,
      };
    } catch {
      // Safe fallback on JSON parsing, network error, or unexpected behavior
      return fallbackResult;
    }
  }
}

export const schedulingReasoningService = new SchedulingReasoningService();
