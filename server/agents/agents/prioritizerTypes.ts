/**
 * Specialized Prioritizer Agent Types for Sentinel Nova (Day 5B.2)
 *
 * Defines strongly typed contracts for multi-dimensional prioritization,
 * deliberative prioritization strategies, workload summary, and top recommendations.
 */

export type PrioritizationStrategyId =
  | 'urgency_first'
  | 'strategic_impact_first'
  | 'blocker_first'
  | 'momentum_first'
  | 'balanced_priority';

export interface PrioritizationStrategyCandidate {
  id: PrioritizationStrategyId;
  name: string;
  description: string;
  score: number; // Normalized 0.0 - 1.0
  strengths: string[];
  tradeoffs: string[];
}

export interface WorkloadSummary {
  totalTasks: number;
  activeTasks: number;
  overdueTasks: number;
  dueTodayTasks: number;
  highPriorityTasks: number;
  blockedTasks: number;
  blockingTasks: number;
  totalGoals: number;
  activeGoals: number;
  totalProjects: number;
  activeProjects: number;
}

export interface PrioritizedWorkItem {
  taskId: string;
  title: string;
  priorityScore: number; // 0.0 - 1.0 (bounded)
  urgencyScore: number; // 0.0 - 1.0
  importanceScore: number; // 0.0 - 1.0
  goalImpactScore: number; // 0.0 - 1.0
  projectImpactScore: number; // 0.0 - 1.0
  blockingImpactScore: number; // 0.0 - 1.0
  effortScore: number; // 0.0 - 1.0
  recommendedRank: number;
  rationale: string;
}

export interface TopPriorityRecommendation {
  rank: number;
  taskId: string;
  title: string;
  reason: string;
  actionRecommendation: string;
}

export interface PrioritizerOutput {
  recommendedStrategy: PrioritizationStrategyCandidate;
  strategyCandidates: PrioritizationStrategyCandidate[];
  workloadSummary: WorkloadSummary;
  prioritizedItems: PrioritizedWorkItem[];
  topRecommendations: TopPriorityRecommendation[];
  decisionFactors: string[];
  risks: string[];
  confidence: number; // 0.0 - 1.0
  rationale: string;
  reasoningSource: 'deterministic' | 'gemini_enhanced' | 'deterministic_fallback';
  metadata?: Record<string, unknown>;
}
