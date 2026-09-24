/**
 * Task Tools for Sentinel Nova Execution Boundary (Day 5C.1)
 *
 * Implements:
 * - tool.task.complete: Marks an active task completed for the authenticated user
 * - tool.task.reopen: Reopens a completed task for the authenticated user
 * - tool.task.schedule: Schedules a task within verified availability constraints
 *
 * SAFETY MANDATES:
 * 1. User isolation: operates ONLY on tasks owned by context.userId.
 * 2. Uses existing taskStore methods (no direct JSON/fs manipulation).
 * 3. Strict parameter validation and sanitization.
 * 4. Safe deterministic idempotency.
 * 5. Requires explicit user confirmation.
 */

import { BaseTool, ValidationResult } from '../baseTool';
import { ToolContext, ToolMetadata } from '../types';
import {
  getTaskById,
  completeTask,
  reopenTask,
  updateTask,
  getActiveTasksByUser,
  ServerTask,
} from '../../../taskStore';
import { getPlanningProfile } from '../../../profileStore';
import { getCachedEvents, getUserCalendarStatus } from '../../../calendarStore';
import { calculateAvailability } from '../../../../src/utils/availabilityEngine';
import {
  InvalidToolParametersError,
  ResourceNotFoundError,
  UnauthorizedToolError,
  ToolExecutionError,
} from '../errors';

export interface CompleteTaskInput {
  taskId: string;
  note?: string;
}

export interface CompleteTaskOutput {
  taskId: string;
  status: string;
  title: string;
  completedAt?: string | null;
  alreadyCompleted?: boolean;
  message: string;
}

/**
 * tool.task.complete
 */
export class CompleteTaskTool extends BaseTool<CompleteTaskInput, CompleteTaskOutput> {
  public readonly metadata: ToolMetadata = {
    id: 'tool.task.complete',
    name: 'Complete Task Tool',
    description: 'Marks a task as completed for the authenticated user.',
    version: '1.0.0',
    category: 'task',
    riskLevel: 'low',
    requiresConfirmation: true,
    capabilities: ['task_management', 'task_completion'],
    inputSchema: {
      taskId: 'string (required, max 100 chars)',
      note: 'string (optional, max 500 chars)',
    },
    outputDescription: 'Returns updated task completion status and metadata.',
  };

  public validate(input: unknown): ValidationResult<CompleteTaskInput> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { valid: false, error: 'Input must be a JSON object.' };
    }

    const rec = input as Record<string, unknown>;

    // Reject own prototype keys
    if (
      Object.prototype.hasOwnProperty.call(rec, '__proto__') ||
      Object.prototype.hasOwnProperty.call(rec, 'constructor') ||
      Object.prototype.hasOwnProperty.call(rec, 'prototype')
    ) {
      return { valid: false, error: 'Disallowed prototype keys detected.' };
    }

    // Validate taskId
    if (!rec.taskId || typeof rec.taskId !== 'string') {
      return { valid: false, error: 'taskId is required and must be a string.' };
    }

    const taskId = rec.taskId.trim();
    if (taskId.length === 0) {
      return { valid: false, error: 'taskId cannot be empty.' };
    }
    if (taskId.length > 100) {
      return { valid: false, error: 'taskId exceeds maximum length of 100 characters.' };
    }
    if (this.hasCodeInjectionRisk(taskId)) {
      return { valid: false, error: 'taskId contains illegal or dangerous characters.' };
    }

    // Validate optional note
    let note: string | undefined;
    if (rec.note !== undefined && rec.note !== null) {
      if (typeof rec.note !== 'string') {
        return { valid: false, error: 'note must be a string.' };
      }
      if (rec.note.length > 500) {
        return { valid: false, error: 'note exceeds maximum length of 500 characters.' };
      }
      if (this.hasCodeInjectionRisk(rec.note)) {
        return { valid: false, error: 'note contains disallowed script expressions.' };
      }
      note = rec.note.trim();
    }

    return {
      valid: true,
      validatedInput: { taskId, note },
    };
  }

  public async execute(context: ToolContext, input: CompleteTaskInput): Promise<CompleteTaskOutput> {
    const userId = context.userId;
    if (!userId || !userId.trim()) {
      throw new UnauthorizedToolError('Missing authenticated userId in tool context.');
    }

    // 1. Verify task exists and is owned by authenticated user
    const task = await getTaskById(userId, input.taskId);
    if (!task) {
      throw new ResourceNotFoundError('Task', input.taskId);
    }
    if (task.userId !== userId) {
      throw new UnauthorizedToolError('Access denied: Task does not belong to authenticated user.');
    }

    // 2. Safe idempotency: if already completed, do not corrupt state
    if (task.status === 'completed') {
      return {
        taskId: task.id,
        status: 'completed',
        title: task.title,
        completedAt: task.completedAt,
        alreadyCompleted: true,
        message: `Task "${task.title}" is already completed (idempotent).`,
      };
    }

    // 3. Mutate through existing taskStore
    const updated = await completeTask(userId, input.taskId);
    if (!updated) {
      throw new ToolExecutionError(this.metadata.id, 'Failed to complete task in storage.');
    }

    return {
      taskId: updated.id,
      status: updated.status,
      title: updated.title,
      completedAt: updated.completedAt,
      alreadyCompleted: false,
      message: `Task "${updated.title}" marked as completed.`,
    };
  }
}

export interface ReopenTaskInput {
  taskId: string;
  note?: string;
}

export interface ReopenTaskOutput {
  taskId: string;
  status: string;
  title: string;
  alreadyOpen?: boolean;
  message: string;
}

/**
 * tool.task.reopen
 */
export class ReopenTaskTool extends BaseTool<ReopenTaskInput, ReopenTaskOutput> {
  public readonly metadata: ToolMetadata = {
    id: 'tool.task.reopen',
    name: 'Reopen Task Tool',
    description: 'Reopens a completed or closed task for the authenticated user.',
    version: '1.0.0',
    category: 'task',
    riskLevel: 'low',
    requiresConfirmation: true,
    capabilities: ['task_management', 'task_reopening'],
    inputSchema: {
      taskId: 'string (required, max 100 chars)',
      note: 'string (optional, max 500 chars)',
    },
    outputDescription: 'Returns updated task status and reopen confirmation.',
  };

  public validate(input: unknown): ValidationResult<ReopenTaskInput> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { valid: false, error: 'Input must be a JSON object.' };
    }

    const rec = input as Record<string, unknown>;

    if (
      Object.prototype.hasOwnProperty.call(rec, '__proto__') ||
      Object.prototype.hasOwnProperty.call(rec, 'constructor') ||
      Object.prototype.hasOwnProperty.call(rec, 'prototype')
    ) {
      return { valid: false, error: 'Disallowed prototype keys detected.' };
    }

    if (!rec.taskId || typeof rec.taskId !== 'string') {
      return { valid: false, error: 'taskId is required and must be a string.' };
    }

    const taskId = rec.taskId.trim();
    if (taskId.length === 0) {
      return { valid: false, error: 'taskId cannot be empty.' };
    }
    if (taskId.length > 100) {
      return { valid: false, error: 'taskId exceeds maximum length of 100 characters.' };
    }
    if (this.hasCodeInjectionRisk(taskId)) {
      return { valid: false, error: 'taskId contains illegal or dangerous characters.' };
    }

    let note: string | undefined;
    if (rec.note !== undefined && rec.note !== null) {
      if (typeof rec.note !== 'string') {
        return { valid: false, error: 'note must be a string.' };
      }
      if (rec.note.length > 500) {
        return { valid: false, error: 'note exceeds maximum length of 500 characters.' };
      }
      if (this.hasCodeInjectionRisk(rec.note)) {
        return { valid: false, error: 'note contains disallowed script expressions.' };
      }
      note = rec.note.trim();
    }

    return {
      valid: true,
      validatedInput: { taskId, note },
    };
  }

  public async execute(context: ToolContext, input: ReopenTaskInput): Promise<ReopenTaskOutput> {
    const userId = context.userId;
    if (!userId || !userId.trim()) {
      throw new UnauthorizedToolError('Missing authenticated userId in tool context.');
    }

    const task = await getTaskById(userId, input.taskId);
    if (!task) {
      throw new ResourceNotFoundError('Task', input.taskId);
    }
    if (task.userId !== userId) {
      throw new UnauthorizedToolError('Access denied: Task does not belong to authenticated user.');
    }

    // Safe idempotency: if already active/open
    if (task.status !== 'completed' && task.status !== 'cancelled') {
      return {
        taskId: task.id,
        status: task.status,
        title: task.title,
        alreadyOpen: true,
        message: `Task "${task.title}" is already open (idempotent).`,
      };
    }

    const updated = await reopenTask(userId, input.taskId);
    if (!updated) {
      throw new ToolExecutionError(this.metadata.id, 'Failed to reopen task in storage.');
    }

    return {
      taskId: updated.id,
      status: updated.status,
      title: updated.title,
      alreadyOpen: false,
      message: `Task "${updated.title}" successfully reopened.`,
    };
  }
}

export interface ScheduleTaskInput {
  taskId: string;
  scheduledStart: string;
  scheduledEnd: string;
  durationMinutes?: number;
}

export interface ScheduleTaskOutput {
  taskId: string;
  scheduledStart: string;
  scheduledEnd: string;
  updatedAt: string;
  message: string;
  rollbackAvailable: boolean;
  previousState?: {
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
  };
}

/**
 * tool.task.schedule
 */
export class ScheduleTaskTool extends BaseTool<ScheduleTaskInput, ScheduleTaskOutput> {
  public readonly metadata: ToolMetadata = {
    id: 'tool.task.schedule',
    name: 'Schedule Task Tool',
    description: 'Schedules a task in a confirmed time window with availability verification.',
    version: '1.0.0',
    category: 'task',
    riskLevel: 'medium',
    requiresConfirmation: true,
    capabilities: ['task_management', 'task_scheduling'],
    inputSchema: {
      taskId: 'string (required)',
      scheduledStart: 'ISO timestamp (required)',
      scheduledEnd: 'ISO timestamp (required)',
      durationMinutes: 'number (optional)',
    },
    outputDescription: 'Returns scheduled task details and previous state for rollback.',
  };

  public validate(input: unknown): ValidationResult<ScheduleTaskInput> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { valid: false, error: 'Input must be a JSON object.' };
    }

    const rec = input as Record<string, unknown>;

    if (!rec.taskId || typeof rec.taskId !== 'string' || !rec.taskId.trim()) {
      return { valid: false, error: 'Missing or invalid target taskId.' };
    }

    const taskId = rec.taskId.trim();

    if (
      typeof rec.scheduledStart !== 'string' ||
      typeof rec.scheduledEnd !== 'string' ||
      !rec.scheduledStart.trim() ||
      !rec.scheduledEnd.trim()
    ) {
      return { valid: false, error: 'Invalid or missing scheduledStart or scheduledEnd timestamp.' };
    }

    const scheduledStart = rec.scheduledStart.trim();
    const scheduledEnd = rec.scheduledEnd.trim();

    const startDate = new Date(scheduledStart);
    const endDate = new Date(scheduledEnd);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return { valid: false, error: 'INVALID_TIMESTAMPS' };
    }

    if (startDate.getTime() >= endDate.getTime()) {
      return { valid: false, error: 'INVALID_TIME_RANGE' };
    }

    return {
      valid: true,
      validatedInput: {
        taskId,
        scheduledStart,
        scheduledEnd,
        durationMinutes: typeof rec.durationMinutes === 'number' ? rec.durationMinutes : undefined,
      },
    };
  }

  public async execute(context: ToolContext, input: ScheduleTaskInput): Promise<ScheduleTaskOutput> {
    const userId = context.userId;
    if (!userId || !userId.trim()) {
      throw new UnauthorizedToolError('Missing authenticated userId in tool context.');
    }

    const startDate = new Date(input.scheduledStart);
    const endDate = new Date(input.scheduledEnd);
    const scheduledDurationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

    if (scheduledDurationMinutes <= 0) {
      throw new InvalidToolParametersError(this.metadata.id, 'Scheduled duration must be greater than zero.');
    }

    // 1. Verify task ownership
    const task = await getTaskById(userId, input.taskId);
    if (!task) {
      throw new ResourceNotFoundError('Task', input.taskId);
    }
    if (task.userId !== userId) {
      throw new UnauthorizedToolError('Access denied: Target task does not belong to authenticated user.');
    }

    // 2. Safe Idempotency
    if (task.scheduledStart === input.scheduledStart && task.scheduledEnd === input.scheduledEnd) {
      return {
        taskId: task.id,
        scheduledStart: task.scheduledStart,
        scheduledEnd: task.scheduledEnd,
        updatedAt: task.updatedAt,
        message: `Task "${task.title}" is already scheduled for the requested time window (idempotent).`,
        rollbackAvailable: false,
        previousState: {
          scheduledStart: task.scheduledStart,
          scheduledEnd: task.scheduledEnd,
        },
      };
    }

    // 3. Duration check against task requirement
    const taskEstimatedMinutes = task.estimatedMinutes || 30;
    if (scheduledDurationMinutes < taskEstimatedMinutes) {
      throw new ToolExecutionError(
        this.metadata.id,
        `Scheduled window duration (${scheduledDurationMinutes}m) is less than required task duration (${taskEstimatedMinutes}m).`,
        'DURATION_MISMATCH'
      );
    }

    // 4. Re-check availability constraints before mutation
    const targetDateStr = input.scheduledStart.split('T')[0];
    const targetEndDateStr = input.scheduledEnd.split('T')[0];

    if (targetDateStr !== targetEndDateStr) {
      throw new ToolExecutionError(
        this.metadata.id,
        'Multi-day scheduling is not permitted under single-day focus constraints.',
        'WINDOW_UNAVAILABLE'
      );
    }

    const profile = await getPlanningProfile(userId);
    const calStatus = getUserCalendarStatus(userId);
    const cachedEvents = getCachedEvents(userId);
    const activeTasks = await getActiveTasksByUser(userId);

    const availability = calculateAvailability({
      dateStr: targetDateStr,
      profile,
      events: cachedEvents,
      selectedCalendarIds: calStatus?.selectedCalendarIds || [],
      tasks: activeTasks,
    });

    const reqStartMs = startDate.getTime();
    const reqEndMs = endDate.getTime();

    const fitsInFreeWindow = availability.freeWindows.some((fw) => {
      const fwStartMs = new Date(fw.start).getTime();
      const fwEndMs = new Date(fw.end).getTime();
      return reqStartMs >= fwStartMs && reqEndMs <= fwEndMs;
    });

    if (!fitsInFreeWindow) {
      throw new ToolExecutionError(
        this.metadata.id,
        'The requested time window is unavailable due to calendar busy events, sleep rhythm, or fixed commitments.',
        'WINDOW_UNAVAILABLE'
      );
    }

    // 5. Check conflict with other scheduled tasks
    const conflictingTask = activeTasks.find((other) => {
      if (other.id === task.id) return false;
      if (!other.scheduledStart || !other.scheduledEnd) return false;
      if (other.status === 'completed' || other.status === 'cancelled') return false;

      const otherStartMs = new Date(other.scheduledStart).getTime();
      const otherEndMs = new Date(other.scheduledEnd).getTime();
      if (isNaN(otherStartMs) || isNaN(otherEndMs)) return false;

      return Math.max(reqStartMs, otherStartMs) < Math.min(reqEndMs, otherEndMs);
    });

    if (conflictingTask) {
      throw new ToolExecutionError(
        this.metadata.id,
        `The proposed window conflicts with another scheduled task: "${conflictingTask.title}".`,
        'TASK_CONFLICT'
      );
    }

    // 6. Capture previous state
    const previousState = {
      scheduledStart: task.scheduledStart || null,
      scheduledEnd: task.scheduledEnd || null,
    };

    // 7. Mutate task
    const updatedTask = await updateTask(userId, task.id, {
      scheduledStart: input.scheduledStart,
      scheduledEnd: input.scheduledEnd,
    });

    if (!updatedTask) {
      throw new ToolExecutionError(this.metadata.id, 'Failed to update task in storage.', 'STORE_ERROR');
    }

    return {
      taskId: updatedTask.id,
      scheduledStart: updatedTask.scheduledStart!,
      scheduledEnd: updatedTask.scheduledEnd!,
      updatedAt: updatedTask.updatedAt,
      message: `Task "${updatedTask.title}" successfully scheduled for ${input.scheduledStart} – ${input.scheduledEnd}.`,
      rollbackAvailable: true,
      previousState,
    };
  }
}
