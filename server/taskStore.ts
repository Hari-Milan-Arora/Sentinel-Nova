import fs from 'fs/promises';
import path from 'path';

export type TaskStatus = 'inbox' | 'todo' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ServerSubtask {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

export interface ServerTaskRecurrence {
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  interval?: number;
  daysOfWeek?: string[];
  endDate?: string | null;
}

export interface ServerTask {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  dueTime?: string | null;
  estimatedMinutes: number;
  tags: string[];
  subtasks: ServerSubtask[];
  projectId?: string | null;
  goalId?: string | null;
  milestoneId?: string | null;
  recurring?: ServerTaskRecurrence | null;
  dependencyIds: string[];
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

let tasksCache: Record<string, ServerTask[]> | null = null;

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    // Already exists or created
  }
}

async function loadTasks(): Promise<Record<string, ServerTask[]>> {
  if (tasksCache) return tasksCache;
  await ensureDataDir();
  try {
    const raw = await fs.readFile(TASKS_FILE, 'utf-8');
    tasksCache = JSON.parse(raw);
    return tasksCache!;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      tasksCache = {};
      return tasksCache;
    }
    console.error('Error reading tasks file, initializing empty store:', err);
    tasksCache = {};
    return tasksCache;
  }
}

async function persistTasks(): Promise<void> {
  await ensureDataDir();
  const dataToSave = tasksCache || {};
  await fs.writeFile(TASKS_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
}

export function validateTaskInput(
  input: any,
  isUpdate = false
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Task data must be an object.'] };
  }

  if (!isUpdate || input.title !== undefined) {
    if (!input.title || typeof input.title !== 'string' || !input.title.trim()) {
      errors.push('Task title is required.');
    }
  }

  if (input.status !== undefined) {
    const validStatuses: TaskStatus[] = ['inbox', 'todo', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(input.status)) {
      errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}.`);
    }
  }

  if (input.priority !== undefined) {
    const validPriorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
    if (!validPriorities.includes(input.priority)) {
      errors.push(`Invalid priority. Must be one of: ${validPriorities.join(', ')}.`);
    }
  }

  if (input.estimatedMinutes !== undefined) {
    const est = Number(input.estimatedMinutes);
    if (isNaN(est) || est < 0 || !Number.isInteger(est)) {
      errors.push('estimatedMinutes must be a non-negative integer.');
    }
  }

  if (input.dueDate !== undefined && input.dueDate !== null && input.dueDate !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
      errors.push('dueDate must be formatted as YYYY-MM-DD.');
    }
  }

  if (input.dueTime !== undefined && input.dueTime !== null && input.dueTime !== '') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime)) {
      errors.push('dueTime must be formatted as HH:mm.');
    }
  }

  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags)) {
      errors.push('tags must be an array of strings.');
    }
  }

  if (input.subtasks !== undefined) {
    if (!Array.isArray(input.subtasks)) {
      errors.push('subtasks must be an array.');
    }
  }

  if (input.projectId !== undefined && input.projectId !== null && input.projectId !== '') {
    if (typeof input.projectId !== 'string') {
      errors.push('projectId must be a string or null.');
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function getTasksByUser(userId: string): Promise<ServerTask[]> {
  const store = await loadTasks();
  if (!store[userId]) {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const nextWeek = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    const nextWeekStr = nextWeek.toISOString().split('T')[0];

    const seedTasks: ServerTask[] = [
      {
        id: `task_${Date.now()}_1`,
        userId,
        title: 'Define Q3 system architecture roadmap',
        description: 'Detail latency bounds, streaming protocols, and cache invalidation strategies.',
        status: 'todo',
        priority: 'urgent',
        dueDate: todayStr,
        dueTime: '17:00',
        estimatedMinutes: 90,
        tags: ['architecture', 'roadmap'],
        subtasks: [
          { id: 'st_1_1', title: 'Audit current I/O bottlenecks', completed: true, createdAt: now.toISOString() },
          { id: 'st_1_2', title: 'Draft high-concurrency event loop spec', completed: false, createdAt: now.toISOString() },
        ],
        projectId: 'proj_seed_nova',
        goalId: 'goal_seed_portfolio',
        milestoneId: null,
        recurring: null,
        dependencyIds: [],
        scheduledStart: null,
        scheduledEnd: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        completedAt: null,
      },
      {
        id: `task_${Date.now()}_2`,
        userId,
        title: 'Review memory latency metrics',
        description: 'Verify memory consumption profiles across long-running background tasks.',
        status: 'in_progress',
        priority: 'high',
        dueDate: tomorrowStr,
        dueTime: '15:30',
        estimatedMinutes: 45,
        tags: ['performance', 'diagnostics'],
        subtasks: [
          { id: 'st_2_1', title: 'Inspect profile store cache duration', completed: true, createdAt: now.toISOString() },
          { id: 'st_2_2', title: 'Compare heap snapshot delta', completed: false, createdAt: now.toISOString() },
        ],
        projectId: 'proj_seed_nova',
        goalId: 'goal_seed_portfolio',
        milestoneId: null,
        recurring: null,
        dependencyIds: [],
        scheduledStart: null,
        scheduledEnd: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        completedAt: null,
      },
      {
        id: `task_${Date.now()}_3`,
        userId,
        title: 'Set up automated integration tests',
        description: 'Add automated end-to-end task API regression tests.',
        status: 'todo',
        priority: 'medium',
        dueDate: nextWeekStr,
        dueTime: null,
        estimatedMinutes: 60,
        tags: ['testing', 'infra'],
        subtasks: [
          { id: 'st_3_1', title: 'Write mock auth session fixtures', completed: false, createdAt: now.toISOString() },
        ],
        projectId: null,
        goalId: null,
        milestoneId: null,
        recurring: null,
        dependencyIds: [],
        scheduledStart: null,
        scheduledEnd: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        completedAt: null,
      },
    ];

    store[userId] = seedTasks;
    await persistTasks();
  }
  return [...store[userId]];
}

/**
 * Scoped retrieval for planning: returns active tasks relevant for planning
 * ('inbox', 'todo', 'in_progress') and excludes 'completed' and 'cancelled'.
 * Uses identical canonical data validation and strict userId isolation.
 */
export async function getActiveTasksByUser(userId: string): Promise<ServerTask[]> {
  const allTasks = await getTasksByUser(userId);
  return allTasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
}

export async function getTaskById(userId: string, taskId: string): Promise<ServerTask | null> {
  const userTasks = await getTasksByUser(userId);
  const task = userTasks.find(t => t.id === taskId);
  return task ? { ...task } : null;
}

export async function createTask(userId: string, input: Partial<ServerTask>): Promise<ServerTask> {
  const store = await loadTasks();
  if (!store[userId]) {
    store[userId] = [];
  }

  const now = new Date().toISOString();
  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const status: TaskStatus = input.status || 'todo';
  const isCompleted = status === 'completed';

  const subtasks: ServerSubtask[] = Array.isArray(input.subtasks)
    ? input.subtasks.map((st, idx) => ({
        id: st.id || `st_${Date.now()}_${idx}`,
        title: String(st.title || '').trim(),
        completed: Boolean(st.completed),
        createdAt: st.createdAt || now,
      }))
    : [];

  const newTask: ServerTask = {
    id,
    userId,
    title: (input.title || '').trim(),
    description: input.description ? input.description.trim() : '',
    status,
    priority: input.priority || 'medium',
    dueDate: input.dueDate || null,
    dueTime: input.dueTime || null,
    estimatedMinutes: input.estimatedMinutes !== undefined ? Number(input.estimatedMinutes) : 30,
    tags: Array.isArray(input.tags) ? input.tags.map(t => String(t).trim()).filter(Boolean) : [],
    subtasks,
    projectId: input.projectId && String(input.projectId).trim() ? String(input.projectId).trim() : null,
    goalId: input.goalId || null,
    milestoneId: input.milestoneId || null,
    recurring: input.recurring || null,
    dependencyIds: Array.isArray(input.dependencyIds) ? input.dependencyIds : [],
    scheduledStart: input.scheduledStart || null,
    scheduledEnd: input.scheduledEnd || null,
    createdAt: now,
    updatedAt: now,
    completedAt: isCompleted ? now : null,
  };

  store[userId].unshift(newTask);
  await persistTasks();
  return { ...newTask };
}

export async function updateTask(
  userId: string,
  taskId: string,
  updates: Partial<ServerTask>
): Promise<ServerTask | null> {
  const store = await loadTasks();
  if (!store[userId]) return null;

  const idx = store[userId].findIndex(t => t.id === taskId);
  if (idx === -1) return null;

  const current = store[userId][idx];
  const now = new Date().toISOString();

  let nextStatus = updates.status !== undefined ? updates.status : current.status;
  let nextCompletedAt = current.completedAt;

  if (updates.status !== undefined) {
    if (nextStatus === 'completed' && current.status !== 'completed') {
      nextCompletedAt = now;
    } else if (nextStatus !== 'completed') {
      nextCompletedAt = null;
    }
  }

  const updatedTask: ServerTask = {
    ...current,
    ...updates,
    id: current.id,
    userId: current.userId, // Prevent changing owner
    title: updates.title !== undefined ? updates.title.trim() : current.title,
    description: updates.description !== undefined ? updates.description.trim() : current.description,
    status: nextStatus,
    priority: updates.priority || current.priority,
    dueDate: updates.dueDate !== undefined ? updates.dueDate : current.dueDate,
    dueTime: updates.dueTime !== undefined ? updates.dueTime : current.dueTime,
    estimatedMinutes: updates.estimatedMinutes !== undefined ? Number(updates.estimatedMinutes) : current.estimatedMinutes,
    tags: updates.tags !== undefined ? updates.tags : current.tags,
    subtasks: updates.subtasks !== undefined ? updates.subtasks : current.subtasks,
    projectId: updates.projectId !== undefined ? (updates.projectId && String(updates.projectId).trim() ? String(updates.projectId).trim() : null) : current.projectId,
    goalId: updates.goalId !== undefined ? updates.goalId : current.goalId,
    milestoneId: updates.milestoneId !== undefined ? updates.milestoneId : current.milestoneId,
    recurring: updates.recurring !== undefined ? updates.recurring : current.recurring,
    dependencyIds: updates.dependencyIds !== undefined ? updates.dependencyIds : current.dependencyIds,
    scheduledStart: updates.scheduledStart !== undefined ? updates.scheduledStart : current.scheduledStart,
    scheduledEnd: updates.scheduledEnd !== undefined ? updates.scheduledEnd : current.scheduledEnd,
    createdAt: current.createdAt,
    updatedAt: now,
    completedAt: nextCompletedAt,
  };

  store[userId][idx] = updatedTask;
  await persistTasks();
  return { ...updatedTask };
}

export async function deleteTask(userId: string, taskId: string): Promise<boolean> {
  const store = await loadTasks();
  if (!store[userId]) return false;

  const initialLen = store[userId].length;
  store[userId] = store[userId].filter(t => t.id !== taskId);

  if (store[userId].length !== initialLen) {
    await persistTasks();
    return true;
  }
  return false;
}

export async function completeTask(userId: string, taskId: string): Promise<ServerTask | null> {
  return updateTask(userId, taskId, {
    status: 'completed',
  });
}

export async function reopenTask(userId: string, taskId: string): Promise<ServerTask | null> {
  return updateTask(userId, taskId, {
    status: 'todo',
  });
}

export async function unassignProjectFromTasks(userId: string, projectId: string): Promise<void> {
  const store = await loadTasks();
  if (!store[userId]) return;

  let changed = false;
  const now = new Date().toISOString();
  store[userId] = store[userId].map(t => {
    if (t.projectId === projectId) {
      changed = true;
      return {
        ...t,
        projectId: null,
        updatedAt: now,
      };
    }
    return t;
  });

  if (changed) {
    await persistTasks();
  }
}
