/**
 * Deterministic Planning Engine for Sentinel Nova (Day 5B.1)
 *
 * Implements the 6-step planning pipeline:
 * 1. Understand objectives (goals, priority, target dates, linked projects)
 * 2. Understand projects (status, priority, progress, target date, associated tasks)
 * 3. Analyze tasks (priority, due date, duration, dependencies, alignment)
 * 4. Identify constraints (sleep, work hours, focus periods, daily capacity, buffers, calendar)
 * 5. Calculate urgency & multi-dimensional scores using explainable deterministic heuristics
 * 6. Generate 5 deliberative strategy candidates, score them, and determine execution sequence
 */

import { AgentContext } from '../types';
import { Task, Goal, Project, FreeWindow } from '../../../src/types';
import { findCandidateWindowsForTask } from '../../../src/utils/availabilityEngine';
import {
  PlannerOutput,
  PlanningStrategyCandidate,
  PrioritizedItem,
  ExecutionSequenceItem,
  TaskScheduleRecommendation,
  ObjectiveSummary,
  PlanningStrategyId,
} from './plannerTypes';

export class PlanningEngine {
  /**
   * Generates a complete, deterministic execution plan from the agent context.
   */
  public generatePlan(context: AgentContext): PlannerOutput {
    const now = new Date(context.timestamp || new Date().toISOString());
    const tasks = context.tasks || [];
    const goals = context.goals || [];
    const projects = context.projects || [];
    const profile = context.profile;
    const availability = context.availability;

    // STEP 1: Understand Objectives (Goals)
    const activeGoals = goals.filter((g) => g.status === 'active');
    const goalMap = new Map<string, Goal>();
    for (const g of goals) {
      goalMap.set(g.id, g);
    }

    // STEP 2: Understand Projects
    const activeProjects = projects.filter((p) => p.status === 'active');
    const projectMap = new Map<string, Project>();
    for (const p of projects) {
      projectMap.set(p.id, p);
    }

    // STEP 3: Analyze Tasks
    const activeTasks = tasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'cancelled'
    );

    const overdueTasks = activeTasks.filter((t) => {
      if (!t.dueDate) return false;
      return new Date(t.dueDate).getTime() < now.getTime();
    });

    const highPriorityTasks = activeTasks.filter(
      (t) => t.priority === 'urgent' || t.priority === 'high'
    );

    const objectiveSummary: ObjectiveSummary = {
      totalGoals: goals.length,
      activeGoals: activeGoals.length,
      totalProjects: projects.length,
      activeProjects: activeProjects.length,
      totalTasks: tasks.length,
      pendingTasks: activeTasks.length,
      overdueTasks: overdueTasks.length,
      highPriorityTasks: highPriorityTasks.length,
    };

    // STEP 4: Identify Constraints
    const constraintsConsidered: string[] = [];
    if (profile) {
      if (profile.sleepSchedule) {
        constraintsConsidered.push(
          `Sleep rhythm: ${profile.sleepSchedule.weekdaySleep || '23:00'} - ${profile.sleepSchedule.weekdayWake || '07:00'}`
        );
      }
      if (profile.preferredWorkingHours) {
        constraintsConsidered.push(
          `Working hours: ${profile.preferredWorkingHours.startTime || '09:00'} - ${profile.preferredWorkingHours.endTime || '18:00'}`
        );
      }
      if (profile.preferredPeriods && profile.preferredPeriods.length > 0) {
        constraintsConsidered.push(`Focus periods: ${profile.preferredPeriods.join(', ')}`);
      }
      if (profile.dailyFocusCapacity) {
        const capStr = String(profile.dailyFocusCapacity);
        const formatted = capStr.endsWith('hours') || capStr.endsWith('h') ? capStr : `${capStr}h`;
        constraintsConsidered.push(`Daily focus capacity: ${formatted}`);
      }
      if (profile.bufferMinutes !== undefined) {
        constraintsConsidered.push(`Meeting buffer: ${profile.bufferMinutes}m`);
      }
    } else {
      constraintsConsidered.push('Default working hours: 09:00 - 18:00 (profile unconfigured)');
    }

    if (availability) {
      constraintsConsidered.push(
        `Calendar availability: ${availability.freeWindows.length} free windows (${availability.totalFreeMinutes}m available, ${availability.totalBusyMinutes}m busy)`
      );
    } else {
      constraintsConsidered.push('Calendar status: offline/unlinked (using profile working hours)');
    }

    // STEP 5: Calculate Urgency and Multi-dimensional Scores
    const scoredTasks = this.scoreTasks(activeTasks, goalMap, projectMap, now);

    // STEP 6: Deliberative Strategy Design (5 candidates)
    const strategyCandidates = this.generateStrategyCandidates(
      objectiveSummary,
      activeTasks,
      scoredTasks,
      availability
    );

    // Pick top-scoring strategy
    const recommendedStrategy = strategyCandidates[0] || {
      id: 'balanced_execution',
      name: 'Balanced Execution',
      description: 'Maintains steady equilibrium across deadlines, strategic goals, and day-to-day work.',
      score: 0.8,
      strengths: ['Sustained momentum', 'Prevents bottlenecks'],
      tradeoffs: ['Progress is distributed rather than concentrated on a single critical path.'],
    };

    // Determine sequence according to recommended strategy
    const executionSequence = this.determineExecutionSequence(
      scoredTasks,
      recommendedStrategy.id,
      profile
    );

    // Prioritized items with final recommended order
    const prioritizedItems: PrioritizedItem[] = executionSequence.map((seq, idx) => {
      const task = scoredTasks.find((st) => st.taskId === seq.taskId)!;
      return {
        ...task,
        recommendedOrder: idx + 1,
      };
    });

    // Schedule recommendations
    const scheduleRecommendations = this.generateScheduleRecommendations(
      activeTasks,
      availability?.freeWindows || [],
      profile
    );

    // Risks identification
    const risks = this.identifyRisks(objectiveSummary, scoredTasks, availability);

    // Confidence calculation (0.0 to 1.0)
    const confidence = this.calculateConfidence(objectiveSummary, profile, availability);

    // Rationale construction
    const rationale = this.constructRationale(
      recommendedStrategy,
      objectiveSummary,
      risks,
      prioritizedItems.length
    );

    return {
      recommendedStrategy,
      strategyCandidates,
      objectiveSummary,
      prioritizedItems,
      executionSequence,
      scheduleRecommendations,
      constraintsConsidered,
      risks,
      confidence,
      rationale,
      reasoningSource: 'deterministic',
    };
  }

  /**
   * Scores all active tasks on multiple explainable dimensions.
   */
  private scoreTasks(
    tasks: Task[],
    goalMap: Map<string, Goal>,
    projectMap: Map<string, Project>,
    now: Date
  ): PrioritizedItem[] {
    return tasks.map((task) => {
      // 1. Deadline score
      let deadlineScore = 0.1;
      let isOverdue = false;
      let hoursUntilDue = Infinity;

      if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        const diffMs = dueDate.getTime() - now.getTime();
        hoursUntilDue = diffMs / (1000 * 60 * 60);

        if (hoursUntilDue < 0) {
          isOverdue = true;
          deadlineScore = 1.0;
        } else if (hoursUntilDue <= 24) {
          deadlineScore = 0.95;
        } else if (hoursUntilDue <= 48) {
          deadlineScore = 0.8;
        } else if (hoursUntilDue <= 168) {
          // 7 days
          deadlineScore = 0.55;
        } else {
          deadlineScore = 0.3;
        }
      }

      // 2. Priority base score
      let priorityWeight = 0.4;
      if (task.priority === 'urgent') priorityWeight = 1.0;
      else if (task.priority === 'high') priorityWeight = 0.8;
      else if (task.priority === 'medium') priorityWeight = 0.5;
      else if (task.priority === 'low') priorityWeight = 0.2;

      // 3. Urgency score (composite of deadline + priority + overdue flag)
      let urgencyScore = Math.min(
        1.0,
        0.6 * deadlineScore + 0.4 * priorityWeight + (isOverdue ? 0.3 : 0)
      );

      // 4. Importance score (task priority + project priority + goal priority)
      let projectWeight = 0.3;
      let goalWeight = 0.2;
      let linkedGoalTitle: string | undefined;

      if (task.projectId) {
        const proj = projectMap.get(task.projectId);
        if (proj) {
          if (proj.priority === 'high') projectWeight = 0.8;
          else if (proj.priority === 'medium') projectWeight = 0.5;
          else if (proj.priority === 'low') projectWeight = 0.2;

          if (proj.goalId) {
            const goal = goalMap.get(proj.goalId);
            if (goal) {
              linkedGoalTitle = goal.title;
              if (goal.priority === 'high') goalWeight = 1.0;
              else if (goal.priority === 'medium') goalWeight = 0.6;
              else if (goal.priority === 'low') goalWeight = 0.3;
            }
          }
        }
      }

      const importanceScore = Math.min(
        1.0,
        0.4 * priorityWeight + 0.3 * projectWeight + 0.3 * goalWeight
      );

      // 5. Goal alignment score
      let goalAlignmentScore = 0.1;
      if (linkedGoalTitle) {
        goalAlignmentScore = goalWeight;
      } else if (task.projectId) {
        goalAlignmentScore = 0.4;
      }

      // 6. Effort score (normalized duration)
      const duration = task.estimatedMinutes || 30;
      let effortScore = 0.4;
      if (duration <= 15) effortScore = 0.2;
      else if (duration <= 30) effortScore = 0.35;
      else if (duration <= 60) effortScore = 0.6;
      else if (duration <= 120) effortScore = 0.8;
      else effortScore = 1.0;

      // 7. Composite priority score (bounded [0.0, 1.0])
      const priorityScore = Number(
        (
          0.35 * urgencyScore +
          0.35 * importanceScore +
          0.20 * goalAlignmentScore +
          0.10 * (1 - effortScore)
        ).toFixed(3)
      );

      // Construct explainable rationale
      const reasons: string[] = [];
      if (isOverdue) reasons.push('Overdue commitment requiring immediate recovery');
      else if (hoursUntilDue <= 24) reasons.push(`Deadline imminent (within ${Math.max(1, Math.round(hoursUntilDue))}h)`);
      if (linkedGoalTitle) reasons.push(`Directly advances goal "${linkedGoalTitle}"`);
      if (task.priority === 'urgent' || task.priority === 'high') reasons.push(`Marked ${task.priority} priority`);
      if (duration <= 30) reasons.push(`Quick operational win (${duration}m)`);
      if (reasons.length === 0) reasons.push('Active work item in standard backlog');

      return {
        taskId: task.id,
        title: task.title,
        priorityScore: Math.min(1.0, Math.max(0.0, priorityScore)),
        urgencyScore: Number(urgencyScore.toFixed(3)),
        importanceScore: Number(importanceScore.toFixed(3)),
        goalAlignmentScore: Number(goalAlignmentScore.toFixed(3)),
        deadlineScore: Number(deadlineScore.toFixed(3)),
        effortScore: Number(effortScore.toFixed(3)),
        recommendedOrder: 0, // Assigned after sequencing
        rationale: reasons.join('; ') + '.',
      };
    });
  }

  /**
   * Generates 5 distinct deliberative strategy candidates and scores them.
   */
  private generateStrategyCandidates(
    summary: ObjectiveSummary,
    tasks: Task[],
    scoredTasks: PrioritizedItem[],
    availability: any
  ): PlanningStrategyCandidate[] {
    const hasOverdue = summary.overdueTasks > 0;
    const hasImminent = scoredTasks.some((t) => t.deadlineScore >= 0.8);
    const hasActiveGoals = summary.activeGoals > 0;
    const hasLongFocusTasks = tasks.some((t) => (t.estimatedMinutes || 30) >= 60);
    const hasQuickWins = tasks.some((t) => (t.estimatedMinutes || 30) <= 30);
    const hasPrimeFocusWindows =
      availability?.freeWindows?.some((w: FreeWindow) => w.inPreferredFocusPeriod) ?? false;

    // 1. Deadline-First
    let deadlineScore = 0.55;
    if (hasOverdue) deadlineScore += 0.35;
    else if (hasImminent) deadlineScore += 0.25;
    deadlineScore = Math.min(0.98, deadlineScore);

    // 2. Goal-Impact-First
    let goalScore = 0.5;
    if (hasActiveGoals) goalScore += 0.25;
    if (scoredTasks.some((t) => t.goalAlignmentScore >= 0.6)) goalScore += 0.15;
    if (!hasOverdue) goalScore += 0.05;
    goalScore = Math.min(0.95, goalScore);

    // 3. Deep-Focus-First
    let deepFocusScore = 0.45;
    if (hasLongFocusTasks) deepFocusScore += 0.25;
    if (hasPrimeFocusWindows) deepFocusScore += 0.2;
    deepFocusScore = Math.min(0.92, deepFocusScore);

    // 4. Balanced Execution
    let balancedScore = 0.78;
    if (summary.pendingTasks >= 3) balancedScore += 0.1;
    balancedScore = Math.min(0.9, balancedScore);

    // 5. Quick-Win / Momentum-First
    let quickWinScore = 0.5;
    if (hasQuickWins) quickWinScore += 0.2;
    if (summary.pendingTasks > 5) quickWinScore += 0.15;
    quickWinScore = Math.min(0.88, quickWinScore);

    const candidates: PlanningStrategyCandidate[] = [
      {
        id: 'deadline_first',
        name: 'Deadline-First Strategy',
        description: 'Prioritizes hard deadlines and overdue deliverables to prevent commitments from slipping.',
        score: Number(deadlineScore.toFixed(3)),
        strengths: ['Eliminates immediate deadline risk', 'Guarantees critical compliance'],
        tradeoffs: ['May temporarily defer strategic milestones that lack rigid time constraints'],
      },
      {
        id: 'goal_impact_first',
        name: 'Goal-Impact-First Strategy',
        description: 'Focuses energy on tasks that advance active quarterly goals and high-priority strategic projects.',
        score: Number(goalScore.toFixed(3)),
        strengths: ['Accelerates top strategic outcomes', 'Ensures high ROI on working hours'],
        tradeoffs: ['Secondary administrative tasks may be postponed to subsequent cycles'],
      },
      {
        id: 'deep_focus_first',
        name: 'Deep-Focus-First Strategy',
        description: 'Schedules demanding, high-effort cognitive tasks into uninterrupted peak focus windows.',
        score: Number(deepFocusScore.toFixed(3)),
        strengths: ['Maximizes cognitive bandwidth', 'Reduces context switching penalties'],
        tradeoffs: ['Requires large contiguous blocks; rapid quick wins are delayed'],
      },
      {
        id: 'balanced_execution',
        name: 'Balanced Execution Strategy',
        description: 'Balances urgent commitments with steady strategic progress and administrative hygiene.',
        score: Number(balancedScore.toFixed(3)),
        strengths: ['Maintains holistic equilibrium', 'Prevents bottlenecks across all projects'],
        tradeoffs: ['Progress is distributed broadly rather than concentrated on a single vector'],
      },
      {
        id: 'quick_win',
        name: 'Quick-Win / Momentum-First Strategy',
        description: 'Clears short-duration, high-yield tasks early to build operational momentum and reduce mental overhead.',
        score: Number(quickWinScore.toFixed(3)),
        strengths: ['Rapidly decreases backlog volume', 'Generates immediate psychological traction'],
        tradeoffs: ['Substantive deep-work deliverables are deferred to later in the day'],
      },
    ];

    // Sort descending by score
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  /**
   * Determines execution sequence based on selected strategy.
   */
  private determineExecutionSequence(
    scoredTasks: PrioritizedItem[],
    strategyId: PlanningStrategyId,
    profile: any
  ): ExecutionSequenceItem[] {
    const sorted = [...scoredTasks];

    if (strategyId === 'deadline_first') {
      sorted.sort((a, b) => b.urgencyScore - a.urgencyScore || b.deadlineScore - a.deadlineScore || b.priorityScore - a.priorityScore);
    } else if (strategyId === 'goal_impact_first') {
      sorted.sort((a, b) => b.goalAlignmentScore - a.goalAlignmentScore || b.importanceScore - a.importanceScore || b.priorityScore - a.priorityScore);
    } else if (strategyId === 'deep_focus_first') {
      sorted.sort((a, b) => b.effortScore - a.effortScore || b.importanceScore - a.importanceScore || b.priorityScore - a.priorityScore);
    } else if (strategyId === 'quick_win') {
      sorted.sort((a, b) => a.effortScore - b.effortScore || b.priorityScore - a.priorityScore);
    } else {
      // balanced_execution
      sorted.sort((a, b) => b.priorityScore - a.priorityScore || b.urgencyScore - a.urgencyScore);
    }

    const preferredPeriods = profile?.preferredPeriods || ['Morning', 'Afternoon'];

    return sorted.map((task, index) => {
      const isHighEffort = task.effortScore >= 0.6;
      const targetPeriod = isHighEffort && preferredPeriods.length > 0 ? preferredPeriods[0] : (preferredPeriods[1] || preferredPeriods[0] || 'Morning');
      const estMinutes = Math.round(task.effortScore * 120) || 30;

      let schedRec = `Execute in order position #${index + 1}.`;
      if (index === 0) {
        schedRec = `Top priority: begin during your prime ${targetPeriod} focus window.`;
      } else if (index === 1) {
        schedRec = `Second priority: execute immediately following position #1.`;
      } else {
        schedRec = `Execute after earlier positions during ${targetPeriod} available windows.`;
      }

      return {
        taskId: task.taskId,
        recommendedOrder: index + 1,
        estimatedDuration: estMinutes,
        preferredFocusPeriod: targetPeriod,
        schedulingRecommendation: schedRec,
        reason: task.rationale,
      };
    });
  }

  /**
   * Evaluates candidate availability windows for active tasks.
   */
  private generateScheduleRecommendations(
    tasks: Task[],
    freeWindows: FreeWindow[],
    profile: any
  ): TaskScheduleRecommendation[] {
    const recommendations: TaskScheduleRecommendation[] = [];

    for (const task of tasks) {
      if (freeWindows.length > 0) {
        const candidates = findCandidateWindowsForTask(task, freeWindows, profile);
        const recommendedWindows = candidates.slice(0, 3).map((c) => ({
          start: c.window.start,
          end: c.window.end,
          score: c.score,
          reason: c.reasons.join(' '),
        }));

        recommendations.push({
          taskId: task.id,
          recommendedWindows,
        });
      } else {
        // Fallback when calendar has no active free windows
        const estMinutes = task.estimatedMinutes || 30;
        recommendations.push({
          taskId: task.id,
          recommendedWindows: [
            {
              start: '09:00',
              end: `${Math.floor(9 + estMinutes / 60)}:${(estMinutes % 60).toString().padStart(2, '0')}`,
              score: 70,
              reason: 'Estimated default window based on standard morning working hours.',
            },
          ],
        });
      }
    }

    return recommendations;
  }

  /**
   * Identifies operational risks based on task metrics and availability.
   */
  private identifyRisks(
    summary: ObjectiveSummary,
    scoredTasks: PrioritizedItem[],
    availability: any
  ): string[] {
    const risks: string[] = [];

    if (summary.overdueTasks > 0) {
      risks.push(`${summary.overdueTasks} task(s) are currently overdue and require immediate rescheduling or completion.`);
    }

    const imminentCount = scoredTasks.filter((t) => t.deadlineScore >= 0.8 && t.deadlineScore < 1.0).length;
    if (imminentCount > 1) {
      risks.push(`Deadline clustering detected: ${imminentCount} high-urgency tasks are due within the next 48 hours.`);
    }

    if (summary.pendingTasks > 0 && summary.activeGoals === 0) {
      risks.push('Strategic disconnect: Tasks are active but no high-level strategic goals are currently active.');
    }

    if (availability && availability.totalFreeMinutes < 120 && summary.pendingTasks > 2) {
      risks.push(`Calendar contention: Only ${availability.totalFreeMinutes}m of free time remains today against ${summary.pendingTasks} pending tasks.`);
    }

    if (risks.length === 0) {
      risks.push('Workload and deadlines are well-balanced within current calendar constraints.');
    }

    return risks;
  }

  /**
   * Computes normalized plan confidence (0.0 to 1.0).
   */
  private calculateConfidence(
    summary: ObjectiveSummary,
    profile: any,
    availability: any
  ): number {
    let score = 0.5; // Baseline confidence

    if (profile) score += 0.15;
    if (summary.pendingTasks > 0) score += 0.15;
    if (summary.activeGoals > 0) score += 0.1;
    if (availability && availability.freeWindows.length > 0) score += 0.1;

    return Number(Math.min(1.0, Math.max(0.1, score)).toFixed(2));
  }

  /**
   * Builds concise executive rationale without leaking chain-of-thought.
   */
  private constructRationale(
    strategy: PlanningStrategyCandidate,
    summary: ObjectiveSummary,
    risks: string[],
    itemCount: number
  ): string {
    const parts: string[] = [
      `Selected ${strategy.name} (confidence score: ${(strategy.score * 100).toFixed(0)}%).`,
      strategy.description,
      `Orchestrated ${itemCount} pending item(s) across ${summary.activeGoals} active goal(s) and ${summary.activeProjects} active project(s).`,
    ];

    if (risks.length > 0 && !risks[0].includes('well-balanced')) {
      parts.push(`Primary mitigation focus: ${risks[0]}`);
    }

    return parts.join(' ');
  }
}

export const planningEngine = new PlanningEngine();
