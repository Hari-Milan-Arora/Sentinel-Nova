/**
 * Deterministic Scheduling Engine for Sentinel Nova
 *
 * Implements pure, deterministic scheduling calculations:
 * 1. scoreCandidateWindow()
 * 2. evaluateStrategies()
 * 3. selectBestWindow()
 *
 * Pure computation only:
 * - No Gemini
 * - No HTTP / Express
 * - No file / database writes
 * - No mutations
 * - No agent calls
 */

import { Task, Goal, Project, UserPlanningProfile, SchedulingCandidateWindow } from '../../../src/types';
import {
  SchedulingStrategy,
  CandidateScheduleWindow,
  StrategyScore,
} from './schedulerTypes';

export interface SchedulingContext {
  goals?: Goal[];
  projects?: Project[];
  profile?: UserPlanningProfile | import('../../profileStore').UserPlanningProfile | null;
  now?: Date;
}

const STRATEGY_DEFINITIONS: Record<
  SchedulingStrategy,
  { name: string; description: string }
> = {
  deadline_first: {
    name: 'Deadline First',
    description: 'Prioritizes windows that safely precede deadlines with sufficient buffer.',
  },
  focus_alignment: {
    name: 'Focus Alignment',
    description: 'Aligns demanding work with preferred deep focus periods and peak energy hours.',
  },
  balanced_day: {
    name: 'Balanced Day',
    description: 'Distributes cognitive load evenly across the day with buffer protection.',
  },
  energy_match: {
    name: 'Energy Match',
    description: 'Matches task cognitive intensity and energy demands with peak diurnal circadian rhythms.',
  },
  workload_balance: {
    name: 'Workload Balance',
    description: 'Balances daily task volume against existing commitments to avoid overload.',
  },
  workload_balanced: {
    name: 'Workload Balanced',
    description: 'Spreads effort evenly with comfortable buffers to prevent cognitive fatigue.',
  },
  goal_impact_first: {
    name: 'Goal Impact First',
    description: 'Prioritizes prime scheduling slots for tasks directly advancing critical goals.',
  },
  momentum: {
    name: 'Momentum (Quick Wins)',
    description: 'Accelerates execution by placing high-completion-probability items into the earliest slots.',
  },
};

/**
 * Calculates start and end ISO strings for a task within a free window.
 */
function computeSuggestedInterval(
  windowStartIso: string,
  windowEndIso: string,
  taskDurationMinutes: number
): { start: string; end: string } {
  const startMs = new Date(windowStartIso).getTime();
  const endMs = new Date(windowEndIso).getTime();
  const durationMs = Math.max(15, taskDurationMinutes) * 60 * 1000;

  // Position at the start of the window by default
  const proposedEndMs = Math.min(startMs + durationMs, endMs);
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(proposedEndMs).toISOString(),
  };
}

/**
 * Normalizes a score strictly between 0.0 and 1.0 (clamped).
 */
function clampScore(score: number): number {
  if (Number.isNaN(score) || !Number.isFinite(score)) return 0.0;
  return Math.max(0.0, Math.min(1.0, Math.round(score * 1000) / 1000));
}

/**
 * 1. Deterministically scores a candidate window for a task under a specific strategy.
 */
export function scoreCandidateWindow(
  candidate: SchedulingCandidateWindow,
  task: Task,
  strategy: SchedulingStrategy,
  context?: SchedulingContext
): CandidateScheduleWindow {
  const duration = task.estimatedMinutes || candidate.taskDuration || 30;
  const fw = candidate.window;
  const reasons: string[] = [...(candidate.reasons || [])];
  const conflicts: string[] = [];

  const interval = computeSuggestedInterval(fw.start, fw.end, duration);
  const windowStart = new Date(interval.start);
  const windowEnd = new Date(interval.end);
  const now = context?.now || new Date();

  let rawScore = 0.5; // Base neutral score

  // 1. Availability fit baseline (0.0 to 0.25 contribution)
  if (candidate.fit === 'comfortable') {
    rawScore += 0.15;
  } else if (candidate.fit === 'exact') {
    rawScore += 0.1;
  } else if (candidate.fit === 'tight') {
    rawScore -= 0.05;
  }

  // 2. Working hours & focus period baseline
  if (fw.inPreferredWorkingHours) {
    rawScore += 0.1;
  } else {
    rawScore -= 0.1;
    reasons.push('Window is outside standard working hours.');
  }

  // 3. Strategy-specific scoring
  switch (strategy) {
    case 'deadline_first': {
      if (task.dueDate) {
        const deadline = new Date(task.dueDate).getTime();
        const scheduledTime = windowEnd.getTime();
        const leadTimeHours = (deadline - scheduledTime) / (1000 * 60 * 60);

        if (scheduledTime > deadline) {
          rawScore -= 0.4;
          conflicts.push('Window ends after task deadline.');
          reasons.push(`Deadline breach: window ends after ${task.dueDate}.`);
        } else if (leadTimeHours < 12) {
          rawScore += 0.25;
          reasons.push('Critical deadline urgency: placed directly ahead of deadline.');
        } else if (leadTimeHours < 48) {
          rawScore += 0.2;
          reasons.push('Comfortable margin before upcoming deadline.');
        } else {
          rawScore += 0.1;
          reasons.push('Well in advance of deadline.');
        }
      } else {
        // Without explicit deadline, early placement maintains high score
        const hoursFromNow = Math.max(0, (windowStart.getTime() - now.getTime()) / (1000 * 60 * 60));
        rawScore += hoursFromNow < 24 ? 0.1 : 0.0;
        reasons.push('No deadline set; scheduled near-term to prevent backlog buildup.');
      }
      break;
    }

    case 'focus_alignment': {
      if (fw.inPreferredFocusPeriod) {
        rawScore += 0.25;
        reasons.push(`Direct alignment with ${fw.preferredPeriodName || 'deep focus'} period.`);
      } else {
        rawScore -= 0.1;
      }

      // High or urgent tasks gain more in focus periods
      if (task.priority === 'urgent' || task.priority === 'high') {
        if (fw.inPreferredFocusPeriod) {
          rawScore += 0.1;
          reasons.push('High priority task matched with protected focus time.');
        }
      }

      // Longer tasks (>45 min) reward focus alignment
      if (duration >= 45 && fw.inPreferredFocusPeriod) {
        rawScore += 0.05;
      }
      break;
    }

    case 'goal_impact_first': {
      let linkedGoalImpact = 0;
      if (task.goalId && context?.goals) {
        const goal = context.goals.find((g) => g.id === task.goalId);
        if (goal) {
          if (goal.priority === 'critical') linkedGoalImpact = 0.25;
          else if (goal.priority === 'high') linkedGoalImpact = 0.2;
          else if (goal.priority === 'medium') linkedGoalImpact = 0.1;
          reasons.push(`Directly advances Goal: "${goal.title}" (${goal.priority} priority).`);
        }
      }

      if (task.projectId && context?.projects) {
        const project = context.projects.find((p) => p.id === task.projectId);
        if (project) {
          linkedGoalImpact += 0.05;
          reasons.push(`Belongs to Project: "${project.name}".`);
        }
      }

      if (linkedGoalImpact > 0) {
        rawScore += linkedGoalImpact;
      } else {
        rawScore -= 0.05;
        reasons.push('Task is standalone without explicit goal alignment.');
      }
      break;
    }

    case 'balanced_day': {
      // Workload + buffers + distribution dominate
      if (candidate.fit === 'comfortable') {
        rawScore += 0.25;
        reasons.push('Generous buffer supports a balanced, low-stress day.');
      } else if (candidate.fit === 'tight') {
        rawScore -= 0.2;
        reasons.push('Tight window disrupts day balance and risks spillover.');
      } else if (candidate.fit === 'exact') {
        rawScore += 0.05;
      }

      // Mid-day spacing bonus (between 10:00 and 16:00)
      const startHour = windowStart.getUTCHours();
      if (startHour >= 10 && startHour <= 15) {
        rawScore += 0.15;
        reasons.push('Optimal mid-day placement creates balanced pacing.');
      } else if (startHour >= 18) {
        rawScore -= 0.15;
        reasons.push('Evening slot conflicts with balanced day cooldown.');
      }
      break;
    }

    case 'energy_match': {
      // Preferred period + cognitive fit dominate
      const startHour = windowStart.getUTCHours();
      const taskEnergy = (task as any).energyLevel || (task.priority === 'urgent' || task.priority === 'high' ? 'high' : 'medium');
      const preferredTime = (task as any).preferredTime;

      // Match high cognitive intensity to focus period or morning hours
      if (taskEnergy === 'high') {
        if (fw.inPreferredFocusPeriod || (startHour >= 9 && startHour <= 12)) {
          rawScore += 0.3;
          reasons.push('High-energy task matched with peak diurnal morning/focus window.');
        } else {
          rawScore -= 0.1;
          reasons.push('High-energy task scheduled during lower-energy flex hours.');
        }
      } else if (taskEnergy === 'low') {
        if (startHour >= 13 && startHour <= 17) {
          rawScore += 0.2;
          reasons.push('Low-energy task placed in afternoon flex window.');
        }
      }

      // Preferred time matching
      if (preferredTime === 'morning' && startHour < 12) {
        rawScore += 0.15;
        reasons.push('Matches requested morning preference.');
      } else if (preferredTime === 'afternoon' && startHour >= 12 && startHour < 17) {
        rawScore += 0.15;
        reasons.push('Matches requested afternoon preference.');
      }
      break;
    }

    case 'workload_balance':
    case 'workload_balanced': {
      // Daily capacity + calendar load + fatigue prevention dominate
      if (candidate.fit === 'comfortable') {
        rawScore += 0.2;
        reasons.push('Generous buffer prevents fatigue and spillover.');
      } else if (candidate.fit === 'tight') {
        rawScore -= 0.15;
        reasons.push('Tight window may increase cognitive stress.');
      }

      // Avoid scheduling after 18:00 unless preferred
      const startHour = windowStart.getUTCHours();
      if (startHour >= 18) {
        rawScore -= 0.15;
        reasons.push('Evening slot may intrude on rest recovery.');
      } else if (fw.inPreferredWorkingHours) {
        rawScore += 0.1;
        reasons.push('Paced inside standard working hours to preserve capacity.');
      }
      break;
    }

    case 'momentum': {
      // Quick wins: shorter duration tasks placed early
      const hoursFromNow = Math.max(0, (windowStart.getTime() - now.getTime()) / (1000 * 60 * 60));

      if (duration <= 30) {
        rawScore += 0.2;
        reasons.push('Bite-sized task (<30m) ideal for quick momentum.');
      } else if (duration <= 45) {
        rawScore += 0.1;
      } else {
        rawScore -= 0.1;
        reasons.push('Large task duration slows quick-win momentum.');
      }

      // Early time bonus
      if (hoursFromNow <= 6) {
        rawScore += 0.15;
        reasons.push('Early execution window accelerates daily momentum.');
      } else if (hoursFromNow <= 24) {
        rawScore += 0.05;
      }
      break;
    }
  }

  const finalScore = clampScore(rawScore);

  return {
    window: fw,
    taskId: task.id,
    taskTitle: task.title,
    taskDuration: duration,
    fit: candidate.fit,
    score: finalScore,
    reasons,
    suggestedStart: interval.start,
    suggestedEnd: interval.end,
    conflictsDetected: conflicts.length > 0 ? conflicts : undefined,
  };
}

/**
 * Deterministic comparator for candidate schedule windows.
 * Sorts descending by score, then earlier start time, then fit, then window ID.
 */
function compareCandidateWindows(
  a: CandidateScheduleWindow,
  b: CandidateScheduleWindow
): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  const timeA = new Date(a.suggestedStart).getTime();
  const timeB = new Date(b.suggestedStart).getTime();
  if (timeA !== timeB) {
    return timeA - timeB; // earlier first
  }

  const fitWeight = { comfortable: 3, exact: 2, tight: 1 };
  const fitDiff = fitWeight[b.fit] - fitWeight[a.fit];
  if (fitDiff !== 0) {
    return fitDiff;
  }

  return a.window.id.localeCompare(b.window.id);
}

export const CORE_DAY5C_STRATEGIES: SchedulingStrategy[] = [
  'deadline_first',
  'focus_alignment',
  'balanced_day',
  'energy_match',
  'workload_balance',
];

export const ALL_SUPPORTED_STRATEGIES: SchedulingStrategy[] = [
  'deadline_first',
  'focus_alignment',
  'balanced_day',
  'energy_match',
  'workload_balance',
  'workload_balanced',
  'goal_impact_first',
  'momentum',
];

/**
 * 2. Evaluates scheduling strategies for a given task across candidate windows.
 * Defaults to the 5 baseline strategies, or accepts an explicit list of strategies.
 */
export function evaluateStrategies(
  task: Task,
  candidateWindows: SchedulingCandidateWindow[],
  context?: SchedulingContext,
  strategiesToEvaluate?: SchedulingStrategy[]
): StrategyScore[] {
  const strategies: SchedulingStrategy[] = strategiesToEvaluate || [
    'deadline_first',
    'focus_alignment',
    'goal_impact_first',
    'workload_balanced',
    'momentum',
  ];

  return strategies.map((strategy) => {
    const meta = STRATEGY_DEFINITIONS[strategy];

    if (!candidateWindows || candidateWindows.length === 0) {
      return {
        strategy,
        name: meta.name,
        description: meta.description,
        score: 0.0,
        rationale: `No available scheduling windows found for strategy '${meta.name}'.`,
        candidateWindow: null,
      };
    }

    const scoredWindows = candidateWindows.map((cw) =>
      scoreCandidateWindow(cw, task, strategy, context)
    );

    scoredWindows.sort(compareCandidateWindows);
    const bestWindow = scoredWindows[0] || null;

    let rationale = `Strategy '${meta.name}' evaluated ${candidateWindows.length} potential window(s).`;
    if (bestWindow) {
      rationale += ` Optimal fit: ${bestWindow.window.startFormatted} - ${bestWindow.window.endFormatted} (score: ${bestWindow.score}).`;
    }

    return {
      strategy,
      name: meta.name,
      description: meta.description,
      score: bestWindow ? bestWindow.score : 0.0,
      rationale,
      candidateWindow: bestWindow,
    };
  });
}

/**
 * Evaluates the 5 core Day 5C strategies:
 * deadline_first, focus_alignment, balanced_day, energy_match, workload_balance
 */
export function evaluateDay5CStrategies(
  task: Task,
  candidateWindows: SchedulingCandidateWindow[],
  context?: SchedulingContext
): StrategyScore[] {
  return evaluateStrategies(task, candidateWindows, context, CORE_DAY5C_STRATEGIES);
}

/**
 * 3. Selects the single best schedule window for a task under a specific strategy.
 */
export function selectBestWindow(
  task: Task,
  candidateWindows: SchedulingCandidateWindow[],
  strategy: SchedulingStrategy,
  context?: SchedulingContext
): CandidateScheduleWindow | null {
  if (!candidateWindows || candidateWindows.length === 0) {
    return null;
  }

  const scoredWindows = candidateWindows.map((cw) =>
    scoreCandidateWindow(cw, task, strategy, context)
  );

  scoredWindows.sort(compareCandidateWindows);
  return scoredWindows[0] || null;
}

export class SchedulingEngine {
  public scoreCandidateWindow = scoreCandidateWindow;
  public evaluateStrategies = evaluateStrategies;
  public selectBestWindow = selectBestWindow;
}

export const schedulingEngine = new SchedulingEngine();
