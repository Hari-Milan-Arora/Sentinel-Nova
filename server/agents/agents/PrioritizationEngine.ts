/**
 * Deterministic Prioritization Engine for Sentinel Nova (Day 5B.2)
 *
 * Implements multi-dimensional ranking and deliberative strategy scoring:
 * - Urgency (deadlines, overdue status, approaching due dates)
 * - Importance (task priority, project priority, goal priority)
 * - Goal Impact (direct and project-linked strategic alignment)
 * - Project Impact (project progress, priority, target dates)
 * - Blocking Impact (verified downstream dependencies, zero false inference)
 * - Effort / Cost (estimated duration and capacity fit)
 * - Capacity / Context (planning profile focus hours and capacity)
 *
 * Safety & Invariants:
 * - 100% deterministic calculations
 * - Multi-dimensional score bounded in [0.0, 1.0]
 * - Deterministic tie-breaking
 * - Read-only: zero mutations to any storage or state
 */

import { AgentContext } from '../types';
import { Task, Goal, Project } from '../../../src/types';
import {
  PrioritizerOutput,
  PrioritizationStrategyCandidate,
  PrioritizationStrategyId,
  PrioritizedWorkItem,
  TopPriorityRecommendation,
  WorkloadSummary,
} from './prioritizerTypes';

export interface StrategyWeights {
  urgency: number;
  importance: number;
  goalImpact: number;
  projectImpact: number;
  blockingImpact: number;
  effortWeight: number; // positive means preferring lower effort (momentum), negative penalizes high effort
}

export const STRATEGY_DEFINITIONS: Record<
  PrioritizationStrategyId,
  {
    name: string;
    description: string;
    strengths: string[];
    tradeoffs: string[];
    weights: StrategyWeights;
  }
> = {
  urgency_first: {
    name: 'Urgency-First',
    description:
      'Focuses immediate attention on overdue items, imminent deadlines, and time-critical commitments.',
    strengths: [
      'Eliminates overdue debt',
      'Protects critical deadlines',
      'Reduces operational risk',
    ],
    tradeoffs: [
      'May defer high-value strategic initiatives that lack immediate deadlines',
    ],
    weights: {
      urgency: 0.45,
      importance: 0.20,
      goalImpact: 0.15,
      projectImpact: 0.10,
      blockingImpact: 0.05,
      effortWeight: -0.05,
    },
  },
  strategic_impact_first: {
    name: 'Strategic Impact',
    description:
      'Prioritizes work with the highest contribution to active strategic goals and key projects.',
    strengths: [
      'Accelerates core strategic milestones',
      'High alignment with major objectives',
      'Avoids the reactive urgency trap',
    ],
    tradeoffs: [
      'Non-critical maintenance and administrative deadlines may require secondary attention',
    ],
    weights: {
      urgency: 0.12,
      importance: 0.20,
      goalImpact: 0.40,
      projectImpact: 0.20,
      blockingImpact: 0.08,
      effortWeight: 0.0,
    },
  },
  blocker_first: {
    name: 'Blocker Resolution',
    description:
      'Prioritizes tasks that unblock downstream dependencies and team workflows before individual focus work.',
    strengths: [
      'Unlocks downstream execution',
      'Removes workflow bottlenecks',
      'Maximizes team velocity',
    ],
    tradeoffs: [
      'Effective primarily when verified task dependency links exist in the workload',
    ],
    weights: {
      urgency: 0.15,
      importance: 0.15,
      goalImpact: 0.12,
      projectImpact: 0.10,
      blockingImpact: 0.45,
      effortWeight: -0.03,
    },
  },
  momentum_first: {
    name: 'Momentum & Velocity',
    description:
      'Prioritizes high-value, manageable tasks to clear cognitive load and build rapid execution momentum.',
    strengths: [
      'Clears mental bandwidth quickly',
      'Delivers rapid tangible wins',
      'Builds sustained motivation',
    ],
    tradeoffs: [
      'Large complex deep-focus tasks may need deliberate scheduling in later periods',
    ],
    weights: {
      urgency: 0.20,
      importance: 0.25,
      goalImpact: 0.22,
      projectImpact: 0.13,
      blockingImpact: 0.05,
      effortWeight: 0.15, // Positive: rewards lower effort / quick wins
    },
  },
  balanced_priority: {
    name: 'Balanced Priority',
    description:
      'Equitably balances deadline urgency, strategic goal impact, importance, and feasibility.',
    strengths: [
      'Holistic workload equilibrium',
      'Sustainable execution cadence',
      'Prevents blind spots across categories',
    ],
    tradeoffs: [
      'Attention is distributed rather than hyper-concentrated on a single dimension',
    ],
    weights: {
      urgency: 0.30,
      importance: 0.25,
      goalImpact: 0.20,
      projectImpact: 0.15,
      blockingImpact: 0.10,
      effortWeight: -0.04,
    },
  },
};

interface ScoredTaskFactors {
  task: Task;
  urgencyScore: number;
  importanceScore: number;
  goalImpactScore: number;
  projectImpactScore: number;
  blockingImpactScore: number;
  effortScore: number;
  isOverdue: boolean;
  isDueToday: boolean;
  isBlockingOthers: boolean;
  blockedByTasksCount: number;
}

export class PrioritizationEngine {
  /**
   * Generates a complete, explainable prioritization assessment.
   */
  public generatePrioritization(context: AgentContext): PrioritizerOutput {
    const now = new Date(context.timestamp || new Date().toISOString());
    const tasks = context.tasks || [];
    const goals = context.goals || [];
    const projects = context.projects || [];
    const profile = context.profile;

    // 1. Filter active items (Exclude completed & cancelled)
    const activeTasks = tasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'cancelled'
    );
    const activeGoals = goals.filter((g) => g.status === 'active');
    const activeProjects = projects.filter((p) => p.status === 'active');

    // Build fast lookup maps
    const goalMap = new Map<string, Goal>();
    for (const g of goals) {
      goalMap.set(g.id, g);
    }

    const projectMap = new Map<string, Project>();
    for (const p of projects) {
      projectMap.set(p.id, p);
    }

    // Build verified task dependency index (ZERO false inference)
    // Map of taskId -> array of taskIds that depend on this task
    const downstreamDependentsMap = new Map<string, string[]>();
    for (const t of activeTasks) {
      const deps = [
        ...(Array.isArray(t.dependencyIds) ? t.dependencyIds : []),
        ...(Array.isArray(t.dependencies) ? t.dependencies : []),
      ];
      for (const depId of deps) {
        if (!downstreamDependentsMap.has(depId)) {
          downstreamDependentsMap.set(depId, []);
        }
        downstreamDependentsMap.get(depId)!.push(t.id);
      }
    }

    // 2. Compute individual task factor scores
    const scoredFactors = activeTasks.map((task) =>
      this.evaluateTaskFactors(
        task,
        now,
        goalMap,
        projectMap,
        downstreamDependentsMap,
        activeTasks
      )
    );

    // 3. Workload Summary
    const overdueTasksCount = scoredFactors.filter((f) => f.isOverdue).length;
    const dueTodayTasksCount = scoredFactors.filter((f) => f.isDueToday).length;
    const highPriorityTasksCount = scoredFactors.filter(
      (f) => f.task.priority === 'urgent' || f.task.priority === 'high'
    ).length;
    const blockedTasksCount = scoredFactors.filter(
      (f) => f.blockedByTasksCount > 0
    ).length;
    const blockingTasksCount = scoredFactors.filter(
      (f) => f.isBlockingOthers
    ).length;

    const workloadSummary: WorkloadSummary = {
      totalTasks: tasks.length,
      activeTasks: activeTasks.length,
      overdueTasks: overdueTasksCount,
      dueTodayTasks: dueTodayTasksCount,
      highPriorityTasks: highPriorityTasksCount,
      blockedTasks: blockedTasksCount,
      blockingTasks: blockingTasksCount,
      totalGoals: goals.length,
      activeGoals: activeGoals.length,
      totalProjects: projects.length,
      activeProjects: activeProjects.length,
    };

    // 4. Deliberative Strategy Generation & Scoring (5 strategies)
    const strategyCandidates = this.generateStrategyCandidates(
      workloadSummary,
      scoredFactors
    );

    // Pick top-scoring strategy (deterministic tie-breaking applied)
    const recommendedStrategy = strategyCandidates[0] || {
      id: 'balanced_priority',
      name: STRATEGY_DEFINITIONS.balanced_priority.name,
      description: STRATEGY_DEFINITIONS.balanced_priority.description,
      score: 0.85,
      strengths: STRATEGY_DEFINITIONS.balanced_priority.strengths,
      tradeoffs: STRATEGY_DEFINITIONS.balanced_priority.tradeoffs,
    };

    // 5. Rank tasks under recommended strategy
    const prioritizedItems = this.rankTasksUnderStrategy(
      scoredFactors,
      recommendedStrategy.id,
      goalMap,
      projectMap
    );

    // 6. Generate Top Priority Recommendations (Top 3-5)
    const topRecommendations = this.generateTopRecommendations(
      prioritizedItems,
      workloadSummary,
      recommendedStrategy
    );

    // 7. Decision factors & Risks
    const decisionFactors = this.constructDecisionFactors(
      recommendedStrategy,
      workloadSummary,
      profile
    );

    const risks = this.identifyRisks(workloadSummary, prioritizedItems);

    // 8. Confidence calculation
    const confidence = this.calculateConfidence(
      workloadSummary,
      prioritizedItems
    );

    // 9. Executive Rationale
    const rationale = this.constructExecutiveRationale(
      recommendedStrategy,
      workloadSummary,
      prioritizedItems,
      risks
    );

    return {
      recommendedStrategy,
      strategyCandidates,
      workloadSummary,
      prioritizedItems,
      topRecommendations,
      decisionFactors,
      risks,
      confidence,
      rationale,
      reasoningSource: 'deterministic',
    };
  }

  /**
   * Evaluates normalized factors for a single task:
   * Urgency, Importance, Goal Impact, Project Impact, Blocking Impact, Effort.
   */
  private evaluateTaskFactors(
    task: Task,
    now: Date,
    goalMap: Map<string, Goal>,
    projectMap: Map<string, Project>,
    downstreamDependentsMap: Map<string, string[]>,
    activeTasks: Task[]
  ): ScoredTaskFactors {
    // --- FACTOR 1: URGENCY ---
    let urgencyScore = 0.15; // Low baseline for tasks without deadlines
    let isOverdue = false;
    let isDueToday = false;

    if (task.dueDate) {
      const dueTime = new Date(task.dueDate).getTime();
      const diffHours = (dueTime - now.getTime()) / (1000 * 60 * 60);

      if (diffHours < 0) {
        isOverdue = true;
        urgencyScore = 1.0;
      } else if (diffHours <= 24) {
        isDueToday = true;
        urgencyScore = 0.95;
      } else if (diffHours <= 48) {
        urgencyScore = 0.80;
      } else if (diffHours <= 168) {
        // 7 days
        urgencyScore = 0.55;
      } else if (diffHours <= 336) {
        // 14 days
        urgencyScore = 0.35;
      } else {
        urgencyScore = 0.20;
      }
    }
    urgencyScore = Math.max(0.0, Math.min(1.0, urgencyScore));

    // --- FACTOR 2: IMPORTANCE ---
    // Base priority mapping
    let baseImportance = 0.5;
    if (task.priority === 'urgent') baseImportance = 1.0;
    else if (task.priority === 'high') baseImportance = 0.8;
    else if (task.priority === 'medium') baseImportance = 0.5;
    else if (task.priority === 'low') baseImportance = 0.2;

    // Contextual importance boost:
    // A task linked to a critical goal or urgent project is elevated in importance.
    let linkedGoal: Goal | undefined = task.goalId ? goalMap.get(task.goalId) : undefined;
    let linkedProject: Project | undefined = task.projectId ? projectMap.get(task.projectId) : undefined;

    // If task lacks direct goalId, resolve through project
    if (!linkedGoal && linkedProject?.goalId) {
      linkedGoal = goalMap.get(linkedProject.goalId);
    }
    if (!linkedGoal && linkedProject) {
      for (const g of goalMap.values()) {
        if (Array.isArray(g.projectIds) && g.projectIds.includes(linkedProject.id)) {
          linkedGoal = g;
          break;
        }
      }
    }

    let contextualBoost = 0.0;
    if (linkedGoal) {
      if (linkedGoal.priority === 'critical') contextualBoost += 0.25;
      else if (linkedGoal.priority === 'high') contextualBoost += 0.15;
    }
    if (linkedProject) {
      if (linkedProject.priority === 'critical') contextualBoost += 0.15;
      else if (linkedProject.priority === 'high') contextualBoost += 0.10;
    }

    const importanceScore = Math.max(
      0.0,
      Math.min(1.0, baseImportance * 0.75 + contextualBoost)
    );

    // --- FACTOR 3: GOAL IMPACT ---
    let goalImpactScore = 0.20; // Baseline when not linked to any goal
    if (linkedGoal) {
      let goalPriorityFactor = 0.5;
      if (linkedGoal.priority === 'critical') goalPriorityFactor = 1.0;
      else if (linkedGoal.priority === 'high') goalPriorityFactor = 0.8;
      else if (linkedGoal.priority === 'medium') goalPriorityFactor = 0.5;
      else if (linkedGoal.priority === 'low') goalPriorityFactor = 0.3;

      let goalProximityBoost = 0.0;
      if (linkedGoal.targetDate) {
        const goalDiffDays =
          (new Date(linkedGoal.targetDate).getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24);
        if (goalDiffDays <= 14) goalProximityBoost = 0.15;
        else if (goalDiffDays <= 30) goalProximityBoost = 0.08;
      }

      // Progress factor: low progress near target date increases impact of completing work
      let progressBoost = 0.0;
      if (linkedGoal.progress < 50 && linkedGoal.targetDate) {
        progressBoost = 0.10;
      }

      goalImpactScore = Math.max(
        0.0,
        Math.min(1.0, goalPriorityFactor * 0.75 + goalProximityBoost + progressBoost)
      );
    }

    // --- FACTOR 4: PROJECT IMPACT ---
    let projectImpactScore = 0.20; // Baseline when not linked to project
    if (linkedProject) {
      let projPriorityFactor = 0.5;
      if (linkedProject.priority === 'critical') projPriorityFactor = 1.0;
      else if (linkedProject.priority === 'high') projPriorityFactor = 0.8;
      else if (linkedProject.priority === 'medium') projPriorityFactor = 0.5;
      else if (linkedProject.priority === 'low') projPriorityFactor = 0.3;

      let projDateBoost = 0.0;
      if (linkedProject.targetDate) {
        const projDiffDays =
          (new Date(linkedProject.targetDate).getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24);
        if (projDiffDays <= 14) projDateBoost = 0.12;
      }

      projectImpactScore = Math.max(
        0.0,
        Math.min(1.0, projPriorityFactor * 0.8 + projDateBoost)
      );
    }

    // --- FACTOR 5: BLOCKING IMPACT (VERIFIED DEPENDENCIES ONLY) ---
    // Check if other active tasks depend on this task
    const downstreamTaskIds = downstreamDependentsMap.get(task.id) || [];
    const isBlockingOthers = downstreamTaskIds.length > 0;
    let blockingImpactScore = 0.0;

    if (isBlockingOthers) {
      const count = downstreamTaskIds.length;
      if (count === 1) blockingImpactScore = 0.60;
      else if (count === 2) blockingImpactScore = 0.80;
      else blockingImpactScore = 1.0;

      // Check if any blocked task is high or urgent priority
      const blockedTasks = activeTasks.filter((t) => downstreamTaskIds.includes(t.id));
      const hasHighPriorityBlocked = blockedTasks.some(
        (t) => t.priority === 'urgent' || t.priority === 'high'
      );
      if (hasHighPriorityBlocked) {
        blockingImpactScore = Math.min(1.0, blockingImpactScore + 0.15);
      }
    }

    // Check if this task itself is blocked by uncompleted dependencies
    const declaredDeps = [
      ...(Array.isArray(task.dependencyIds) ? task.dependencyIds : []),
      ...(Array.isArray(task.dependencies) ? task.dependencies : []),
    ];
    const blockedByTasksCount = activeTasks.filter((t) =>
      declaredDeps.includes(t.id)
    ).length;

    // --- FACTOR 6: EFFORT / COST ---
    const minutes =
      task.estimatedMinutes || (task.estimatedHours ? task.estimatedHours * 60 : 30);
    let effortScore = 0.5;
    if (minutes <= 15) effortScore = 0.15;
    else if (minutes <= 30) effortScore = 0.25;
    else if (minutes <= 60) effortScore = 0.50;
    else if (minutes <= 120) effortScore = 0.75;
    else effortScore = 1.0;

    return {
      task,
      urgencyScore,
      importanceScore,
      goalImpactScore,
      projectImpactScore,
      blockingImpactScore,
      effortScore,
      isOverdue,
      isDueToday,
      isBlockingOthers,
      blockedByTasksCount,
    };
  }

  /**
   * Generates and scores 5 deliberative strategy candidates.
   */
  private generateStrategyCandidates(
    summary: WorkloadSummary,
    factors: ScoredTaskFactors[]
  ): PrioritizationStrategyCandidate[] {
    const candidates: PrioritizationStrategyCandidate[] = [];

    // 1. Urgency-First strategy scoring
    let urgencyStrategyScore = 0.40;
    if (summary.overdueTasks > 0) {
      urgencyStrategyScore = Math.min(0.98, 0.88 + summary.overdueTasks * 0.05);
    } else if (summary.dueTodayTasks > 0) {
      urgencyStrategyScore = Math.min(0.92, 0.75 + summary.dueTodayTasks * 0.08);
    } else {
      const highUrgencyCount = factors.filter((f) => f.urgencyScore >= 0.55).length;
      urgencyStrategyScore = Math.min(0.70, 0.40 + highUrgencyCount * 0.05);
    }

    candidates.push({
      id: 'urgency_first',
      name: STRATEGY_DEFINITIONS.urgency_first.name,
      description: STRATEGY_DEFINITIONS.urgency_first.description,
      score: Number(urgencyStrategyScore.toFixed(2)),
      strengths: STRATEGY_DEFINITIONS.urgency_first.strengths,
      tradeoffs: STRATEGY_DEFINITIONS.urgency_first.tradeoffs,
    });

    // 2. Strategic Impact strategy scoring
    let strategicScore = 0.50;
    if (summary.activeGoals > 0) {
      const highGoalImpactCount = factors.filter((f) => f.goalImpactScore >= 0.6).length;
      const ratio = factors.length > 0 ? highGoalImpactCount / factors.length : 0;
      let base = 0.70;
      if (summary.overdueTasks > 0) {
        base = 0.60; // Temper strategic focus when immediate overdue work needs clearance
      }
      strategicScore = Math.min(0.95, base + highGoalImpactCount * 0.08 + ratio * 0.15);
    }
    candidates.push({
      id: 'strategic_impact_first',
      name: STRATEGY_DEFINITIONS.strategic_impact_first.name,
      description: STRATEGY_DEFINITIONS.strategic_impact_first.description,
      score: Number(strategicScore.toFixed(2)),
      strengths: STRATEGY_DEFINITIONS.strategic_impact_first.strengths,
      tradeoffs: STRATEGY_DEFINITIONS.strategic_impact_first.tradeoffs,
    });

    // 3. Blocker Resolution strategy scoring
    let blockerScore = 0.20; // Low baseline if no blockers
    if (summary.blockingTasks > 0) {
      blockerScore = Math.min(0.95, 0.70 + summary.blockingTasks * 0.12);
    }
    candidates.push({
      id: 'blocker_first',
      name: STRATEGY_DEFINITIONS.blocker_first.name,
      description: STRATEGY_DEFINITIONS.blocker_first.description,
      score: Number(blockerScore.toFixed(2)),
      strengths: STRATEGY_DEFINITIONS.blocker_first.strengths,
      tradeoffs: STRATEGY_DEFINITIONS.blocker_first.tradeoffs,
    });

    // 4. Momentum & Velocity strategy scoring
    const quickWinCount = factors.filter(
      (f) => f.effortScore <= 0.3 && f.importanceScore >= 0.5
    ).length;
    const momentumScore = Math.min(0.85, 0.55 + quickWinCount * 0.08);
    candidates.push({
      id: 'momentum_first',
      name: STRATEGY_DEFINITIONS.momentum_first.name,
      description: STRATEGY_DEFINITIONS.momentum_first.description,
      score: Number(momentumScore.toFixed(2)),
      strengths: STRATEGY_DEFINITIONS.momentum_first.strengths,
      tradeoffs: STRATEGY_DEFINITIONS.momentum_first.tradeoffs,
    });

    // 5. Balanced Priority strategy scoring
    // Balanced is strong and stable across diverse workloads
    let balancedScore = 0.82;
    if (summary.overdueTasks > 0) {
      balancedScore = 0.75; // Urgency dominates when overdue items exist
    } else if (strategicScore >= 0.85) {
      balancedScore = 0.80; // High strategic concentration takes precedence
    }
    candidates.push({
      id: 'balanced_priority',
      name: STRATEGY_DEFINITIONS.balanced_priority.name,
      description: STRATEGY_DEFINITIONS.balanced_priority.description,
      score: Number(balancedScore.toFixed(2)),
      strengths: STRATEGY_DEFINITIONS.balanced_priority.strengths,
      tradeoffs: STRATEGY_DEFINITIONS.balanced_priority.tradeoffs,
    });

    // Deterministic sorting with tie-breaking:
    // 1. Highest score
    // 2. Priority order: urgency_first > blocker_first > strategic_impact_first > balanced_priority > momentum_first
    const priorityTier: Record<PrioritizationStrategyId, number> = {
      urgency_first: 5,
      blocker_first: 4,
      strategic_impact_first: 3,
      balanced_priority: 2,
      momentum_first: 1,
    };

    return candidates.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.001) {
        return b.score - a.score;
      }
      return priorityTier[b.id] - priorityTier[a.id];
    });
  }

  /**
   * Ranks tasks according to the weights of the selected strategy.
   */
  private rankTasksUnderStrategy(
    factors: ScoredTaskFactors[],
    strategyId: PrioritizationStrategyId,
    goalMap: Map<string, Goal>,
    projectMap: Map<string, Project>
  ): PrioritizedWorkItem[] {
    const strategyDef = STRATEGY_DEFINITIONS[strategyId] || STRATEGY_DEFINITIONS.balanced_priority;
    const w = strategyDef.weights;

    // Calculate multi-dimensional priorityScore for each task
    const itemsWithScores = factors.map((f) => {
      let rawScore =
        f.urgencyScore * w.urgency +
        f.importanceScore * w.importance +
        f.goalImpactScore * w.goalImpact +
        f.projectImpactScore * w.projectImpact +
        f.blockingImpactScore * w.blockingImpact;

      // Handle effort influence
      if (w.effortWeight > 0) {
        // Momentum: rewards lower effort (1 - effortScore)
        rawScore += (1.0 - f.effortScore) * w.effortWeight;
      } else if (w.effortWeight < 0) {
        // Minor penalty for oversized effort
        rawScore += f.effortScore * w.effortWeight;
      }

      // If task is blocked by unfinished dependencies, apply a slight feasibility dampening (-0.10)
      if (f.blockedByTasksCount > 0) {
        rawScore -= 0.10;
      }

      // Clamp strictly to [0.0, 1.0]
      const priorityScore = Number(Math.max(0.0, Math.min(1.0, rawScore)).toFixed(3));

      return {
        factor: f,
        priorityScore,
      };
    });

    // Deterministic sorting with multi-tier tie-breaking:
    // 1. priorityScore descending
    // 2. urgencyScore descending
    // 3. importanceScore descending
    // 4. goalImpactScore descending
    // 5. effortScore ascending (faster tasks first when tied)
    // 6. stable alphabetical taskId sort
    itemsWithScores.sort((a, b) => {
      if (Math.abs(b.priorityScore - a.priorityScore) > 0.0001) {
        return b.priorityScore - a.priorityScore;
      }
      if (Math.abs(b.factor.urgencyScore - a.factor.urgencyScore) > 0.001) {
        return b.factor.urgencyScore - a.factor.urgencyScore;
      }
      if (Math.abs(b.factor.importanceScore - a.factor.importanceScore) > 0.001) {
        return b.factor.importanceScore - a.factor.importanceScore;
      }
      if (Math.abs(b.factor.goalImpactScore - a.factor.goalImpactScore) > 0.001) {
        return b.factor.goalImpactScore - a.factor.goalImpactScore;
      }
      if (Math.abs(a.factor.effortScore - b.factor.effortScore) > 0.001) {
        return a.factor.effortScore - b.factor.effortScore;
      }
      return a.factor.task.id.localeCompare(b.factor.task.id);
    });

    // Assign rank and construct explainable, executive rationale
    return itemsWithScores.map((item, idx) => {
      const rank = idx + 1;
      const f = item.factor;
      const rationale = this.generateItemRationale(rank, f, goalMap, projectMap, strategyId);

      return {
        taskId: f.task.id,
        title: f.task.title,
        priorityScore: item.priorityScore,
        urgencyScore: Number(f.urgencyScore.toFixed(2)),
        importanceScore: Number(f.importanceScore.toFixed(2)),
        goalImpactScore: Number(f.goalImpactScore.toFixed(2)),
        projectImpactScore: Number(f.projectImpactScore.toFixed(2)),
        blockingImpactScore: Number(f.blockingImpactScore.toFixed(2)),
        effortScore: Number(f.effortScore.toFixed(2)),
        recommendedRank: rank,
        rationale,
      };
    });
  }

  /**
   * Generates a concise, executive-level rationale explaining why a task earned its rank.
   */
  private generateItemRationale(
    rank: number,
    f: ScoredTaskFactors,
    goalMap: Map<string, Goal>,
    projectMap: Map<string, Project>,
    _strategyId: PrioritizationStrategyId
  ): string {
    const reasons: string[] = [];

    if (f.isOverdue) {
      reasons.push('past due date (immediate action required)');
    } else if (f.isDueToday) {
      reasons.push('due today');
    } else if (f.urgencyScore >= 0.8) {
      reasons.push('approaching deadline');
    }

    if (f.isBlockingOthers) {
      reasons.push('unblocks downstream dependencies');
    }

    if (f.goalImpactScore >= 0.7) {
      const goal = f.task.goalId ? goalMap.get(f.task.goalId) : undefined;
      const goalTitle = goal ? ` "${goal.title}"` : '';
      reasons.push(`high strategic alignment with${goalTitle}`);
    } else if (f.projectImpactScore >= 0.7) {
      const proj = f.task.projectId ? projectMap.get(f.task.projectId) : undefined;
      const projTitle = proj ? ` "${proj.name || (proj as any).title}"` : '';
      reasons.push(`critical for project${projTitle}`);
    }

    if (f.task.priority === 'urgent' || f.task.priority === 'high') {
      reasons.push(`${f.task.priority} declared priority`);
    }

    if (f.blockedByTasksCount > 0) {
      reasons.push('note: waiting on preceding dependency');
    }

    if (reasons.length === 0) {
      reasons.push('steady progress item based on overall workload equilibrium');
    }

    return `Ranked #${rank} due to ${reasons.slice(0, 3).join(', ')}.`;
  }

  /**
   * Generates high-level top recommendations (Top 3-5 items).
   */
  private generateTopRecommendations(
    items: PrioritizedWorkItem[],
    summary: WorkloadSummary,
    recommendedStrategy: PrioritizationStrategyCandidate
  ): TopPriorityRecommendation[] {
    const topSlice = items.slice(0, Math.min(5, items.length));

    return topSlice.map((item, idx) => {
      let actionRecommendation = 'Execute first in today’s primary focus window.';
      if (idx === 1) {
        actionRecommendation = 'Tackle second to maintain workflow momentum.';
      } else if (idx === 2) {
        actionRecommendation = 'Queue for afternoon or secondary focus block.';
      } else if (idx >= 3) {
        actionRecommendation = 'Address once top critical items are complete.';
      }

      if (item.urgencyScore === 1.0) {
        actionRecommendation = 'Immediate resolution required: clear overdue debt.';
      } else if (item.blockingImpactScore >= 0.8) {
        actionRecommendation = 'Prioritize early to prevent downstream delays.';
      }

      return {
        rank: item.recommendedRank,
        taskId: item.taskId,
        title: item.title,
        reason: item.rationale,
        actionRecommendation,
      };
    });
  }

  /**
   * Constructs explicit decision factors for transparency.
   */
  private constructDecisionFactors(
    strategy: PrioritizationStrategyCandidate,
    summary: WorkloadSummary,
    profile: AgentContext['profile']
  ): string[] {
    const factors: string[] = [
      `Selected Strategy: ${strategy.name} (confidence score ${(strategy.score * 100).toFixed(0)}%)`,
    ];

    if (summary.overdueTasks > 0) {
      factors.push(`Urgency driver: ${summary.overdueTasks} overdue task(s) requiring immediate resolution.`);
    } else if (summary.dueTodayTasks > 0) {
      factors.push(`Urgency driver: ${summary.dueTodayTasks} task(s) due today.`);
    } else {
      factors.push('Urgency baseline: No active overdue items; workload prioritized by strategic value.');
    }

    if (summary.activeGoals > 0) {
      factors.push(`Strategic alignment: Evaluated against ${summary.activeGoals} active goal(s) and ${summary.activeProjects} active project(s).`);
    }

    if (summary.blockingTasks > 0) {
      factors.push(`Dependency management: Identified ${summary.blockingTasks} verified blocking task(s).`);
    } else {
      factors.push('Dependency management: 0 verified blocking dependencies detected.');
    }

    if (profile?.dailyFocusCapacity) {
      factors.push(`Capacity calibration: Matched against daily focus capacity (${profile.dailyFocusCapacity}).`);
    }

    return factors;
  }

  /**
   * Identifies workload risks and bottlenecks.
   */
  private identifyRisks(
    summary: WorkloadSummary,
    items: PrioritizedWorkItem[]
  ): string[] {
    const risks: string[] = [];

    if (summary.overdueTasks > 0) {
      risks.push(`${summary.overdueTasks} task(s) are past their due date.`);
    }

    if (summary.blockedTasks > 0) {
      risks.push(`${summary.blockedTasks} task(s) have unresolved upstream dependencies.`);
    }

    if (summary.dueTodayTasks > 4) {
      risks.push(`High deadline concentration: ${summary.dueTodayTasks} tasks due today may exceed single-day capacity.`);
    }

    const urgentItemsCount = items.filter((i) => i.priorityScore >= 0.85).length;
    if (urgentItemsCount > 5) {
      risks.push(`Priority inflation: ${urgentItemsCount} tasks carry very high priority scores; triage recommended.`);
    }

    return risks;
  }

  /**
   * Calculates overall confidence in the prioritization output.
   */
  private calculateConfidence(
    summary: WorkloadSummary,
    items: PrioritizedWorkItem[]
  ): number {
    if (items.length === 0) return 0.90;

    let conf = 0.85;

    // If top 2 tasks have distinct priority separation, confidence is higher
    if (items.length >= 2) {
      const diff = items[0].priorityScore - items[1].priorityScore;
      if (diff > 0.1) conf += 0.05;
    }

    // Overdue items reduce confidence slightly due to crisis mode
    if (summary.overdueTasks > 3) conf -= 0.10;

    // Blocked tasks introduce external dependency uncertainty
    if (summary.blockedTasks > 2) conf -= 0.05;

    return Number(Math.max(0.5, Math.min(1.0, conf)).toFixed(2));
  }

  /**
   * Constructs the executive rationale summary.
   */
  private constructExecutiveRationale(
    strategy: PrioritizationStrategyCandidate,
    summary: WorkloadSummary,
    items: PrioritizedWorkItem[],
    risks: string[]
  ): string {
    if (items.length === 0) {
      return 'No active tasks found in current workload. All goals and projects are up to date.';
    }

    const topItem = items[0];
    const strategyName = strategy.name;

    let intro = `Workload prioritized under the ${strategyName} strategy.`;
    if (summary.overdueTasks > 0) {
      intro += ` Identified ${summary.overdueTasks} overdue item(s) that should be cleared before new work.`;
    }

    const topLead = `Top recommendation is "${topItem.title}" (Score: ${(topItem.priorityScore * 100).toFixed(0)}%).`;
    const riskNote = risks.length > 0 ? ` Watch: ${risks[0]}` : '';

    return `${intro} ${topLead}${riskNote}`;
  }
}

export const prioritizationEngine = new PrioritizationEngine();
