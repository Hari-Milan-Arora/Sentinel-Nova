import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import { DATA_DIR } from './dataDirectory';
import type { ServerTask, TaskPriority } from './taskStore';
import { getPlanningProfile } from './profileStore';

export type OutcomeValueSource = 'user_entered' | 'imported' | 'system_observed' | 'derived' | 'unknown';

export interface CapturedFeature<T> {
  value: T | null;
  source: OutcomeValueSource;
  observed: boolean;
}

export interface TaskPredictionFeatureSnapshot {
  createdAt: CapturedFeature<string>;
  priority: CapturedFeature<TaskPriority>;
  plannedDueDate: CapturedFeature<string>;
  plannedDueTime: CapturedFeature<string>;
  timezone: CapturedFeature<string>;
  taskCategory: CapturedFeature<string>;
  estimatedMinutes: CapturedFeature<number>;
}

export interface TaskCompletionOutcome {
  eventId: string;
  completedAt: string;
  completionSource: 'system_observed';
  elapsedCalendarMinutes: number;
  deadlineMet: boolean | null;
  deadlineLabelSource: 'derived' | 'unknown';
}

/**
 * Minimal, opt-in training record. It intentionally excludes titles,
 * descriptions, tags, project/goal names, and model/LLM reasoning.
 */
export interface TaskOutcomeRecord {
  schemaVersion: 1;
  recordId: string;
  userId: string;
  taskId: string;
  predictionTime: string;
  capturedAt: string;
  features: TaskPredictionFeatureSnapshot;
  completion: TaskCompletionOutcome | null;
}

type UserRecords = Record<string, TaskOutcomeRecord[]>;
type ConsentCheck = (userId: string) => boolean | Promise<boolean>;

const FEATURE_KEYS = [
  'createdAt', 'priority', 'plannedDueDate', 'plannedDueTime', 'timezone', 'taskCategory', 'estimatedMinutes',
];
const SOURCE_VALUES = new Set<OutcomeValueSource>(['user_entered', 'imported', 'system_observed', 'derived', 'unknown']);
const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isCapturedFeature(value: unknown, validator: (candidate: unknown) => boolean): value is CapturedFeature<unknown> {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).length === 3 &&
    hasOwn(item, 'value') &&
    (item.value === null || validator(item.value)) &&
    SOURCE_VALUES.has(item.source as OutcomeValueSource) &&
    typeof item.observed === 'boolean' &&
    (item.observed || (item.value === null && item.source === 'unknown')) &&
    (!item.observed || item.value !== null || item.source !== 'unknown');
}

export function validateTaskOutcomeRecord(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['record must be an object'] };
  const record = value as Record<string, unknown>;
  const expectedKeys = ['schemaVersion', 'recordId', 'userId', 'taskId', 'predictionTime', 'capturedAt', 'features', 'completion'];
  if (Object.keys(record).length !== expectedKeys.length || expectedKeys.some((key) => !hasOwn(record, key))) {
    errors.push('record contains missing or unsupported fields');
  }
  if (record.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (typeof record.recordId !== 'string' || !record.recordId.trim()) errors.push('recordId is required');
  if (typeof record.userId !== 'string' || !record.userId.trim()) errors.push('userId is required');
  if (typeof record.taskId !== 'string' || !record.taskId.trim()) errors.push('taskId is required');
  if (!isIsoTimestamp(record.predictionTime) || !isIsoTimestamp(record.capturedAt)) errors.push('predictionTime and capturedAt must be timestamps');
  if (isIsoTimestamp(record.predictionTime) && isIsoTimestamp(record.capturedAt) && Date.parse(record.capturedAt) < Date.parse(record.predictionTime)) {
    errors.push('capturedAt cannot precede predictionTime');
  }

  const features = record.features;
  if (!features || typeof features !== 'object' || Array.isArray(features)) {
    errors.push('features must be an object');
  } else {
    const fields = features as Record<string, unknown>;
    if (Object.keys(fields).length !== FEATURE_KEYS.length || FEATURE_KEYS.some((key) => !hasOwn(fields, key))) {
      errors.push('features contain missing or unsupported fields');
    }
    if (!isCapturedFeature(fields.createdAt, isIsoTimestamp)) errors.push('features.createdAt is invalid');
    if (!isCapturedFeature(fields.priority, (v) => ['low', 'medium', 'high', 'urgent'].includes(String(v)))) errors.push('features.priority is invalid');
    if (!isCapturedFeature(fields.plannedDueDate, isDateOnly)) errors.push('features.plannedDueDate is invalid');
    if (!isCapturedFeature(fields.plannedDueTime, (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v))) errors.push('features.plannedDueTime is invalid');
    if (!isCapturedFeature(fields.timezone, (v) => typeof v === 'string' && v.length > 0 && v.length <= 100)) errors.push('features.timezone is invalid');
    if (!isCapturedFeature(fields.taskCategory, (v) => typeof v === 'string' && v.length > 0 && v.length <= 80)) errors.push('features.taskCategory is invalid');
    if (!isCapturedFeature(fields.estimatedMinutes, (v) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 100_000)) errors.push('features.estimatedMinutes is invalid');
    if (isCapturedFeature(fields.createdAt, isIsoTimestamp) && (fields.createdAt as CapturedFeature<string>).value !== record.predictionTime) {
      errors.push('predictionTime must match the captured creation time');
    }
  }

  if (record.completion !== null) {
    const completion = record.completion as Record<string, unknown>;
    if (!completion || typeof completion !== 'object' || Array.isArray(completion)) {
      errors.push('completion must be null or an object');
    } else {
      const keys = ['eventId', 'completedAt', 'completionSource', 'elapsedCalendarMinutes', 'deadlineMet', 'deadlineLabelSource'];
      if (Object.keys(completion).length !== keys.length || keys.some((key) => !hasOwn(completion, key))) errors.push('completion contains missing or unsupported fields');
      if (typeof completion.eventId !== 'string' || !completion.eventId.trim()) errors.push('completion.eventId is required');
      if (!isIsoTimestamp(completion.completedAt)) errors.push('completion.completedAt must be a timestamp');
      if (completion.completionSource !== 'system_observed') errors.push('completionSource must identify the Nova-observed status transition');
      if (typeof completion.elapsedCalendarMinutes !== 'number' || !Number.isFinite(completion.elapsedCalendarMinutes) || completion.elapsedCalendarMinutes < 0) errors.push('completion elapsed time must be non-negative');
      if (completion.deadlineMet !== null && typeof completion.deadlineMet !== 'boolean') errors.push('completion.deadlineMet must be boolean or null');
      if (completion.deadlineLabelSource !== 'derived' && completion.deadlineLabelSource !== 'unknown') errors.push('completion.deadlineLabelSource is invalid');
      if (isIsoTimestamp(completion.completedAt) && isIsoTimestamp(record.predictionTime) && Date.parse(completion.completedAt) < Date.parse(record.predictionTime)) {
        errors.push('completion cannot precede predictionTime');
      }
      if (completion.deadlineMet === null && completion.deadlineLabelSource !== 'unknown') errors.push('missing deadline labels must have unknown provenance');
      if (completion.deadlineMet !== null && completion.deadlineLabelSource !== 'derived') errors.push('derived deadline labels must identify derived provenance');
    }
  }
  return { valid: errors.length === 0, errors };
}

function sourceForInput(provided: boolean, source: OutcomeValueSource): OutcomeValueSource {
  return provided ? source : 'unknown';
}

function localDeadlineMet(completedAt: string, dueDate: string | null, dueTime: string | null, timezone: string | null): boolean | null {
  if (!dueDate || !timezone) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(completedAt));
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
    const localDate = `${part('year')}-${part('month')}-${part('day')}`;
    if (localDate < dueDate) return true;
    if (localDate > dueDate) return false;
    if (!dueTime) return true;
    // Due times have minute precision. Only the exact start of that minute is
    // on time; later seconds in the same minute are after the deadline.
    const localTime = `${part('hour')}:${part('minute')}:${part('second')}`;
    return localTime <= `${dueTime}:00`;
  } catch {
    return null;
  }
}

export class TaskOutcomeStore {
  private cache: UserRecords | null = null;

  constructor(private readonly filePath: string, private readonly isOptedIn: ConsentCheck) {}

  private async load(): Promise<UserRecords> {
    if (this.cache) return this.cache;
    try {
      const contents = await fs.readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(contents);
      this.cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as UserRecords : {};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.cache = {};
    }
    return this.cache;
  }

  private async persist(records: UserRecords): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') await fs.chmod(path.dirname(this.filePath), 0o700);
    const temp = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, JSON.stringify(records, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await fs.chmod(temp, 0o600);
      for (let attempt = 0; ; attempt += 1) {
        try {
          await fs.rename(temp, this.filePath);
          break;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (process.platform !== 'win32' || !['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(code || '') || attempt >= 4) throw error;
          await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
        }
      }
    } finally {
      await fs.rm(temp, { force: true }).catch(() => undefined);
    }
  }

  private async loadForDeletion(): Promise<UserRecords> {
    try {
      return await this.load();
    } catch {
      // If the optional telemetry file is unreadable, deleting the whole
      // telemetry file is safer than retaining records after a revoke/delete.
      this.cache = {};
      await fs.rm(this.filePath, { force: true });
      return this.cache;
    }
  }

  public async recordTaskSnapshot(
    userId: string,
    task: ServerTask,
    suppliedFields: Partial<Pick<ServerTask, 'priority' | 'dueDate' | 'dueTime' | 'estimatedMinutes'>> = {},
    inputSource: OutcomeValueSource = 'unknown',
    timezone: string | null = null,
  ): Promise<TaskOutcomeRecord | null> {
    if (!userId || task.userId !== userId || task.status === 'completed' || task.status === 'cancelled' || !await this.isOptedIn(userId)) return null;
    const records = await this.load();
    const userRecords = records[userId] || (records[userId] = []);
    const existing = userRecords.find((record) => record.taskId === task.id);
    if (existing) return existing;
    const has = (field: keyof typeof suppliedFields) => hasOwn(suppliedFields, field);
    const createdAt = task.createdAt;
    const record: TaskOutcomeRecord = {
      schemaVersion: 1,
      recordId: `task-outcome:${task.id}:v1`,
      userId,
      taskId: task.id,
      predictionTime: createdAt,
      capturedAt: new Date().toISOString(),
      features: {
        createdAt: { value: createdAt, source: 'system_observed', observed: true },
        priority: { value: has('priority') ? task.priority : null, source: sourceForInput(has('priority'), inputSource), observed: has('priority') },
        plannedDueDate: { value: has('dueDate') ? (task.dueDate || null) : null, source: sourceForInput(has('dueDate'), inputSource), observed: has('dueDate') },
        plannedDueTime: { value: has('dueTime') ? (task.dueTime || null) : null, source: sourceForInput(has('dueTime'), inputSource), observed: has('dueTime') },
        timezone: { value: timezone, source: timezone ? 'system_observed' : 'unknown', observed: Boolean(timezone) },
        taskCategory: { value: null, source: 'unknown', observed: false },
        estimatedMinutes: { value: has('estimatedMinutes') ? task.estimatedMinutes : null, source: sourceForInput(has('estimatedMinutes'), inputSource), observed: has('estimatedMinutes') },
      },
      completion: null,
    };
    const validation = validateTaskOutcomeRecord(record);
    if (!validation.valid) throw new Error(`invalid_task_outcome_snapshot:${validation.errors.join(',')}`);
    userRecords.push(record);
    await this.persist(records);
    return record;
  }

  public async recordTaskCompletion(userId: string, task: ServerTask): Promise<TaskOutcomeRecord | null> {
    if (!userId || task.userId !== userId || task.status !== 'completed' || !isIsoTimestamp(task.completedAt) || !await this.isOptedIn(userId)) return null;
    const records = await this.load();
    const record = records[userId]?.find((item) => item.taskId === task.id);
    if (!record || record.completion) return record || null;
    const deadlineDate = record.features.plannedDueDate.value;
    const dueTime = record.features.plannedDueTime.value;
    const timezone = record.features.timezone.value;
    const deadlineMet = localDeadlineMet(
      task.completedAt,
      typeof deadlineDate === 'string' ? deadlineDate : null,
      typeof dueTime === 'string' ? dueTime : null,
      typeof timezone === 'string' ? timezone : null,
    );
    record.completion = {
      eventId: `task-completed:${task.id}:${task.completedAt}`,
      completedAt: task.completedAt,
      completionSource: 'system_observed',
      elapsedCalendarMinutes: (Date.parse(task.completedAt) - Date.parse(record.predictionTime)) / 60_000,
      deadlineMet,
      deadlineLabelSource: deadlineMet === null ? 'unknown' : 'derived',
    };
    const validation = validateTaskOutcomeRecord(record);
    if (!validation.valid) throw new Error(`invalid_task_outcome_completion:${validation.errors.join(',')}`);
    await this.persist(records);
    return record;
  }

  public async listForUser(userId: string): Promise<TaskOutcomeRecord[]> {
    if (!userId || !await this.isOptedIn(userId)) return [];
    const records = await this.load();
    return [...(records[userId] || [])].map((record) => structuredClone(record));
  }

  public async deleteTask(userId: string, taskId: string): Promise<void> {
    if (!userId || !taskId) return;
    const records = await this.loadForDeletion();
    const remaining = (records[userId] || []).filter((record) => record.taskId !== taskId);
    if (remaining.length === (records[userId] || []).length) return;
    records[userId] = remaining;
    await this.persist(records);
  }

  public async clearForUser(userId: string): Promise<void> {
    if (!userId) return;
    const records = await this.loadForDeletion();
    delete records[userId];
    await this.persist(records);
  }
}

const outcomeFile = path.join(DATA_DIR, 'task_ml_outcomes.json');
export const taskOutcomeStore = new TaskOutcomeStore(outcomeFile, async (userId) => {
  const profile = await getPlanningProfile(userId);
  return profile?.mlOutcomeCollectionEnabled === true;
});
