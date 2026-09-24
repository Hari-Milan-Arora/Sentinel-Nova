/**
 * Memory Reasoning Service for Sentinel Nova (Day 5B.3)
 *
 * Provides optional Gemini-powered contextual classification, relevance ranking,
 * and memory synthesis.
 *
 * UNTRUSTED BOUNDARY MANDATE:
 * - Gemini NEVER writes directly to memoryStore or databases.
 * - Gemini NEVER receives database IDs, user IDs, auth tokens, session secrets, or raw traces.
 * - Memories are passed strictly as anonymous 0-based integer indices (index 0, 1, 2...).
 * - Server validates all model output and maps integer indices back to real IDs server-side.
 * - Enforces strict 3000ms timeout with clearTimeout and deterministic fallback.
 */

import {
  MemoryType,
  MemoryImportance,
  ScoredMemoryItem,
  MemoryProposal,
} from '../agents/memoryTypes';
import { maskRestrictedContent } from '../../memorySafety';
import { geminiModelRouter, GeminiModelRouter } from './GeminiModelRouter';

export interface MemoryReasoningSnapshot {
  userRequest: string; // Truncated to 300 chars
  operationIntent: string;
  candidateMemories: {
    index: number;
    type: string;
    content: string; // Truncated to 200 chars
    importance: string;
    confidence: number;
    isExplicit: boolean;
  }[];
}

export interface MemoryReasoningResult {
  summary: string;
  decisionExplanation: string;
  confidence: number;
  relevantIndices: number[];
  suggestedImportance?: MemoryImportance;
  suggestedType?: MemoryType;
  reasoningSource: 'gemini_enhanced' | 'deterministic_fallback';
}

export class MemoryReasoningService {
  private router: GeminiModelRouter;
  private readonly timeoutMs = 3000;

  constructor(customRouter?: GeminiModelRouter) {
    this.router = customRouter || geminiModelRouter;
  }

  /**
   * Builds an anonymous, sanitized snapshot with ZERO database IDs,
   * ZERO user IDs, ZERO secrets, and ZERO tokens.
   */
  public buildSanitizedSnapshot(
    userRequest: string,
    operationIntent: string,
    candidates: ScoredMemoryItem[]
  ): MemoryReasoningSnapshot {
    return {
      userRequest: maskRestrictedContent(userRequest).slice(0, 300),
      operationIntent,
      candidateMemories: candidates.slice(0, 10).map((m, idx) => ({
        index: idx,
        type: m.type,
        content: maskRestrictedContent(m.content).slice(0, 200),
        importance: m.importance,
        confidence: m.confidence,
        isExplicit: m.source === 'user_confirmed' || m.source === 'user_explicit',
      })),
    };
  }

  /**
   * Enhances memory decision-making using Gemini with guaranteed deterministic fallback.
   */
  public async reasonAboutMemory(
    userRequest: string,
    operationIntent: string,
    candidates: ScoredMemoryItem[],
    proposals: MemoryProposal[]
  ): Promise<MemoryReasoningResult> {
    const fallbackResult: MemoryReasoningResult = {
      summary: this.buildDeterministicSummary(operationIntent, candidates, proposals),
      decisionExplanation: this.buildDeterministicExplanation(operationIntent, candidates, proposals),
      confidence: 0.85,
      relevantIndices: candidates.map((_, i) => i),
      reasoningSource: 'deterministic_fallback',
    };

    if (!process.env.GEMINI_API_KEY) {
      return fallbackResult;
    }

    const snapshot = this.buildSanitizedSnapshot(userRequest, operationIntent, candidates);

    try {
      const prompt = `You are Sentinel Nova's Chief of Staff memory reasoning engine.
Analyze this memory context and return ONLY a valid JSON object matching the requested schema.

Context Snapshot:
${JSON.stringify(snapshot, null, 2)}

Requirements:
1. "summary": A concise, executive 1-2 sentence response summarizing what Nova recalled or decided.
2. "decisionExplanation": A clear explanation of why this was remembered, retrieved, or ignored (referencing user preferences without mentioning internal models or calculations).
3. "confidence": A number from 0.1 to 1.0 indicating confidence.
4. "relevantIndices": An array of integer indices from candidateMemories that are truly relevant (e.g. [0, 1]).

Return JSON only:
{
  "summary": "string",
  "decisionExplanation": "string",
  "confidence": number,
  "relevantIndices": [0]
}`;

      let timeoutHandle: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('Gemini Memory Reasoning Timeout (3000ms exceeded)'));
        }, this.timeoutMs);
      });

      const apiCallPromise = (async () => {
        const response = await this.router.generateContent(
          {
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          },
          { timeoutMs: this.timeoutMs }
        );
        return (response?.ok && response?.text) ? response.text.trim() : '';
      })();

      const text = await Promise.race([apiCallPromise, timeoutPromise]).finally(() => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      });

      if (!text) return fallbackResult;

      const parsed = JSON.parse(text);

      // Validate output
      const summary =
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : fallbackResult.summary;

      const decisionExplanation =
        typeof parsed.decisionExplanation === 'string' && parsed.decisionExplanation.trim()
          ? parsed.decisionExplanation.trim()
          : fallbackResult.decisionExplanation;

      const confidence =
        typeof parsed.confidence === 'number' && !isNaN(parsed.confidence)
          ? Math.min(1.0, Math.max(0.1, parsed.confidence))
          : 0.85;

      // Validate and clamp indices
      let relevantIndices: number[] = [];
      if (Array.isArray(parsed.relevantIndices)) {
        relevantIndices = parsed.relevantIndices.filter(
          (idx: unknown) =>
            typeof idx === 'number' &&
            Number.isInteger(idx) &&
            idx >= 0 &&
            idx < snapshot.candidateMemories.length
        );
      }
      if (relevantIndices.length === 0 && snapshot.candidateMemories.length > 0) {
        relevantIndices = [0];
      }

      return {
        summary,
        decisionExplanation,
        confidence: Number(confidence.toFixed(2)),
        relevantIndices,
        reasoningSource: 'gemini_enhanced',
      };
    } catch {
      // Graceful deterministic fallback on any error, 429 quota limit, or timeout
      return fallbackResult;
    }
  }

  private buildDeterministicSummary(
    intent: string,
    candidates: ScoredMemoryItem[],
    proposals: MemoryProposal[]
  ): string {
    if (intent === 'retrieve') {
      if (candidates.length === 0) {
        return 'No saved preferences or historical context matched your query.';
      }
      const top = candidates[0];
      return `Recalled ${candidates.length} relevant item${candidates.length === 1 ? '' : 's'}, centered on: "${top.content}".`;
    }

    if (intent === 'remember') {
      const createProposal = proposals.find(p => p.operation === 'create');
      if (createProposal) {
        return `Prepared proposal to remember: "${createProposal.content}".`;
      }
      return 'Evaluated memory request and checked against existing working context.';
    }

    if (intent === 'forget') {
      const delProposal = proposals.find(p => p.operation === 'delete' || p.operation === 'archive');
      if (delProposal) {
        return `Prepared proposal to archive/remove memory item.`;
      }
      return 'Evaluated request to remove memory record.';
    }

    return 'Processed memory context according to user working style.';
  }

  private buildDeterministicExplanation(
    intent: string,
    candidates: ScoredMemoryItem[],
    proposals: MemoryProposal[]
  ): string {
    if (intent === 'retrieve') {
      if (candidates.length === 0) {
        return 'Queried active memory store for matching records; no active entries found.';
      }
      const top = candidates[0];
      return `Using saved context (${top.source === 'user_confirmed' ? 'user-confirmed' : 'explicit'}) to align recommendations with your preferences.`;
    }

    const ignored = proposals.find(p => p.operation === 'ignore');
    if (ignored) {
      return ignored.rationale;
    }

    return 'Applying deterministic memory authority and freshness scoring to maintain high-trust context.';
  }
}

export const memoryReasoningService = new MemoryReasoningService();
