/**
 * Prioritizer Agent for Sentinel Nova (Day 5B.2)
 *
 * Implements the contextual prioritization intelligence for Sentinel Nova.
 * Answers: "WHAT SHOULD I PAY ATTENTION TO FIRST?"
 *
 * Ranks active work across:
 * - Urgency (deadlines, overdue items)
 * - Importance (task, project, goal priority)
 * - Goal Impact (direct and project-linked strategic alignment)
 * - Project Impact (milestone progress, target dates)
 * - Blocking Impact (verified downstream dependencies, zero false inference)
 * - Effort / Cost (duration vs focus capacity)
 * - Capacity / Context (work hours and focus windows)
 *
 * Safety & Separation of Concerns:
 * - Read-only intelligence component: NEVER directly mutates tasks, goals, projects, calendar, or stores.
 * - Produces strictly safe Action Proposals with `requiresConfirmation: true`.
 * - Purely consumes data exposed through AgentContext.
 * - Hybrid pipeline: 100% deterministic core with optional Gemini enhancement.
 */

import { BaseAgent } from '../Agent';
import { AgentContext, AgentCapability, AgentResult, AgentAction } from '../types';
import { prioritizationEngine } from './PrioritizationEngine';
import { prioritizationReasoningService } from '../services/PrioritizationReasoningService';
import { PrioritizerOutput } from './prioritizerTypes';

export class PrioritizerAgent extends BaseAgent {
  public readonly id = 'agent.prioritizer';
  public readonly name = 'Prioritizer Agent';
  public readonly description =
    'Ranks active work by contextual urgency, importance, strategic impact, and execution constraints.';
  public readonly version = '1.0.0';

  public readonly capabilities: AgentCapability[] = [
    'prioritization',
    'urgency_analysis',
    'impact_analysis',
    'goal_alignment',
    'task_ranking',
    'decision_support',
  ];

  // Bounded within Orchestrator's 15000ms limit
  public readonly timeoutMs = 8000;

  /**
   * Determines if the Prioritizer Agent can handle the given context.
   */
  public canHandle(context: AgentContext): boolean {
    if (!context) return false;

    const req = (context.userRequest || '').toLowerCase();

    // Specific prioritization intent indicators
    const prioritizationKeywords = [
      'what should i work on first',
      'what is most important',
      'what should i prioritize',
      'which task deserves my attention',
      'what should i focus on',
      'which goal needs attention',
      'what\'s the most important thing',
      'what to do first',
      'prioritize',
      'priority',
      'rank',
      'order of importance',
      'attention',
      'what next',
    ];

    const hasPrioritizationIntent = prioritizationKeywords.some((k) => req.includes(k));
    if (hasPrioritizationIntent) {
      // Do not steal pure execution planning queries like "plan my day"
      const purePlanningPhrases = ['plan my day', 'schedule my day', 'build an execution plan', 'create schedule'];
      const isPurePlanning = purePlanningPhrases.some((p) => req.includes(p));
      if (!isPurePlanning) {
        return true;
      }
    }

    // If context parameters explicitly request prioritization scope
    if (context.parameters?.intent === 'prioritize') {
      return true;
    }

    return false;
  }

  /**
   * Executes the prioritization evaluation pipeline.
   */
  protected async run(context: AgentContext): Promise<Partial<AgentResult>> {
    // 1. Generate deterministic prioritization
    const deterministicOutput = prioritizationEngine.generatePrioritization(context);

    // 2. Optionally enhance with Gemini reasoning (guaranteed fallback on failure or timeout)
    const { output: finalOutput } = await prioritizationReasoningService.enhancePrioritization(
      deterministicOutput,
      context.userRequest
    );

    // 3. Generate safe Action Proposals (PROPOSALS ONLY - zero autonomous execution)
    const proposedActions: AgentAction[] = [];

    // Propose review for top overdue task if present
    const overdueItems = finalOutput.prioritizedItems.filter((item) => item.urgencyScore === 1.0);
    if (overdueItems.length > 0) {
      const targetTask = overdueItems[0];
      proposedActions.push(
        this.createActionProposal({
          type: 'UPDATE_TASK',
          description: `Review overdue status and adjust target deadline for "${targetTask.title}".`,
          target: targetTask.taskId,
          parameters: {
            taskId: targetTask.taskId,
            action: 'REVIEW_DEADLINE',
            urgencyScore: targetTask.urgencyScore,
          },
          riskLevel: 'medium',
          requiresConfirmation: true, // MUST require confirmation
        })
      );
    }

    // Propose focus highlight for #1 ranked item
    if (finalOutput.prioritizedItems.length > 0) {
      const topItem = finalOutput.prioritizedItems[0];
      proposedActions.push(
        this.createActionProposal({
          type: 'UPDATE_TASK',
          description: `Set focus on top priority item #${topItem.recommendedRank}: "${topItem.title}".`,
          target: topItem.taskId,
          parameters: {
            taskId: topItem.taskId,
            recommendedRank: topItem.recommendedRank,
            priorityScore: topItem.priorityScore,
          },
          riskLevel: 'low',
          requiresConfirmation: true, // MUST require confirmation
        })
      );
    }

    return {
      output: finalOutput,
      confidence: finalOutput.confidence,
      actions: proposedActions,
      warnings: finalOutput.risks.length > 0 ? finalOutput.risks : undefined,
      metadata: {
        reasoningSource: finalOutput.reasoningSource,
        recommendedStrategy: finalOutput.recommendedStrategy.id,
        itemCount: finalOutput.prioritizedItems.length,
        strategyCount: finalOutput.strategyCandidates.length,
      },
    };
  }
}

export const prioritizerAgent = new PrioritizerAgent();
