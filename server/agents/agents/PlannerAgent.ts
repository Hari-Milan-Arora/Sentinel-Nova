/**
 * Planner Agent for Sentinel Nova (Day 5B.1)
 *
 * Implements the deliberative strategic planning intelligence for Sentinel Nova.
 * Transforms active goals, projects, tasks, planning profile, calendar constraints,
 * and availability into a structured, explainable execution plan.
 *
 * Safety & Separation of Concerns:
 * - Read-only intelligence component: NEVER directly mutates tasks, goals, projects, calendar, or stores.
 * - Produces strictly safe Action Proposals with `requiresConfirmation: true`.
 * - Purely consumes data exposed through AgentContext.
 * - Hybrid deliberative pipeline: 100% deterministic core with optional Gemini enhancement.
 */

import { BaseAgent } from '../Agent';
import { AgentContext, AgentCapability, AgentResult, AgentAction } from '../types';
import { planningEngine } from './PlanningEngine';
import { planningReasoningService } from '../services/PlanningReasoningService';
import { PlannerOutput } from './plannerTypes';

export class PlannerAgent extends BaseAgent {
  public readonly id = 'agent.planner';
  public readonly name = 'Planner Agent';
  public readonly description =
    'Creates structured execution plans from goals, projects, tasks, constraints, and available time.';
  public readonly version = '1.0.0';

  public readonly capabilities: AgentCapability[] = [
    'planning',
    'task_decomposition',
    'sequencing',
    'goal_alignment',
    'schedule_awareness',
  ];

  // Configured with an 8000ms timeout, bounded well within Orchestrator's 15000ms
  public readonly timeoutMs = 8000;

  /**
   * Determines if the Planner Agent can handle the given context.
   */
  public canHandle(context: AgentContext): boolean {
    if (!context) return false;

    // Check explicit user intent keywords
    const req = (context.userRequest || '').toLowerCase();
    const planningKeywords = [
      'plan',
      'schedule',
      'prioritize',
      'work on next',
      'next',
      'strategy',
      'sequence',
      'goal',
      'today',
      'focus',
      'order',
    ];

    const hasPlanningIntent = planningKeywords.some((k) => req.includes(k));
    if (hasPlanningIntent) return true;

    // If context has active tasks or goals, Planner is capable of general planning
    if (context.tasks && context.tasks.length > 0) return true;
    if (context.goals && context.goals.length > 0) return true;

    return false;
  }

  /**
   * Executes the 6-step deliberative planning pipeline.
   */
  protected async run(context: AgentContext): Promise<Partial<AgentResult>> {
    // 1. Generate core deterministic plan
    const deterministicPlan = planningEngine.generatePlan(context);

    // 2. Optionally enhance with Gemini reasoning (guaranteed fallback on failure or timeout)
    const { plan: finalPlan } = await planningReasoningService.enhancePlan(
      deterministicPlan,
      context.userRequest
    );

    // 3. Generate safe Action Proposals (PROPOSALS ONLY - zero autonomous execution)
    const proposedActions: AgentAction[] = [];

    // If overdue tasks exist, propose a schedule review action
    const overdueTasks = finalPlan.prioritizedItems.filter((item) => item.deadlineScore === 1.0);
    if (overdueTasks.length > 0) {
      const targetTask = overdueTasks[0];
      proposedActions.push(
        this.createActionProposal({
          type: 'SCHEDULE_TASK',
          description: `Reschedule overdue task "${targetTask.title}" to protect deadline compliance.`,
          target: targetTask.taskId,
          parameters: {
            taskId: targetTask.taskId,
            recommendedOrder: 1,
            urgencyScore: targetTask.urgencyScore,
          },
          riskLevel: 'medium',
          requiresConfirmation: true, // MUST require confirmation
        })
      );
    }

    // If a top priority item is identified, propose setting its focus recommendation
    if (finalPlan.executionSequence.length > 0) {
      const topItem = finalPlan.executionSequence[0];
      const taskMeta = finalPlan.prioritizedItems.find((p) => p.taskId === topItem.taskId);
      proposedActions.push(
        this.createActionProposal({
          type: 'UPDATE_TASK',
          description: `Prioritize "${taskMeta?.title || topItem.taskId}" as position #1 for ${topItem.preferredFocusPeriod || 'Morning'} execution.`,
          target: topItem.taskId,
          parameters: {
            taskId: topItem.taskId,
            recommendedOrder: topItem.recommendedOrder,
            focusPeriod: topItem.preferredFocusPeriod,
          },
          riskLevel: 'low',
          requiresConfirmation: true,
        })
      );
    }

    return {
      output: finalPlan,
      confidence: finalPlan.confidence,
      actions: proposedActions,
      warnings: finalPlan.risks.length > 0 ? finalPlan.risks : undefined,
      metadata: {
        reasoningSource: finalPlan.reasoningSource,
        recommendedStrategy: finalPlan.recommendedStrategy.id,
        itemCount: finalPlan.prioritizedItems.length,
        strategyCount: finalPlan.strategyCandidates.length,
      },
    };
  }
}

export const plannerAgent = new PlannerAgent();
