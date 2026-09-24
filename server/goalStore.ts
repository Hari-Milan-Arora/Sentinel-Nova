import fs from 'fs/promises';
import path from 'path';
import { Goal, GoalPriority, GoalStatus } from '../src/types';

export interface ServerGoal extends Goal {}

const DATA_DIR = path.join(process.cwd(), 'data');
const GOALS_FILE = path.join(DATA_DIR, 'goals.json');

let goalsCache: Record<string, ServerGoal[]> | null = null;

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    // Already exists or created
  }
}

async function loadGoals(): Promise<Record<string, ServerGoal[]>> {
  if (goalsCache) return goalsCache;
  await ensureDataDir();
  try {
    const raw = await fs.readFile(GOALS_FILE, 'utf-8');
    goalsCache = JSON.parse(raw);
    return goalsCache!;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      goalsCache = {};
      return goalsCache;
    }
    console.error('Error reading goals file, initializing empty store:', err);
    goalsCache = {};
    return goalsCache;
  }
}

async function persistGoals(): Promise<void> {
  await ensureDataDir();
  const dataToSave = goalsCache || {};
  await fs.writeFile(GOALS_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
}

export function validateGoalInput(
  input: any,
  isUpdate = false
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Goal data must be an object.'] };
  }

  if (!isUpdate || input.title !== undefined) {
    if (!input.title || typeof input.title !== 'string' || !input.title.trim()) {
      errors.push('Goal title is required.');
    }
  }

  if (input.status !== undefined) {
    const validStatuses: GoalStatus[] = ['active', 'completed', 'archived'];
    if (!validStatuses.includes(input.status)) {
      errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}.`);
    }
  }

  if (input.priority !== undefined) {
    const validPriorities: GoalPriority[] = ['low', 'medium', 'high', 'critical'];
    if (!validPriorities.includes(input.priority)) {
      errors.push(`Invalid priority. Must be one of: ${validPriorities.join(', ')}.`);
    }
  }

  if (input.progress !== undefined) {
    const p = Number(input.progress);
    if (isNaN(p) || p < 0 || p > 100) {
      errors.push('Progress must be a number between 0 and 100.');
    }
  }

  if (input.projectIds !== undefined && !Array.isArray(input.projectIds)) {
    errors.push('projectIds must be an array of strings.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function getGoalsByUser(userId: string): Promise<ServerGoal[]> {
  const store = await loadGoals();
  if (!store[userId]) {
    const now = new Date();
    const seedGoals: ServerGoal[] = [
      {
        id: 'goal_seed_portfolio',
        userId,
        title: 'Build production-ready AI engineering portfolio',
        description: 'Ship high-leverage autonomous agents, scalable architectures, and measurable systems.',
        status: 'active',
        priority: 'high',
        targetDate: '2026-12-31',
        progress: 35,
        projectIds: ['proj_seed_nova'],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        category: 'career',
        riskLevel: 'low',
        successProbability: 85,
        failureProbability: 15,
        predictedMilestoneDelay: false,
        aiRecoveryPlan: ['Maintain dedicated focus block for Sentinel Nova execution.'],
        reasoning: 'Steady weekly velocity with clear milestone boundaries.',
      },
    ];

    store[userId] = seedGoals;
    await persistGoals();
  }
  return [...store[userId]];
}

export async function getGoalById(userId: string, goalId: string): Promise<ServerGoal | null> {
  const userGoals = await getGoalsByUser(userId);
  const found = userGoals.find(g => g.id === goalId);
  return found ? { ...found } : null;
}

export async function createGoal(userId: string, input: any): Promise<ServerGoal> {
  const store = await loadGoals();
  if (!store[userId]) {
    store[userId] = [];
  }

  const now = new Date().toISOString();
  const newGoal: ServerGoal = {
    id: `goal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId,
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    status: input.status || 'active',
    priority: input.priority || 'medium',
    targetDate: input.targetDate || undefined,
    progress: Math.min(100, Math.max(0, input.progress !== undefined ? Number(input.progress) : 0)),
    projectIds: Array.isArray(input.projectIds) ? input.projectIds : [],
    createdAt: now,
    updatedAt: now,
    category: input.category || 'project',
    riskLevel: input.riskLevel || 'low',
    successProbability: input.successProbability || 50,
    failureProbability: input.failureProbability || 50,
    predictedMilestoneDelay: Boolean(input.predictedMilestoneDelay),
    aiRecoveryPlan: Array.isArray(input.aiRecoveryPlan) ? input.aiRecoveryPlan : [],
    reasoning: input.reasoning || '',
  };

  store[userId].unshift(newGoal);
  await persistGoals();
  return { ...newGoal };
}

export async function updateGoal(
  userId: string,
  goalId: string,
  updates: any
): Promise<ServerGoal | null> {
  const store = await loadGoals();
  if (!store[userId]) return null;

  const idx = store[userId].findIndex(g => g.id === goalId);
  if (idx === -1) return null;

  const current = store[userId][idx];
  const now = new Date().toISOString();

  let nextProgress = current.progress;
  if (updates.progress !== undefined) {
    nextProgress = Math.min(100, Math.max(0, Number(updates.progress)));
  }

  const updatedGoal: ServerGoal = {
    ...current,
    title: updates.title !== undefined ? updates.title.trim() : current.title,
    description: updates.description !== undefined ? updates.description.trim() || undefined : current.description,
    status: updates.status !== undefined ? updates.status : current.status,
    priority: updates.priority !== undefined ? updates.priority : current.priority,
    targetDate: updates.targetDate !== undefined ? updates.targetDate : current.targetDate,
    progress: nextProgress,
    projectIds: updates.projectIds !== undefined && Array.isArray(updates.projectIds) ? updates.projectIds : current.projectIds,
    category: updates.category !== undefined ? updates.category : current.category,
    riskLevel: updates.riskLevel !== undefined ? updates.riskLevel : current.riskLevel,
    successProbability: updates.successProbability !== undefined ? updates.successProbability : current.successProbability,
    failureProbability: updates.failureProbability !== undefined ? updates.failureProbability : current.failureProbability,
    predictedMilestoneDelay: updates.predictedMilestoneDelay !== undefined ? updates.predictedMilestoneDelay : current.predictedMilestoneDelay,
    aiRecoveryPlan: updates.aiRecoveryPlan !== undefined ? updates.aiRecoveryPlan : current.aiRecoveryPlan,
    reasoning: updates.reasoning !== undefined ? updates.reasoning : current.reasoning,
    updatedAt: now,
  };

  store[userId][idx] = updatedGoal;
  await persistGoals();
  return { ...updatedGoal };
}

export async function deleteGoal(userId: string, goalId: string): Promise<boolean> {
  const store = await loadGoals();
  if (!store[userId]) return false;

  const initialLen = store[userId].length;
  store[userId] = store[userId].filter(g => g.id !== goalId);

  if (store[userId].length !== initialLen) {
    await persistGoals();
    return true;
  }
  return false;
}

export async function completeGoal(userId: string, goalId: string): Promise<ServerGoal | null> {
  return updateGoal(userId, goalId, {
    status: 'completed',
    progress: 100,
  });
}

export async function archiveGoal(userId: string, goalId: string): Promise<ServerGoal | null> {
  return updateGoal(userId, goalId, {
    status: 'archived',
  });
}

export async function linkProjectToGoal(userId: string, goalId: string, projectId: string): Promise<void> {
  const store = await loadGoals();
  if (!store[userId]) return;

  const goal = store[userId].find(g => g.id === goalId);
  if (!goal) return;

  if (!goal.projectIds.includes(projectId)) {
    goal.projectIds.push(projectId);
    goal.updatedAt = new Date().toISOString();
    await persistGoals();
  }
}

export async function unlinkProjectFromGoal(userId: string, goalId: string, projectId: string): Promise<void> {
  const store = await loadGoals();
  if (!store[userId]) return;

  const goal = store[userId].find(g => g.id === goalId);
  if (!goal) return;

  if (goal.projectIds.includes(projectId)) {
    goal.projectIds = goal.projectIds.filter(id => id !== projectId);
    goal.updatedAt = new Date().toISOString();
    await persistGoals();
  }
}
