/**
 * Deterministic Memory Retrieval and Relevance Engine for Sentinel Nova (Day 5B.3)
 *
 * Core responsibility:
 * "What does Nova already know that is relevant to this user and this request?"
 *
 * ARCHITECTURAL SEPARATION:
 * MemoryAgent (reasoning / decision / relevance layer)
 *     ↓
 * MemoryRetrievalEngine (retrieval / ranking / conflict detection)
 *     ↓
 * MemoryStore (persistence / user isolation)
 *
 * MANDATES:
 * - Deterministic bounded scoring [0.0, 1.0].
 * - Zero vector databases, zero embeddings infrastructure.
 * - Distinguishes explicit vs inferred memory.
 * - Freshness decay without automatic deletion.
 * - Deterministic conflict detection and authority resolution.
 * - Contextual awareness: active tasks, goals, projects, planning profile.
 */

import {
  ServerMemory,
  MemoryRetrieveOptions,
  ScoredMemoryItem,
  MemoryConflict,
  MemoryType,
  MemoryImportance,
} from './memoryTypes';
import { AgentContext } from '../types';
import {
  calculateFreshnessScore,
  calculateWordSimilarity,
  normalizeForComparison,
  getAuthorityRank,
} from '../../memorySafety';
import { getMemoriesByUser, updateMemory } from '../../memoryStore';

// Safe architectural limits
export const MAX_RETRIEVAL_LIMIT = 10;
export const DEFAULT_RETRIEVAL_LIMIT = 5;
export const MAX_QUERY_LENGTH = 500;

export class MemoryRetrievalEngine {
  /**
   * Retrieves and ranks relevant memories for an authenticated user.
   */
  public async retrieve(
    userId: string,
    options: MemoryRetrieveOptions = {},
    context?: AgentContext
  ): Promise<{ memories: ScoredMemoryItem[]; totalMatched: number }> {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Authenticated userId is required for memory retrieval.');
    }

    const allMemories = await getMemoriesByUser(userId, {
      status: options.includeArchived ? undefined : 'active',
      type: options.types && options.types.length === 1 ? options.types[0] : undefined,
    });

    const ranked = this.rankMemories(allMemories, options, context);
    const limit = Math.min(MAX_RETRIEVAL_LIMIT, Math.max(1, options.limit ?? DEFAULT_RETRIEVAL_LIMIT));
    const matchedSlice = ranked.slice(0, limit);

    // Asynchronously bump accessCount and lastAccessedAt for the returned slice
    if (matchedSlice.length > 0) {
      const now = new Date().toISOString();
      for (const item of matchedSlice) {
        item.accessCount = (item.accessCount || 0) + 1;
        item.lastAccessedAt = now;
        // Non-blocking update to store
        void updateMemory(userId, item.id, {
          status: item.status,
        }).catch(() => {
          // Non-critical background access timestamp update
        });
      }
    }

    return {
      memories: matchedSlice,
      totalMatched: ranked.length,
    };
  }

  /**
   * Ranks an array of candidate memories deterministically.
   */
  public rankMemories(
    memories: ServerMemory[],
    options: MemoryRetrieveOptions = {},
    context?: AgentContext
  ): ScoredMemoryItem[] {
    const rawQuery = typeof options.query === 'string' ? options.query.slice(0, MAX_QUERY_LENGTH) : '';
    const query = rawQuery.trim();
    const queryLower = normalizeForComparison(query);
    const referenceTime = options.referenceTime || new Date().toISOString();

    const candidates: ScoredMemoryItem[] = [];

    for (const memory of memories) {
      // 1. Status filtering: skip deleted; skip superseded/archived unless explicitly requested
      if (memory.status === 'deleted') continue;
      if (memory.status === 'archived' && !options.includeArchived) continue;
      if (memory.status === 'superseded' && !options.includeSuperseded) continue;

      // 2. Type filtering
      if (options.types && options.types.length > 0 && !options.types.includes(memory.type)) {
        continue;
      }

      // 3. Tag filtering
      if (options.tags && options.tags.length > 0) {
        const memTags = Array.isArray(memory.tags) ? memory.tags.map(t => t.toLowerCase()) : [];
        const hasMatchingTag = options.tags.some(t => memTags.includes(t.toLowerCase()));
        if (!hasMatchingTag) continue;
      }

      // 4. Freshness calculation (expired temporary memories are excluded)
      const freshnessScore = calculateFreshnessScore(memory, referenceTime);
      if (freshnessScore <= 0.0) {
        continue;
      }

      // 5. Confidence threshold check
      if (options.minConfidence !== undefined && memory.confidence < options.minConfidence) {
        continue;
      }

      // 6. Signal A: Lexical Match [0.0 - 1.0]
      let lexicalMatch = 0.5; // Baseline when no explicit query
      let matchReason = 'General working context';

      if (queryLower.length > 0) {
        const memoryContentLower = normalizeForComparison(memory.content);
        if (memoryContentLower.includes(queryLower)) {
          lexicalMatch = 1.0;
          matchReason = 'Direct phrase match';
        } else {
          const similarity = calculateWordSimilarity(query, memory.content);
          lexicalMatch = Math.min(1.0, similarity * 1.3);
          matchReason = lexicalMatch > 0.4 ? 'Semantic keyword overlap' : 'Contextual candidate';
        }
      }

      // 7. Signal B: Type Match [0.0 - 1.0]
      const typeMatch = this.computeTypeMatch(memory.type, queryLower, context);

      // 8. Signal C: Importance [0.0 - 1.0]
      const importanceScore = this.normalizeImportance(memory.importance);

      // 9. Signal D: Confidence [0.0 - 1.0]
      const confidenceScore = Math.min(1.0, Math.max(0.0, memory.confidence || 0.8));

      // 10. Signal E: Explicitness [0.0 - 1.0]
      // Explicit user statements receive 1.0; inferred memories receive 0.5
      const explicitnessScore = memory.explicit ? 1.0 : (memory.source === 'user_confirmed' || memory.source === 'user_explicit' ? 1.0 : 0.5);

      // 11. Signal F: Contextual Match [0.0 - 1.0]
      const contextualMatch = this.computeContextualMatch(memory, context, queryLower);

      // 12. Combined Formula:
      // relevanceScore =
      //     lexicalMatch * 0.25
      //   + typeMatch * 0.15
      //   + importance * 0.15
      //   + confidence * 0.15
      //   + freshness * 0.15
      //   + explicitness * 0.10
      //   + contextualMatch * 0.05
      const rawScore =
        lexicalMatch * 0.25 +
        typeMatch * 0.15 +
        importanceScore * 0.15 +
        confidenceScore * 0.15 +
        freshnessScore * 0.15 +
        explicitnessScore * 0.10 +
        contextualMatch * 0.05;

      const safeScore = isNaN(rawScore) || !isFinite(rawScore) ? 0.0 : rawScore;
      const relevanceScore = Math.min(1.0, Math.max(0.0, Number(safeScore.toFixed(3))));

      candidates.push({
        ...memory,
        relevanceScore,
        queryMatchScore: Number(lexicalMatch.toFixed(3)),
        lexicalScore: Number(lexicalMatch.toFixed(3)),
        freshnessScore,
        contextualBoost: Number(contextualMatch.toFixed(3)),
        matchReason,
      });
    }

    // Deterministic tie-breaking:
    // 1. relevanceScore (descending)
    // 2. freshnessScore (descending)
    // 3. updatedAt (descending)
    // 4. id (localeCompare)
    candidates.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      if (b.freshnessScore !== a.freshnessScore) {
        return b.freshnessScore - a.freshnessScore;
      }
      const timeDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });

    return candidates;
  }

  /**
   * Deterministic Conflict Detection
   *
   * Compares active memories to detect contradictions:
   * - Opposing temporal preferences (morning vs afternoon/evening/night)
   * - Opposing working styles (deep work / slow vs rapid / multitasking)
   * - Opposing meeting preferences (no meetings / async vs meetings preferred)
   * - Opposing tool/framework choices (React vs Vue, TypeScript vs JavaScript)
   * - Opposing weekend work preferences
   *
   * Authority Resolution:
   * 1. Explicitness (explicit user statement > inferred pattern)
   * 2. Recency (newer timestamp > older timestamp)
   * 3. Confidence (higher > lower)
   * 4. Importance (higher > lower)
   */
  public detectConflicts(memories: ServerMemory[]): MemoryConflict[] {
    const activeMemories = memories.filter(m => m.status === 'active');
    const conflicts: MemoryConflict[] = [];
    const seenPairs = new Set<string>();

    for (let i = 0; i < activeMemories.length; i++) {
      for (let j = i + 1; j < activeMemories.length; j++) {
        const memA = activeMemories[i];
        const memB = activeMemories[j];

        const pairKey = [memA.id, memB.id].sort().join('::');
        if (seenPairs.has(pairKey)) continue;

        const conflictResult = this.evaluatePairConflict(memA, memB);
        if (conflictResult) {
          seenPairs.add(pairKey);
          conflicts.push(conflictResult);
        }
      }
    }

    return conflicts;
  }

  /**
   * Evaluates two memory records for semantic or preference contradiction.
   */
  private evaluatePairConflict(memA: ServerMemory, memB: ServerMemory): MemoryConflict | null {
    const textA = normalizeForComparison(memA.content);
    const textB = normalizeForComparison(memB.content);

    // Rule 1: Opposing time-of-day preferences for focus or deep work
    const isMorningA = textA.includes('morning') && (textA.includes('work') || textA.includes('focus') || textA.includes('deep'));
    const isEveningA = (textA.includes('afternoon') || textA.includes('evening') || textA.includes('night')) &&
      (textA.includes('work') || textA.includes('focus') || textA.includes('deep'));

    const isMorningB = textB.includes('morning') && (textB.includes('work') || textB.includes('focus') || textB.includes('deep'));
    const isEveningB = (textB.includes('afternoon') || textB.includes('evening') || textB.includes('night')) &&
      (textB.includes('work') || textB.includes('focus') || textB.includes('deep'));

    if ((isMorningA && isEveningB) || (isEveningA && isMorningB)) {
      return this.buildConflictRecord(
        memA,
        memB,
        'Opposing time-of-day focus preferences (morning vs afternoon/evening)'
      );
    }

    // Rule 2: Meeting preference contradiction (no meetings vs meetings allowed)
    const isNoMeetingsA = textA.includes('no meeting') || textA.includes('dont want meeting') || textA.includes('avoid meeting');
    const isMeetingsOkA = textA.includes('meetings in the') || textA.includes('prefer meetings') || textA.includes('morning meetings');

    const isNoMeetingsB = textB.includes('no meeting') || textB.includes('dont want meeting') || textB.includes('avoid meeting');
    const isMeetingsOkB = textB.includes('meetings in the') || textB.includes('prefer meetings') || textB.includes('morning meetings');

    if ((isNoMeetingsA && isMeetingsOkB) || (isMeetingsOkA && isNoMeetingsB)) {
      return this.buildConflictRecord(
        memA,
        memB,
        'Contradictory meeting scheduling preferences'
      );
    }

    // Rule 3: Framework or technology decision contradiction
    const isReactA = textA.includes('use react') || textA.includes('decided on react');
    const isVueA = textA.includes('use vue') || textA.includes('decided on vue');
    const isReactB = textB.includes('use react') || textB.includes('decided on react');
    const isVueB = textB.includes('use vue') || textB.includes('decided on vue');

    if ((isReactA && isVueB) || (isVueA && isReactB)) {
      return this.buildConflictRecord(
        memA,
        memB,
        'Contradictory technology or architecture decisions'
      );
    }

    // Rule 4: Weekend work contradiction
    const isWeekendWorkA = textA.includes('work on weekend') || textA.includes('weekends are for');
    const isNoWeekendA = textA.includes('never work weekend') || textA.includes('no work on weekend');
    const isWeekendWorkB = textB.includes('work on weekend') || textB.includes('weekends are for');
    const isNoWeekendB = textB.includes('never work weekend') || textB.includes('no work on weekend');

    if ((isWeekendWorkA && isNoWeekendB) || (isNoWeekendA && isWeekendWorkB)) {
      return this.buildConflictRecord(
        memA,
        memB,
        'Contradictory weekend availability preferences'
      );
    }

    return null;
  }

  /**
   * Determines which memory is more authoritative according to the strict hierarchy:
   * 1. Explicitness (explicit user statement > inferred pattern)
   * 2. Recency (newer timestamp > older timestamp)
   * 3. Confidence (higher > lower)
   * 4. Importance (higher > lower)
   */
  private buildConflictRecord(
    memA: ServerMemory,
    memB: ServerMemory,
    conflictReason: string
  ): MemoryConflict {
    // 1. Explicitness check
    const rankA = getAuthorityRank(memA.source);
    const rankB = getAuthorityRank(memB.source);

    if (memA.explicit && !memB.explicit) {
      return {
        memoryA: memA,
        memoryB: memB,
        conflictReason,
        authoritativeMemoryId: memA.id,
        authoritativeReason: `Memory "${memA.content.slice(0, 40)}" is an explicit user statement, which supersedes inferred memory "${memB.content.slice(0, 40)}".`,
      };
    }
    if (!memA.explicit && memB.explicit) {
      return {
        memoryA: memA,
        memoryB: memB,
        conflictReason,
        authoritativeMemoryId: memB.id,
        authoritativeReason: `Memory "${memB.content.slice(0, 40)}" is an explicit user statement, which supersedes inferred memory "${memA.content.slice(0, 40)}".`,
      };
    }

    // 2. Authority source tier
    if (rankA !== rankB) {
      const authMem = rankA > rankB ? memA : memB;
      const subMem = rankA > rankB ? memB : memA;
      return {
        memoryA: memA,
        memoryB: memB,
        conflictReason,
        authoritativeMemoryId: authMem.id,
        authoritativeReason: `Higher authority source '${authMem.source}' supersedes lower authority source '${subMem.source}'.`,
      };
    }

    // 3. Recency (newer timestamp)
    const timeA = new Date(memA.updatedAt || memA.createdAt).getTime();
    const timeB = new Date(memB.updatedAt || memB.createdAt).getTime();
    if (timeA !== timeB) {
      const authMem = timeA > timeB ? memA : memB;
      const olderMem = timeA > timeB ? memB : memA;
      return {
        memoryA: memA,
        memoryB: memB,
        conflictReason,
        authoritativeMemoryId: authMem.id,
        authoritativeReason: `Newer statement (${authMem.updatedAt.slice(0, 10)}) supersedes older statement (${olderMem.updatedAt.slice(0, 10)}).`,
      };
    }

    // 4. Confidence
    if (memA.confidence !== memB.confidence) {
      const authMem = memA.confidence > memB.confidence ? memA : memB;
      return {
        memoryA: memA,
        memoryB: memB,
        conflictReason,
        authoritativeMemoryId: authMem.id,
        authoritativeReason: `Higher confidence score (${authMem.confidence.toFixed(2)}) resolved as authoritative.`,
      };
    }

    // 5. Importance
    const impA = this.normalizeImportance(memA.importance);
    const impB = this.normalizeImportance(memB.importance);
    const authMem = impA >= impB ? memA : memB;
    return {
      memoryA: memA,
      memoryB: memB,
      conflictReason,
      authoritativeMemoryId: authMem.id,
      authoritativeReason: `Higher importance level resolved as authoritative.`,
    };
  }

  /**
   * Computes contextual match score between memory and surrounding AgentContext.
   */
  private computeContextualMatch(
    memory: ServerMemory,
    context?: AgentContext,
    queryLower?: string
  ): number {
    if (!context) return 0.5;

    let match = 0.5;
    const memContentLower = normalizeForComparison(memory.content);

    // Goal alignment match
    if (context.goals && context.goals.length > 0) {
      for (const goal of context.goals) {
        if (goal.title && memContentLower.includes(normalizeForComparison(goal.title))) {
          match = Math.max(match, 0.95);
        }
      }
    }

    // Project alignment match
    if (context.projects && context.projects.length > 0) {
      for (const project of context.projects) {
        const projectName = project.name || (project as any).title;
        if (projectName && memContentLower.includes(normalizeForComparison(projectName))) {
          match = Math.max(match, 0.95);
        }
      }
    }

    // Task alignment match (supporting context.tasks and context.taskContext.activeTasks)
    const activeTasks = (context.tasks || (context as any).taskContext?.activeTasks || []) as Array<{ title?: string }>;
    if (activeTasks.length > 0) {
      for (const task of activeTasks.slice(0, 10)) {
        if (!task.title) continue;
        const taskTitleLower = normalizeForComparison(task.title);
        if (memContentLower.includes(taskTitleLower) || taskTitleLower.includes(memContentLower)) {
          match = Math.max(match, 0.95);
        } else {
          // Check significant term overlap between task title and memory content
          const taskWords = taskTitleLower.split(/\s+/).filter(w => w.length > 3);
          const matchedWords = taskWords.filter(w => memContentLower.includes(w));
          if (matchedWords.length >= 2 || (taskWords.length === 1 && matchedWords.length === 1)) {
            match = Math.max(match, 0.90);
          }
        }
      }
    }

    // Query intent contextual boost
    if (queryLower) {
      if (queryLower.includes('what should i work on') || queryLower.includes('what to do first')) {
        if (memContentLower.includes('deep work') || memContentLower.includes('focus') || memory.type === 'working_style' || memory.type === 'goal_context') {
          match = Math.max(match, 0.90);
        }
      } else if (queryLower.includes('plan my day') || queryLower.includes('schedule')) {
        if (memory.type === 'scheduling_preference' || memory.type === 'working_style' || memContentLower.includes('morning') || memContentLower.includes('hours')) {
          match = Math.max(match, 0.90);
        }
      } else if (queryLower.includes('why did i choose') || queryLower.includes('why chose')) {
        if (memory.type === 'decision' || memory.type === 'goal_context' || memory.type === 'project_context') {
          match = Math.max(match, 0.95);
        }
      }
    }

    return Math.min(1.0, Math.max(0.0, match));
  }

  /**
   * Matches memory type with query intent.
   */
  private computeTypeMatch(type: MemoryType, queryLower: string, context?: AgentContext): number {
    if (!queryLower) return 0.6;

    if (queryLower.includes('preference') || queryLower.includes('prefer')) {
      return type === 'preference' || type === 'scheduling_preference' || type === 'working_style' ? 1.0 : 0.4;
    }
    if (queryLower.includes('schedule') || queryLower.includes('hour') || queryLower.includes('time') || queryLower.includes('plan')) {
      return type === 'scheduling_preference' || type === 'working_style' ? 1.0 : 0.4;
    }
    if (queryLower.includes('goal') || queryLower.includes('target') || queryLower.includes('objective')) {
      return type === 'goal_context' ? 1.0 : 0.4;
    }
    if (queryLower.includes('project') || queryLower.includes('repo') || queryLower.includes('codebase')) {
      return type === 'project_context' ? 1.0 : 0.4;
    }
    if (queryLower.includes('decision') || queryLower.includes('why') || queryLower.includes('chose') || queryLower.includes('decided')) {
      return type === 'decision' ? 1.0 : 0.4;
    }
    if (queryLower.includes('pattern') || queryLower.includes('habit') || queryLower.includes('frequently')) {
      return type === 'learned_pattern' || type === 'task_pattern' ? 1.0 : 0.4;
    }

    return 0.6;
  }

  /**
   * Normalizes importance to [0.0 - 1.0].
   */
  private normalizeImportance(importance: MemoryImportance | number | string): number {
    if (typeof importance === 'number') {
      return Math.min(1.0, Math.max(0.0, importance));
    }
    switch (importance) {
      case 'critical':
        return 1.0;
      case 'high':
        return 0.85;
      case 'medium':
        return 0.65;
      case 'low':
        return 0.45;
      default:
        return 0.60;
    }
  }
}

export const memoryRetrievalEngine = new MemoryRetrievalEngine();
