import fs from 'fs/promises';
import path from 'path';
import { Project, ProjectPriority, ProjectStatus } from '../src/types';
import { unassignProjectFromTasks } from './taskStore';
import { getGoalById, linkProjectToGoal, unlinkProjectFromGoal } from './goalStore';

export interface ServerProject extends Project {}

const DATA_DIR = path.join(process.cwd(), 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

let projectsCache: Record<string, ServerProject[]> | null = null;

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    // Already exists or created
  }
}

async function loadProjects(): Promise<Record<string, ServerProject[]>> {
  if (projectsCache) return projectsCache;
  await ensureDataDir();
  try {
    const raw = await fs.readFile(PROJECTS_FILE, 'utf-8');
    projectsCache = JSON.parse(raw);
    return projectsCache!;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      projectsCache = {};
      return projectsCache;
    }
    console.error('Error reading projects file, initializing empty store:', err);
    projectsCache = {};
    return projectsCache;
  }
}

async function persistProjects(): Promise<void> {
  await ensureDataDir();
  const dataToSave = projectsCache || {};
  await fs.writeFile(PROJECTS_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
}

export function validateProjectInput(
  input: any,
  isUpdate = false
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Project data must be an object.'] };
  }

  if (!isUpdate || input.name !== undefined) {
    if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
      errors.push('Project name is required.');
    }
  }

  if (input.status !== undefined) {
    const validStatuses: ProjectStatus[] = ['active', 'completed', 'archived', 'on_hold'];
    if (!validStatuses.includes(input.status)) {
      errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}.`);
    }
  }

  if (input.priority !== undefined && input.priority !== null) {
    const validPriorities: ProjectPriority[] = ['low', 'medium', 'high', 'critical'];
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

  if (input.taskIds !== undefined && !Array.isArray(input.taskIds)) {
    errors.push('taskIds must be an array of strings.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function getProjectsByUser(userId: string): Promise<ServerProject[]> {
  const store = await loadProjects();
  if (!store[userId]) {
    const now = new Date();
    const seedProjects: ServerProject[] = [
      {
        id: 'proj_seed_nova',
        userId,
        goalId: 'goal_seed_portfolio',
        name: 'Sentinel Nova Core',
        description: 'AI Chief of Staff execution architecture, deterministic predictive modeling, and strategic layer integration.',
        status: 'active',
        priority: 'high',
        progress: 40,
        targetDate: '2026-10-15',
        taskIds: [],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        completionRate: 40,
        expectedEndDate: '2026-10-15',
        estimatedLaunchProbability: 82,
        bottlenecks: [],
        skillGrowthFactor: 1.25,
      },
    ];

    store[userId] = seedProjects;
    await persistProjects();
  }
  return [...store[userId]];
}

export async function getProjectById(userId: string, projectId: string): Promise<ServerProject | null> {
  const userProjects = await getProjectsByUser(userId);
  const found = userProjects.find(p => p.id === projectId);
  return found ? { ...found } : null;
}

export async function createProject(userId: string, input: any): Promise<ServerProject> {
  // If goalId is supplied, verify that the referenced goal belongs to the authenticated user
  if (input.goalId) {
    const goal = await getGoalById(userId, input.goalId);
    if (!goal) {
      throw new Error('Referenced goal does not exist or does not belong to user.');
    }
  }

  const store = await loadProjects();
  if (!store[userId]) {
    store[userId] = [];
  }

  const now = new Date().toISOString();
  const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newProject: ServerProject = {
    id: projectId,
    userId,
    goalId: input.goalId || null,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    status: input.status || 'active',
    priority: input.priority || 'medium',
    targetDate: input.targetDate || null,
    progress: Math.min(100, Math.max(0, input.progress !== undefined ? Number(input.progress) : 0)),
    taskIds: Array.isArray(input.taskIds) ? input.taskIds : [],
    createdAt: now,
    updatedAt: now,
    completionRate: input.completionRate || 0,
    expectedEndDate: input.targetDate || undefined,
    estimatedLaunchProbability: input.estimatedLaunchProbability || 75,
    bottlenecks: Array.isArray(input.bottlenecks) ? input.bottlenecks : [],
    skillGrowthFactor: input.skillGrowthFactor || 1.0,
  };

  store[userId].unshift(newProject);
  await persistProjects();

  // If goalId was provided, update the goal's projectIds array
  if (newProject.goalId) {
    await linkProjectToGoal(userId, newProject.goalId, projectId);
  }

  return { ...newProject };
}

export async function updateProject(
  userId: string,
  projectId: string,
  updates: any
): Promise<ServerProject | null> {
  const store = await loadProjects();
  if (!store[userId]) return null;

  const idx = store[userId].findIndex(p => p.id === projectId);
  if (idx === -1) return null;

  const current = store[userId][idx];

  // If goalId is being changed or supplied, verify that the referenced goal belongs to the user
  if (updates.goalId !== undefined && updates.goalId !== null && updates.goalId !== current.goalId) {
    const goal = await getGoalById(userId, updates.goalId);
    if (!goal) {
      throw new Error('Referenced goal does not exist or does not belong to user.');
    }
  }

  const oldGoalId = current.goalId;
  const newGoalId = updates.goalId !== undefined ? updates.goalId : current.goalId;
  const now = new Date().toISOString();

  let nextProgress = current.progress;
  if (updates.progress !== undefined) {
    nextProgress = Math.min(100, Math.max(0, Number(updates.progress)));
  }

  const updatedProject: ServerProject = {
    ...current,
    goalId: newGoalId,
    name: updates.name !== undefined ? updates.name.trim() : current.name,
    description: updates.description !== undefined ? updates.description.trim() || undefined : current.description,
    status: updates.status !== undefined ? updates.status : current.status,
    priority: updates.priority !== undefined ? updates.priority : current.priority,
    targetDate: updates.targetDate !== undefined ? updates.targetDate : current.targetDate,
    progress: nextProgress,
    taskIds: updates.taskIds !== undefined && Array.isArray(updates.taskIds) ? updates.taskIds : current.taskIds,
    completionRate: updates.completionRate !== undefined ? updates.completionRate : current.completionRate,
    expectedEndDate: updates.expectedEndDate !== undefined ? updates.expectedEndDate : current.expectedEndDate,
    estimatedLaunchProbability: updates.estimatedLaunchProbability !== undefined ? updates.estimatedLaunchProbability : current.estimatedLaunchProbability,
    bottlenecks: updates.bottlenecks !== undefined ? updates.bottlenecks : current.bottlenecks,
    skillGrowthFactor: updates.skillGrowthFactor !== undefined ? updates.skillGrowthFactor : current.skillGrowthFactor,
    updatedAt: now,
  };

  store[userId][idx] = updatedProject;
  await persistProjects();

  // Handle goal link updates if goalId changed
  if (oldGoalId !== newGoalId) {
    if (oldGoalId) {
      await unlinkProjectFromGoal(userId, oldGoalId, projectId);
    }
    if (newGoalId) {
      await linkProjectToGoal(userId, newGoalId, projectId);
    }
  }

  return { ...updatedProject };
}

export async function deleteProject(userId: string, projectId: string): Promise<boolean> {
  const store = await loadProjects();
  if (!store[userId]) return false;

  const project = store[userId].find(p => p.id === projectId);
  if (!project) return false;

  // 1. If project was linked to a goal, unlink it
  if (project.goalId) {
    await unlinkProjectFromGoal(userId, project.goalId, projectId);
  }

  // 2. Remove project from projects list
  store[userId] = store[userId].filter(p => p.id !== projectId);
  await persistProjects();

  // 3. Do not delete associated tasks! Remove/unassign project relationship from those tasks
  await unassignProjectFromTasks(userId, projectId);

  return true;
}

export async function completeProject(userId: string, projectId: string): Promise<ServerProject | null> {
  return updateProject(userId, projectId, {
    status: 'completed',
    progress: 100,
  });
}

export async function archiveProject(userId: string, projectId: string): Promise<ServerProject | null> {
  return updateProject(userId, projectId, {
    status: 'archived',
  });
}

export async function unassignGoalFromProjects(userId: string, goalId: string): Promise<void> {
  const store = await loadProjects();
  if (!store[userId]) return;

  let changed = false;
  const now = new Date().toISOString();
  store[userId] = store[userId].map(p => {
    if (p.goalId === goalId) {
      changed = true;
      return {
        ...p,
        goalId: null,
        updatedAt: now,
      };
    }
    return p;
  });

  if (changed) {
    await persistProjects();
  }
}
