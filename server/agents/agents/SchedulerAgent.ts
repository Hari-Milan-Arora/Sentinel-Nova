/**
 * Scheduler Agent for Sentinel Nova
 *
 * Implements deterministic schedule matching, multi-strategy window scoring,
 * and conflict-aware schedule recommendations.
 *
 * Safety & Separation of Concerns:
 * - Read-only intelligence component: NEVER directly mutates tasks, calendar events, goals, projects, or stores.
 * - Produces strictly safe Action Proposals (type: SCHEDULE_TASK) with `requiresConfirmation: true`.
 * - Purely consumes data exposed through AgentContext.
 * - Deterministic scheduling engine only: zero autonomous mutations.
 */

import { BaseAgent } from '../Agent';
import {
  AgentContext,
  AgentCapability,
  AgentResult,
  AgentAction,
} from '../types';
import { Task, SchedulingCandidateWindow } from '../../../src/types';
import {
  scoreCandidateWindow,
  evaluateStrategies,
  selectBestWindow,
  SchedulingContext,
} from './SchedulingEngine';
import {
  SchedulingStrategy,
  SchedulingEvaluation,
  SchedulingResult,
  CandidateScheduleWindow,
} from './schedulerTypes';
import {
  findCandidateWindowsForTask,
  calculateAvailability,
} from '../../../src/utils/availabilityEngine';
import {
  schedulingReasoningService,
  SchedulingReasoningService,
} from '../services/SchedulingReasoningService';

export class SchedulerAgent extends BaseAgent {
  public readonly id = 'agent.scheduler';
  public readonly name = 'Scheduler Agent';
  public readonly description =
    'Evaluates availability, constraints, and strategies to generate deterministic, proposal-only schedule recommendations.';
  public readonly version = '1.0.0';

  public readonly capabilities: AgentCapability[] = [
    'scheduling',
    'availability_analysis',
    'calendar_awareness',
    'workload_balancing',
    'deadline_management',
    'focus_window_matching',
    'schedule_optimization',
    'conflict_detection',
  ];

  // Bounded within Orchestrator's 15000ms limit
  public readonly timeoutMs = 8000;

  private reasoningService: SchedulingReasoningService;

  constructor(reasoningService?: SchedulingReasoningService) {
    super();
    this.reasoningService = reasoningService || schedulingReasoningService;
  }

  /**
   * Determines if the Scheduler Agent can handle the given context.
   */
  public canHandle(context: AgentContext): boolean {
    if (!context) return false;

    // Check parameter cues
    if (context.parameters?.taskId || context.parameters?.taskIds) return true;

    // Check explicit user intent keywords
    const req = (context.userRequest || '').toLowerCase();
    const schedulingKeywords = [
      'schedule',
      'reschedule',
      'slot',
      'calendar',
      'find time',
      'when can i',
      'when should i',
      'fit in',
      'free window',
      'free slot',
      'time block',
      'time slot',
      'booking',
      'availability',
      'best time',
      'when to do',
      'why should i work on this at',
      'why at',
    ];

    if (schedulingKeywords.some((k) => req.includes(k))) return true;

    // Check capability whitelist
    if (context.allowedCapabilities?.includes('scheduling')) return true;

    return false;
  }

  /**
   * Executes deterministic scheduling evaluation and action proposal generation.
   */
  protected async run(context: AgentContext): Promise<Partial<AgentResult>> {
    const warnings: string[] = [];
    const proposedActions: AgentAction[] = [];
    const evaluations: SchedulingEvaluation[] = [];
    const unassignedTasks: Array<{ taskId: string; title: string; reason: string }> = [];

    // 1. Identify and validate target tasks from context and parameters
    const targetTasks = this.resolveAndValidateTasks(context, warnings);

    if (targetTasks.length === 0) {
      warnings.push('No schedulable tasks found matching the request criteria.');
      const emptyResult: SchedulingResult = {
        evaluations: [],
        recommendedActions: [],
        unassignedTasks: [],
        overallConfidence: 0.0,
        summary: 'No active tasks available to schedule.',
      };

      return {
        output: emptyResult,
        confidence: 0.0,
        actions: [],
        warnings,
        metadata: {
          tasksEvaluated: 0,
          actionsProposed: 0,
        },
      };
    }

    // 2. Build scheduling context (goals, projects, profile, now)
    const effectiveProfile = context.profile || (context as any).userProfile || null;
    const schedulingContext: SchedulingContext = {
      goals: context.goals,
      projects: context.projects,
      profile: effectiveProfile,
      now: context.timestamp ? new Date(context.timestamp) : new Date(),
    };

    // 3. Resolve preferred strategy if requested
    const requestedStrategy = this.resolveStrategy(context);

    // 4. Evaluate each task
    for (const task of targetTasks) {
      const candidateWindows = this.resolveCandidateWindows(task, context);

      if (candidateWindows.length === 0) {
        unassignedTasks.push({
          taskId: task.id,
          title: task.title,
          reason: 'No suitable free windows found matching task duration and constraints.',
        });
        continue;
      }

      // 1. Evaluate core Day 5C strategies deterministically
      const strategiesToEvaluate: SchedulingStrategy[] = Array.from(new Set([
        'deadline_first',
        'focus_alignment',
        'balanced_day',
        'energy_match',
        'workload_balance',
        requestedStrategy,
      ]));
      const strategyScores = evaluateStrategies(task, candidateWindows, schedulingContext, strategiesToEvaluate);

      // 2. Select the best window under the chosen strategy deterministically
      const deterministicBest = selectBestWindow(task, candidateWindows, requestedStrategy, schedulingContext);

      // 3. Compute all scored feasible windows
      const allScoredWindows = candidateWindows
        .map((cw) => scoreCandidateWindow(cw, task, requestedStrategy, schedulingContext))
        .sort((a, b) => b.score - a.score);

      let effectiveBest = deterministicBest;
      let effectiveRationale = deterministicBest
        ? `Recommended window ${deterministicBest.window.startFormatted} - ${deterministicBest.window.endFormatted} (${deterministicBest.fit} fit, score ${Math.round(deterministicBest.score * 100)}%) based on ${requestedStrategy} strategy.`
        : `No feasible window could be matched for task "${task.title}".`;
      let effectiveConfidence = deterministicBest ? deterministicBest.score : 0.0;
      let effectiveTradeoffs = this.generateTradeoffs(task, requestedStrategy, deterministicBest, allScoredWindows.slice(1, 4));

      // 4. Optional Reasoning Assistance via SchedulingReasoningService
      // CRITICAL: Gemini may ONLY rank/explain among deterministic feasible candidates
      if (deterministicBest && allScoredWindows.length > 0) {
        try {
          const reasoningResult = await this.reasoningService.enhanceScheduling(
            task,
            allScoredWindows,
            deterministicBest,
            requestedStrategy,
            context.userRequest
          );

          if (reasoningResult.enhanced && reasoningResult.chosenCandidate) {
            // Guarantee chosen candidate is one of our deterministic feasible candidates
            const isValidCandidate = candidateWindows.some(
              (cw) => cw.window.id === reasoningResult.chosenCandidate.window.id
            );
            if (isValidCandidate) {
              effectiveBest = reasoningResult.chosenCandidate;
              effectiveRationale = reasoningResult.rationale;
              effectiveConfidence = reasoningResult.confidenceScore;
              if (reasoningResult.tradeoffs && reasoningResult.tradeoffs.length > 0) {
                effectiveTradeoffs = reasoningResult.tradeoffs;
              }
            }
          }
        } catch {
          // Guaranteed deterministic fallback
        }
      }

      // 5. Compute alternative windows (up to 3 alternatives)
      const alternativeWindows: CandidateScheduleWindow[] = allScoredWindows
        .filter((sw) => sw.window.id !== effectiveBest?.window.id)
        .slice(0, 3);

      const evaluation: SchedulingEvaluation = {
        taskId: task.id,
        taskTitle: task.title,
        recommendedStrategy: requestedStrategy,
        strategyScores,
        bestWindow: effectiveBest,
        alternativeWindows,
        tradeoffs: effectiveTradeoffs,
        confidence: effectiveConfidence,
        reasoning: effectiveRationale,
      };

      evaluations.push(evaluation);

      // Generate SCHEDULE_TASK action proposal (PROPOSAL ONLY - zero autonomous mutation)
      if (effectiveBest) {
        proposedActions.push(
          this.createActionProposal({
            type: 'SCHEDULE_TASK',
            description: `Schedule task "${task.title}" for ${effectiveBest.window.startFormatted} - ${effectiveBest.window.endFormatted} (${effectiveBest.fit} fit, score: ${Math.round(effectiveBest.score * 100)}%).`,
            target: task.id,
            parameters: {
              taskId: task.id,
              taskTitle: task.title,
              scheduledStart: effectiveBest.suggestedStart,
              scheduledEnd: effectiveBest.suggestedEnd,
              strategy: requestedStrategy,
              fit: effectiveBest.fit,
              windowId: effectiveBest.window.id,
              durationMinutes: effectiveBest.taskDuration,
            },
            riskLevel: 'low',
            requiresConfirmation: true, // Safety Mandate
          })
        );
      } else {
        unassignedTasks.push({
          taskId: task.id,
          title: task.title,
          reason: 'No window satisfied the required scheduling constraints.',
        });
      }
    }

    // 5. Calculate overall confidence
    const overallConfidence =
      evaluations.length > 0
        ? evaluations.reduce((acc, ev) => acc + ev.confidence, 0) / evaluations.length
        : 0.0;

    const summary =
      proposedActions.length > 0
        ? `Generated ${proposedActions.length} schedule proposal(s) using '${requestedStrategy}' strategy.`
        : `Could not schedule ${unassignedTasks.length} task(s) due to tight constraints.`;

    const firstEval = evaluations[0];
    const schedulingResult: SchedulingResult = {
      evaluations,
      recommendedActions: proposedActions,
      unassignedTasks,
      overallConfidence: Math.round(overallConfidence * 1000) / 1000,
      summary,
      recommendation: firstEval ? firstEval.bestWindow : null,
      recommendedStrategy: requestedStrategy,
      rationale: firstEval ? firstEval.reasoning : undefined,
      alternatives: firstEval ? firstEval.alternativeWindows : undefined,
    };

    return {
      output: schedulingResult,
      confidence: Math.round(overallConfidence * 1000) / 1000,
      actions: proposedActions,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        tasksEvaluated: targetTasks.length,
        actionsProposed: proposedActions.length,
        unassignedCount: unassignedTasks.length,
        strategyUsed: requestedStrategy,
      },
    };
  }

  /**
   * Identifies target tasks from parameters and validates ownership/existence.
   */
  private resolveAndValidateTasks(context: AgentContext, warnings: string[]): Task[] {
    const availableTasks = context.tasks || [];

    // Case 1: Single taskId specified in parameters
    if (context.parameters?.taskId && typeof context.parameters.taskId === 'string') {
      const targetId = context.parameters.taskId;
      const matched = availableTasks.find((t) => t.id === targetId);

      if (!matched) {
        warnings.push(`Target task '${targetId}' was not found in the current context.`);
        return [];
      }

      // Verify user isolation
      if (matched.userId && matched.userId !== context.userId) {
        warnings.push(`Target task '${targetId}' does not belong to authenticated user.`);
        return [];
      }

      return [matched];
    }

    // Case 2: Array of taskIds specified in parameters
    if (Array.isArray(context.parameters?.taskIds)) {
      const targetIds = context.parameters.taskIds as string[];
      const matchedTasks = availableTasks.filter(
        (t) => targetIds.includes(t.id) && (!t.userId || t.userId === context.userId)
      );

      if (matchedTasks.length === 0) {
        warnings.push('None of the requested taskIds could be found in the current context.');
      }
      return matchedTasks;
    }

    // Case 3: Fallback to active tasks in context (cap at top 3 for focused scheduling)
    const activeTasks = availableTasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'cancelled'
    );

    return activeTasks.slice(0, 3);
  }

  /**
   * Resolves strategy from parameters or infers the most appropriate default.
   */
  private resolveStrategy(context: AgentContext): SchedulingStrategy {
    const validStrategies: SchedulingStrategy[] = [
      'deadline_first',
      'focus_alignment',
      'balanced_day',
      'energy_match',
      'workload_balance',
      'workload_balanced',
      'goal_impact_first',
      'momentum',
    ];

    const paramStrategy = context.parameters?.strategy as SchedulingStrategy | undefined;
    if (paramStrategy && validStrategies.includes(paramStrategy)) {
      return paramStrategy;
    }

    const req = (context.userRequest || '').toLowerCase();
    if (req.includes('deadline') || req.includes('due') || req.includes('urgent')) {
      return 'deadline_first';
    }
    if (req.includes('energy') || req.includes('circadian') || req.includes('stamina') || req.includes('fatigue')) {
      return 'energy_match';
    }
    if (req.includes('balanced day') || req.includes('balance my day') || req.includes('even pacing')) {
      return 'balanced_day';
    }
    if (req.includes('deep focus') || req.includes('focus')) {
      return 'focus_alignment';
    }
    if (req.includes('goal') || req.includes('impact') || req.includes('strategic')) {
      return 'goal_impact_first';
    }
    if (req.includes('quick win') || req.includes('momentum') || req.includes('fast')) {
      return 'momentum';
    }

    return 'workload_balanced';
  }

  /**
   * Obtains candidate scheduling windows for a task using available context.
   */
  private resolveCandidateWindows(task: Task, context: AgentContext): SchedulingCandidateWindow[] {
    // 1. Direct candidate match from pre-calculated availability
    if (context.availability?.candidateWindowsForTasks?.[task.id]) {
      return context.availability.candidateWindowsForTasks[task.id];
    }

    const effectiveProfile: any =
      context.profile ||
      (context as any).userProfile || {
        userId: context.userId,
        workingHours: { start: '09:00', end: '17:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
        focusWindows: [],
        breakPreferences: { defaultBreakMinutes: 15, frequencyMinutes: 90 },
        timeZone: context.timezone || 'UTC',
      };

    // 2. Calculate candidates from free windows in availability
    if (context.availability?.freeWindows && context.availability.freeWindows.length > 0) {
      return findCandidateWindowsForTask(task, context.availability.freeWindows, effectiveProfile);
    }

    // 3. Calculate fresh availability using profile (or fallback standard hours)
    const targetDate =
      (context.parameters?.dateStr as string) ||
      (context.timestamp ? context.timestamp.split('T')[0] : new Date().toISOString().split('T')[0]);

    const avail = calculateAvailability({
      dateStr: targetDate,
      profile: effectiveProfile,
      events: context.calendarEvents || [],
      selectedCalendarIds: context.calendarStatus?.selectedCalendarIds,
      tasks: [task],
    });

    return findCandidateWindowsForTask(task, avail.freeWindows, effectiveProfile);
  }

  /**
   * Synthesizes explainable tradeoffs for the scheduling decision.
   */
  private generateTradeoffs(
    task: Task,
    strategy: SchedulingStrategy,
    bestWindow: CandidateScheduleWindow | null,
    alternativeWindows: CandidateScheduleWindow[]
  ): string[] {
    const tradeoffs: string[] = [];

    if (!bestWindow) {
      tradeoffs.push('All evaluated windows had conflicts or insufficient duration.');
      return tradeoffs;
    }

    if (bestWindow.fit === 'tight') {
      tradeoffs.push('The chosen slot has minimal spare buffer, which may risk spillover.');
    } else {
      tradeoffs.push('The chosen slot offers comfortable buffer space.');
    }

    if (alternativeWindows.length > 0) {
      const topAlt = alternativeWindows[0];
      tradeoffs.push(
        `Alternative available at ${topAlt.window.startFormatted} with score ${Math.round(topAlt.score * 100)}%.`
      );
    }

    if (task.dueDate && bestWindow.conflictsDetected) {
      tradeoffs.push('Warning: Candidate slot is close to or breaches task deadline.');
    }

    return tradeoffs;
  }
}

export const schedulerAgent = new SchedulerAgent();
