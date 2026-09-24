/**
 * Specialized Scheduler Agent Types for Sentinel Nova
 *
 * Defines strongly typed structures for scheduling strategy scoring,
 * candidate window evaluation, constraint resolution, and schedule generation.
 */

import { FreeWindow } from '../../../src/types';
import { AgentAction } from '../types';

export type SchedulingStrategy =
  | 'deadline_first'
  | 'focus_alignment'
  | 'balanced_day'
  | 'energy_match'
  | 'workload_balance'
  | 'workload_balanced'
  | 'goal_impact_first'
  | 'momentum';

export interface CandidateScheduleWindow {
  window: FreeWindow;
  taskId: string;
  taskTitle: string;
  taskDuration: number;
  fit: 'exact' | 'comfortable' | 'tight';
  score: number; // 0.0 - 1.0 normalized
  reasons: string[];
  suggestedStart: string; // ISO 8601 string
  suggestedEnd: string;   // ISO 8601 string
  conflictsDetected?: string[];
}

export interface StrategyScore {
  strategy: SchedulingStrategy;
  name: string;
  description: string;
  score: number; // 0.0 - 1.0 normalized
  rationale: string;
  candidateWindow?: CandidateScheduleWindow | null;
}

export interface SchedulingEvaluation {
  taskId: string;
  taskTitle: string;
  recommendedStrategy: SchedulingStrategy;
  strategyScores: StrategyScore[];
  bestWindow: CandidateScheduleWindow | null;
  alternativeWindows: CandidateScheduleWindow[];
  tradeoffs: string[];
  confidence: number; // 0.0 - 1.0 normalized
  reasoning: string;
}

export interface SchedulingResult {
  evaluations: SchedulingEvaluation[];
  recommendedActions: AgentAction[];
  unassignedTasks: Array<{
    taskId: string;
    title: string;
    reason: string;
  }>;
  overallConfidence: number; // 0.0 - 1.0 normalized
  summary: string;
  recommendation?: CandidateScheduleWindow | null;
  recommendedStrategy?: SchedulingStrategy;
  rationale?: string;
  alternatives?: CandidateScheduleWindow[];
}
