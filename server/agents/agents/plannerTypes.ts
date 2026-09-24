/**
 * Specialized Planner Agent Types for Sentinel Nova (Day 5B.1)
 *
 * Defines strongly typed structures for the deliberative planning pipeline,
 * candidate strategies, prioritized items, execution sequencing, and schedule recommendations.
 */

export type PlanningStrategyId =
  | 'deadline_first'
  | 'goal_impact_first'
  | 'deep_focus_first'
  | 'balanced_execution'
  | 'quick_win';

export interface PlanningStrategyCandidate {
  id: PlanningStrategyId;
  name: string;
  description: string;
  score: number; // 0.0 - 1.0 (normalized)
  strengths: string[];
  tradeoffs: string[];
}

export interface ObjectiveSummary {
  totalGoals: number;
  activeGoals: number;
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  highPriorityTasks: number;
}

export interface PrioritizedItem {
  taskId: string;
  title: string;
  priorityScore: number; // 0.0 - 1.0
  urgencyScore: number; // 0.0 - 1.0
  importanceScore: number; // 0.0 - 1.0
  goalAlignmentScore: number; // 0.0 - 1.0
  deadlineScore: number; // 0.0 - 1.0
  effortScore: number; // 0.0 - 1.0
  recommendedOrder: number;
  rationale: string;
}

export interface ExecutionSequenceItem {
  taskId: string;
  recommendedOrder: number;
  estimatedDuration: number;
  preferredFocusPeriod?: string;
  schedulingRecommendation?: string;
  reason: string;
}

export interface RecommendedScheduleWindow {
  start: string;
  end: string;
  score: number; // 0 - 100
  reason: string;
}

export interface TaskScheduleRecommendation {
  taskId: string;
  recommendedWindows: RecommendedScheduleWindow[];
}

export interface PlannerOutput {
  recommendedStrategy: PlanningStrategyCandidate;
  strategyCandidates: PlanningStrategyCandidate[];
  objectiveSummary: ObjectiveSummary;
  prioritizedItems: PrioritizedItem[];
  executionSequence: ExecutionSequenceItem[];
  scheduleRecommendations: TaskScheduleRecommendation[];
  constraintsConsidered: string[];
  risks: string[];
  confidence: number; // 0.0 - 1.0
  rationale: string;
  reasoningSource: 'deterministic' | 'gemini_enhanced' | 'deterministic_fallback';
  metadata?: Record<string, any>;
}
