/**
 * Memory Agent for Sentinel Nova Multi-Agent Runtime (Day 5B.3)
 *
 * Core responsibility:
 * "What should Nova remember, retrieve, update, or deliberately ignore about this user and their working context?"
 *
 * SAFETY MANDATES:
 * - Extends BaseAgent contract strictly.
 * - PROPOSALS ONLY: Does NOT mutate persistent memoryStore autonomously.
 * - Sourced strictly from authenticated context.userId with zero cross-user access.
 * - Rejects restricted credentials/secrets immediately.
 * - Enforces authority hierarchy (user_confirmed > user_explicit > system_derived > agent_inferred).
 * - Untrusted Gemini boundary with guaranteed deterministic fallback.
 * - Observability traces record safe metadata only.
 */

import { BaseAgent } from '../Agent';
import { AgentContext, AgentResult, AgentAction, AgentCapability } from '../types';
import {
  MemoryAgentOutput,
  MemoryProposal,
  ScoredMemoryItem,
  ScoredMemoryItemSafe,
  MemoryConflictReport,
  MemoryType,
  MemoryImportance,
  MemorySource,
} from './memoryTypes';
import {
  getMemoriesByUser,
} from '../../memoryStore';
import {
  classifySensitivity,
  detectDuplicate,
  normalizeMemoryContent,
  normalizeForComparison,
  canOverwriteAuthority,
} from '../../memorySafety';
import { memoryRetrievalEngine, MemoryRetrievalEngine } from './MemoryRetrievalEngine';
import { memoryReasoningService } from '../services/MemoryReasoningService';

export class MemoryAgent extends BaseAgent {
  public readonly id = 'agent.memory';
  public readonly name = 'Memory Agent';
  public readonly description =
    'Reasoning and proposal engine for persistent, user-isolated memory: retrieval, proposals for creation/updates, and deliberate ignoring of noise.';
  public readonly version = '1.0.0';
  public readonly timeoutMs = 8000;
  public readonly capabilities: AgentCapability[] = [
    'memory',
    'memory_retrieval',
    'memory_update',
    'memory_creation',
    'memory_deduplication',
    'memory_lifecycle',
    'context_recall',
    'preference_detection',
  ];

  private retrievalEngine: MemoryRetrievalEngine;

  constructor(engine?: MemoryRetrievalEngine) {
    super();
    this.retrievalEngine = engine || memoryRetrievalEngine;
  }

  /**
   * Evaluates if this agent should handle the incoming request.
   */
  public async canHandle(context: AgentContext): Promise<boolean> {
    if (!context || !context.userRequest) return false;

    // 1. Direct agent preference
    if (context.parameters?.preferredAgentId === this.id) {
      return true;
    }

    // 2. Explicit intent parameter
    if (context.parameters?.intent === 'memory') {
      return true;
    }

    // 3. Required capabilities
    if (
      context.allowedCapabilities &&
      context.allowedCapabilities.some(c =>
        (this.capabilities as readonly string[]).includes(c)
      )
    ) {
      return true;
    }

    // 4. Deterministic intent phrase matching
    const lower = context.userRequest.toLowerCase();
    const memoryKeywords = [
      'remember',
      'recall',
      'forget',
      'memory',
      'memories',
      'what do you remember',
      'what do you know about me',
      'my preferences',
      'my preference',
      'working style',
      'scheduling preference',
      'personal constraint',
      'delete memory',
      'archive memory',
      'clear memory',
    ];

    return memoryKeywords.some(keyword => lower.includes(keyword));
  }

  /**
   * Executes Memory Agent reasoning and proposal generation.
   */
  protected async run(context: AgentContext): Promise<AgentResult<MemoryAgentOutput>> {
    const startTime = Date.now();
    const userRequest = context.userRequest.trim();
    const lowerRequest = userRequest.toLowerCase();
    const userId = context.userId;

    // Load active user memories for reference
    const allUserMemories = await getMemoriesByUser(userId);
    const activeMemories = allUserMemories.filter(m => m.status === 'active');

    // 1. Classify Primary Intent
    let primaryIntent: 'retrieve' | 'remember' | 'forget' | 'update' | 'ignore' | 'inspect' =
      'retrieve';

    if (
      lowerRequest.startsWith('forget') ||
      lowerRequest.includes('delete memory') ||
      lowerRequest.includes('delete') ||
      lowerRequest.includes('archive memory') ||
      lowerRequest.includes('archive') ||
      lowerRequest.includes('remove preference') ||
      lowerRequest.includes('forget that')
    ) {
      primaryIntent = 'forget';
    } else if (
      lowerRequest.startsWith('remember') ||
      lowerRequest.includes('remember that') ||
      lowerRequest.includes('keep in mind') ||
      lowerRequest.includes('my preference is') ||
      lowerRequest.includes('note that')
    ) {
      primaryIntent = 'remember';
    } else if (lowerRequest.includes('update my preference') || lowerRequest.includes('change preference')) {
      primaryIntent = 'update';
    }

    const proposals: MemoryProposal[] = [];
    let retrievedMemories: ScoredMemoryItem[] = [];

    // 2. Handle Intent
    if (primaryIntent === 'remember' || primaryIntent === 'update') {
      // Extract candidate memory text
      let candidateContent = userRequest;
      const prefixes = [
        'remember that',
        'remember',
        'keep in mind that',
        'keep in mind',
        'note that',
        'my preference is that',
        'my preference is',
        'update my preference to',
        'update my preference for',
      ];

      for (const prefix of prefixes) {
        if (lowerRequest.startsWith(prefix)) {
          candidateContent = userRequest.slice(prefix.length).trim();
          break;
        }
      }

      // Check safety and sensitivity
      const safety = classifySensitivity(candidateContent);
      if (safety.isRestricted) {
        // Safety guard: Deliberately ignore restricted credentials/secrets
        proposals.push({
          operation: 'ignore',
          type: 'preference',
          content: candidateContent.slice(0, 100),
          importance: 'low',
          confidence: 1.0,
          source: 'system_derived',
          sourceReference: 'safety_guard',
          sensitivity: 'restricted',
          requiresConfirmation: false,
          rationale: safety.reason || 'Restricted credentials or secrets must never be remembered.',
        });
      } else {
        // Derive memory type
        const derivedType = this.inferMemoryType(candidateContent);
        const derivedImportance = this.inferImportance(candidateContent);

        // Check for duplicates
        const dupCheck = detectDuplicate(candidateContent, derivedType, activeMemories);
        if (dupCheck.isDuplicate && dupCheck.duplicateMemory) {
          proposals.push({
            operation: 'ignore',
            targetMemoryId: dupCheck.duplicateMemory.id,
            type: derivedType,
            content: dupCheck.duplicateMemory.content,
            importance: dupCheck.duplicateMemory.importance,
            confidence: dupCheck.duplicateMemory.confidence,
            source: dupCheck.duplicateMemory.source,
            sourceReference: 'duplicate_guard',
            sensitivity: dupCheck.duplicateMemory.sensitivity,
            requiresConfirmation: false,
            rationale: `Duplicate memory detected: this preference is already actively saved.`,
          });
        } else {
          const proposedSource: MemorySource =
            context.parameters?.source === 'agent_inferred' || context.parameters?.inferred === true
              ? 'agent_inferred'
              : 'user_explicit';

          // Check for conflicts with existing memories
          const conflict = this.findConflictingMemory(candidateContent, derivedType, activeMemories);
          if (conflict) {
            if (!canOverwriteAuthority(conflict.source, proposedSource)) {
              // Lower authority inference CANNOT overwrite higher authority user preference
              proposals.push({
                operation: 'review_required',
                targetMemoryId: conflict.id,
                type: derivedType,
                content: normalizeMemoryContent(candidateContent),
                importance: derivedImportance,
                confidence: 0.80,
                source: proposedSource,
                sourceReference: 'conflict_guard',
                sensitivity: safety.sensitivity,
                requiresConfirmation: true, // Requires explicit user confirmation
                rationale: `Authority conflict: proposed '${proposedSource}' memory cannot overwrite authoritative '${conflict.source}' memory ("${conflict.content}"). Explicit user confirmation required.`,
                conflictWithMemoryId: conflict.id,
              });
            } else {
              proposals.push({
                operation: 'update',
                targetMemoryId: conflict.id,
                type: derivedType,
                content: normalizeMemoryContent(candidateContent),
                importance: derivedImportance,
                confidence: 0.90,
                source: proposedSource,
                sourceReference: 'user_chat',
                sensitivity: safety.sensitivity,
                requiresConfirmation: true, // Mutations require confirmation
                rationale: `Replaces existing conflicting ${conflict.source} memory: "${conflict.content}".`,
                conflictWithMemoryId: conflict.id,
              });
            }
          } else {
            proposals.push({
              operation: 'create',
              type: derivedType,
              content: normalizeMemoryContent(candidateContent),
              importance: derivedImportance,
              confidence: proposedSource === 'agent_inferred' ? 0.75 : 0.90,
              source: proposedSource,
              sourceReference: proposedSource === 'agent_inferred' ? 'agent_inference' : 'user_chat',
              sensitivity: safety.sensitivity,
              requiresConfirmation: true, // Mutations require confirmation
              rationale: `Propose creating new ${derivedType} memory: "${candidateContent}".`,
            });
          }
        }
      }
    } else if (primaryIntent === 'forget') {
      const isDelete = lowerRequest.includes('delete') || lowerRequest.includes('permanently') || lowerRequest.includes('hard');
      const opType: 'delete' | 'archive' = isDelete ? 'delete' : 'archive';

      // Find candidate memory to archive/delete
      const targetPhrase = lowerRequest
        .replace(/^(forget that|forget|delete memory|delete|archive memory|archive|remove preference for|remove preference)\s*/i, '')
        .replace(/^(regarding|about|for|my preference for|my preference about|my preference|my notes about|my notes)\s*/i, '')
        .trim();

      const candidate = activeMemories.find(m => {
        const normContent = normalizeForComparison(m.content);
        const normTarget = normalizeForComparison(targetPhrase);
        if (!normTarget) return false;
        return normContent.includes(normTarget) || normTarget.includes(normContent);
      });

      if (candidate) {
        proposals.push({
          operation: opType,
          targetMemoryId: candidate.id,
          type: candidate.type,
          content: candidate.content,
          importance: candidate.importance,
          confidence: 1.0,
          source: candidate.source,
          sourceReference: isDelete ? 'user_delete_request' : 'user_forget_request',
          sensitivity: candidate.sensitivity,
          requiresConfirmation: true, // Deletions and archives require explicit confirmation
          rationale: `Propose ${opType === 'delete' ? 'deleting' : 'archiving'} memory "${candidate.content}" per user instruction.`,
        });
      } else {
        proposals.push({
          operation: 'ignore',
          type: 'preference',
          content: targetPhrase,
          importance: 'low',
          confidence: 0.5,
          source: 'user_explicit',
          sourceReference: 'user_chat',
          sensitivity: 'normal',
          requiresConfirmation: false,
          rationale: `No active memory matching "${targetPhrase}" was found to delete.`,
        });
      }
    } else {
      // Intent: 'retrieve'
      const retrieveRes = await this.retrievalEngine.retrieve(
        userId,
        {
          query: userRequest,
          limit: 5,
        },
        context
      );
      retrievedMemories = retrieveRes.memories;
    }

    // Detect any existing memory conflicts across active memories
    const detectedConflicts = this.retrievalEngine.detectConflicts(activeMemories);
    const conflicts: MemoryConflictReport[] = detectedConflicts.map(c => ({
      memoryIdA: c.memoryA.id,
      memoryIdB: c.memoryB.id,
      reason: c.conflictReason,
      authoritativeMemoryId: c.authoritativeMemoryId,
      rationale: c.authoritativeReason,
    }));

    // Map safe items with zero sensitive fields
    const safeMemories: ScoredMemoryItemSafe[] = retrievedMemories.map(m => ({
      memoryId: m.id,
      type: m.type,
      content: m.content,
      relevanceScore: m.relevanceScore,
      confidence: m.confidence,
      explicit: m.explicit ?? (m.source === 'user_confirmed' || m.source === 'user_explicit'),
      source: m.source,
      importance: m.importance,
      tags: m.tags,
    }));

    // 3. Optional Gemini Reasoning Enhancement (with guaranteed deterministic fallback)
    const reasoning = await memoryReasoningService.reasonAboutMemory(
      userRequest,
      primaryIntent,
      retrievedMemories,
      proposals
    );

    // 4. Map proposals to AgentActions (PROPOSALS ONLY)
    const actions: AgentAction[] = proposals.map((prop, idx) => {
      let actionType: import('../types').AgentActionType = 'MEMORY_CREATE';
      switch (prop.operation) {
        case 'create':
          actionType = 'MEMORY_CREATE';
          break;
        case 'update':
          actionType = 'MEMORY_UPDATE';
          break;
        case 'archive':
          actionType = 'MEMORY_ARCHIVE';
          break;
        case 'delete':
          actionType = 'MEMORY_DELETE';
          break;
        case 'ignore':
          actionType = 'MEMORY_IGNORE';
          break;
        case 'review_required':
          actionType = 'MEMORY_REVIEW_REQUIRED';
          break;
        default:
          actionType = 'MEMORY_RETRIEVE';
      }

      return {
        actionId: `action_mem_${Date.now()}_${idx}`,
        type: actionType,
        description: prop.rationale,
        target: prop.targetMemoryId || 'persistent_memory_store',
        parameters: {
          operation: prop.operation,
          type: prop.type,
          content: prop.content,
          importance: prop.importance,
          confidence: prop.confidence,
          source: prop.source,
          sensitivity: prop.sensitivity,
          targetMemoryId: prop.targetMemoryId,
          conflictWithMemoryId: prop.conflictWithMemoryId,
        },
        riskLevel: prop.operation === 'delete' || prop.operation === 'archive' ? 'medium' : 'low',
        requiresConfirmation: prop.requiresConfirmation,
        sourceAgentId: this.id,
      };
    });

    // If retrieval occurred and no mutation proposals, add non-destructive retrieval action
    if (primaryIntent === 'retrieve' && actions.length === 0) {
      actions.push({
        actionId: `action_mem_recall_${Date.now()}`,
        type: 'MEMORY_RETRIEVE',
        description: `Retrieved ${retrievedMemories.length} relevant memory items for user context.`,
        target: 'agent_context',
        parameters: {
          retrievedCount: retrievedMemories.length,
          topMemoryType: retrievedMemories[0]?.type,
        },
        riskLevel: 'low',
        requiresConfirmation: false, // Retrieval is read-only
        sourceAgentId: this.id,
      });
    }

    const warnings: string[] = [];
    if (conflicts.length > 0) {
      warnings.push(`Detected ${conflicts.length} memory conflict(s). Resolution recommended.`);
    }

    const durationMs = Date.now() - startTime;
    const output: MemoryAgentOutput = {
      primaryIntent,
      retrievedMemories,
      relevantMemories: safeMemories,
      rankedMemories: safeMemories,
      conflicts,
      memorySummary: reasoning.summary,
      proposedMemories: proposals,
      proposals,
      summary: reasoning.summary,
      decisionExplanation: reasoning.decisionExplanation,
      confidence: reasoning.confidence,
      warnings,
      reasoningSource: reasoning.reasoningSource,
      metadata: {
        totalActiveUserMemories: activeMemories.length,
        retrievedCount: retrievedMemories.length,
        proposalsCount: proposals.length,
        conflictsCount: conflicts.length,
      },
    };

    return {
      success: true,
      agentId: this.id,
      executionId: context.executionId,
      output,
      confidence: reasoning.confidence,
      actions,
      warnings,
      errors: [],
      metadata: {
        agent: this.id,
        version: this.version,
        durationMs,
        intent: primaryIntent,
      },
      durationMs,
    };
  }

  private inferMemoryType(content: string): MemoryType {
    const lower = content.toLowerCase();
    if (lower.includes('schedule') || lower.includes('morning') || lower.includes('afternoon') || lower.includes('evening') || lower.includes('hours') || lower.includes('bedtime') || lower.includes('wake')) {
      return 'scheduling_preference';
    }
    if (lower.includes('focus') || lower.includes('deep work') || lower.includes('distraction') || lower.includes('style') || lower.includes('productivity')) {
      return 'working_style';
    }
    if (lower.includes('goal') || lower.includes('milestone') || lower.includes('target')) {
      return 'goal_context';
    }
    if (lower.includes('project') || lower.includes('repo') || lower.includes('codebase')) {
      return 'project_context';
    }
    if (lower.includes('cannot') || lower.includes('never') || lower.includes('limit') || lower.includes('constraint')) {
      return 'constraint';
    }
    if (lower.includes('temporary') || lower.includes('this week only') || lower.includes('today only')) {
      return 'temporary_context';
    }
    return 'preference';
  }

  private inferImportance(content: string): MemoryImportance {
    const lower = content.toLowerCase();
    if (lower.includes('critical') || lower.includes('vital') || lower.includes('must always') || lower.includes('never forget')) {
      return 'critical';
    }
    if (lower.includes('important') || lower.includes('high priority') || lower.includes('top priority') || lower.includes('strongly prefer')) {
      return 'high';
    }
    if (lower.includes('slight') || lower.includes('minor') || lower.includes('if possible')) {
      return 'low';
    }
    return 'medium';
  }

  private findConflictingMemory(
    newContent: string,
    newType: MemoryType,
    existingMemories: { id: string; type: MemoryType; content: string; source: MemorySource }[]
  ): { id: string; content: string; source: MemorySource } | null {
    const lowerNew = newContent.toLowerCase();

    // Check opposing patterns: morning vs afternoon/evening
    if (lowerNew.includes('morning') && (lowerNew.includes('work') || lowerNew.includes('focus') || lowerNew.includes('deep work'))) {
      const conflict = existingMemories.find(m => {
        const lower = m.content.toLowerCase();
        return (lower.includes('afternoon') || lower.includes('evening') || lower.includes('night')) &&
          (lower.includes('work') || lower.includes('focus') || lower.includes('deep work'));
      });
      if (conflict) return conflict;
    }

    if ((lowerNew.includes('afternoon') || lowerNew.includes('evening')) && (lowerNew.includes('work') || lowerNew.includes('focus'))) {
      const conflict = existingMemories.find(m => {
        const lower = m.content.toLowerCase();
        return lower.includes('morning') && (lower.includes('work') || lower.includes('focus'));
      });
      if (conflict) return conflict;
    }

    return null;
  }
}

export const memoryAgent = new MemoryAgent();
