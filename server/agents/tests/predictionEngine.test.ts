import assert from 'node:assert/strict';
import { PredictionEngine } from '../../../src/utils/predictionEngine';
import type { Goal, Task } from '../../../src/types';

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1', userId: 'user-1', title: 'Write tests', status: 'todo', priority: 'high',
  estimatedMinutes: 120, tags: [], subtasks: [], dependencyIds: [],
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'goal-1', userId: 'user-1', title: 'Complete project', status: 'active', priority: 'high',
  progress: 50, projectIds: [], createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

assert.equal(PredictionEngine.calculateTaskPredictions([task({ dueDate: '2020-01-01' })])[0].completionProbability, 0);
assert.equal(PredictionEngine.calculateTaskPredictions([task()])[0].predictionSource, 'deterministic_heuristic');
assert.equal(PredictionEngine.calculateTaskPredictions([task()])[0].predictionDataStatus, 'insufficient');

const unassessedGoal = PredictionEngine.calculateGoalSuccess([goal()], [task({ status: 'completed' })])[0];
assert.equal(unassessedGoal.successProbability, null, 'No trained goal model or historical progress must not imply a probability');
assert.equal(unassessedGoal.predictionDataStatus, 'insufficient');
assert.equal(unassessedGoal.riskLevel, 'unknown');

const completedGoal = PredictionEngine.calculateGoalSuccess([goal({ progress: 100 })], [])[0];
assert.equal(completedGoal.successProbability, 100, 'Recorded completion is an application fact');

const burnout = PredictionEngine.calculateBurnoutAndProductivity([task()]);
assert.equal(burnout.burnoutRisk, 'unknown');
assert.equal(burnout.burnoutScore, undefined);
assert.deepEqual(burnout.productivityTrend, []);
assert.equal(PredictionEngine.getEngineMetrics().validationStatus, 'not_evaluated');

console.log('Prediction engine honesty and bounds tests passed.');
