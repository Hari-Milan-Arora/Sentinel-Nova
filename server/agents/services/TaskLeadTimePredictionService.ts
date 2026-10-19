import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { createInterface, type Interface as ReadlineInterface } from 'readline';
import path from 'path';
import type { Task } from '../../../src/types';

export interface TaskLeadTimePrediction {
  taskId: string;
  leadTimeDays: number;
}

export interface TaskLeadTimePredictionResult {
  status: 'available' | 'not_applicable' | 'unavailable';
  source: 'trained_model' | 'unavailable';
  targetName: 'task_completion_lead_time';
  units: 'elapsed_calendar_days';
  modelVersion?: string;
  predictions: TaskLeadTimePrediction[];
  testMaeDays?: number;
  testSampleCount?: number;
  evaluationLimitations?: string[];
  reason?: 'domain_not_declared' | 'experimental_model_disabled' | 'model_unavailable' | 'invalid_features' | 'prediction_failed' | 'worker_busy';
}

interface WorkerResponse {
  type?: 'ready';
  requestId?: string;
  ok: boolean;
  modelVersion?: string;
  failureCategory?: string;
  predictions?: Array<{ index: number; leadTimeDays: number }>;
  provenance?: {
    source: 'trained_model';
    modelVersion: string;
    targetName: 'task_completion_lead_time';
    units: 'elapsed_calendar_days';
    testMaeDays: number | null;
    testSampleCount: number;
    evaluationLimitations: string[];
  };
}

type Pending = { resolve: (value: WorkerResponse) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

const SOFTWARE_TASK_TAGS = new Set(['software-engineering', 'software engineering', 'jira']);
const MAX_BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 4000;
const READY_TIMEOUT_MS = 6000;
const MAX_PENDING_REQUESTS = 20;

/**
 * Owns one persistent local Python worker. A request never starts a new
 * interpreter; failures produce explicit unavailable metadata without heuristic
 * substitution. This model is used only for tasks explicitly tagged as software
 * engineering or Jira work.
 */
export class TaskLeadTimePredictionService {
  private child: ChildProcessWithoutNullStreams | null = null;
  private lines: ReadlineInterface | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private readyTimer: NodeJS.Timeout | null = null;
  private requestSequence = 0;
  private readonly pending = new Map<string, Pending>();
  private stopped = false;

  constructor(private readonly cwd: string = process.cwd()) {
    process.once('exit', () => this.stop());
  }

  public async predictForTasks(tasks: Task[]): Promise<TaskLeadTimePredictionResult> {
    const applicable = (Array.isArray(tasks) ? tasks : []).filter((task) =>
      Array.isArray(task?.tags) && task.tags.some((tag) => SOFTWARE_TASK_TAGS.has(String(tag).trim().toLowerCase()))
    );
    const base = {
      targetName: 'task_completion_lead_time' as const,
      units: 'elapsed_calendar_days' as const,
    };
    if (applicable.length === 0) {
      return { ...base, status: 'not_applicable', source: 'unavailable', predictions: [], reason: 'domain_not_declared' };
    }
    if (applicable.length > MAX_BATCH_SIZE || applicable.some((task) =>
      typeof task.title !== 'string' || !task.title.trim() || task.title.length > 2000 || typeof task.id !== 'string'
    )) {
      return { ...base, status: 'unavailable', source: 'unavailable', predictions: [], reason: 'invalid_features' };
    }
    // Offline evaluation shows severe chronological target drift and strongly
    // negative held-out R². Keep the model out of normal recommendations until
    // a new evaluation justifies enabling this explicitly experimental path.
    if (process.env.SENTINEL_NOVA_ENABLE_EXPERIMENTAL_LEAD_TIME_MODEL !== 'true') {
      return { ...base, status: 'unavailable', source: 'unavailable', predictions: [], reason: 'experimental_model_disabled' };
    }

    try {
      await this.ensureWorker();
      if (this.pending.size >= MAX_PENDING_REQUESTS) {
        return { ...base, status: 'unavailable', source: 'unavailable', predictions: [], reason: 'worker_busy' };
      }
      const response = await this.send({
        features: applicable.map((task) => ({ summary: task.title.trim() })),
      });
      if (!response.ok || !Array.isArray(response.predictions) || !response.provenance) {
        const reason = response.failureCategory === 'invalid_features' ? 'invalid_features' : 'prediction_failed';
        return { ...base, status: 'unavailable', source: 'unavailable', predictions: [], reason };
      }
      const indexed = new Map(response.predictions.map((entry) => [entry.index, entry.leadTimeDays]));
      const predictions: TaskLeadTimePrediction[] = [];
      for (let index = 0; index < applicable.length; index++) {
        const leadTimeDays = indexed.get(index);
        if (typeof leadTimeDays !== 'number' || !Number.isFinite(leadTimeDays) || leadTimeDays < 0) {
          return { ...base, status: 'unavailable', source: 'unavailable', predictions: [], reason: 'prediction_failed' };
        }
        predictions.push({ taskId: applicable[index].id, leadTimeDays });
      }
      return {
        ...base,
        status: 'available',
        source: 'trained_model',
        modelVersion: response.provenance.modelVersion,
        predictions,
        testMaeDays: response.provenance.testMaeDays ?? undefined,
        testSampleCount: response.provenance.testSampleCount,
        evaluationLimitations: response.provenance.evaluationLimitations,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const reason: TaskLeadTimePredictionResult['reason'] = message === 'worker_busy'
        ? 'worker_busy'
        : message === 'invalid_features'
          ? 'invalid_features'
          : 'model_unavailable';
      return { ...base, status: 'unavailable', source: 'unavailable', predictions: [], reason };
    }
  }

  public stop(): void {
    this.stopped = true;
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.lines?.close();
    this.child?.kill();
    this.child = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('worker_stopped'));
    }
    this.pending.clear();
  }

  private ensureWorker(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    if (this.stopped) return Promise.reject(new Error('worker_stopped'));

    const python = process.env.SENTINEL_NOVA_PYTHON || process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    const workerPath = process.env.SENTINEL_NOVA_ML_WORKER || path.join(this.cwd, 'ml', 'inference', 'worker.py');
    const artifactDir = process.env.SENTINEL_NOVA_ML_ARTIFACT_DIR || path.join(this.cwd, 'ml', 'models');
    const child = spawn(python, ['-u', workerPath, '--artifact-dir', artifactDir], {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;
    child.stderr.resume();
    this.lines = createInterface({ input: child.stdout });
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.readyTimer = setTimeout(() => this.failWorker('worker_start_timeout'), READY_TIMEOUT_MS);

    this.lines.on('line', (line) => this.handleLine(line));
    child.on('error', () => this.failWorker('worker_start_failed'));
    child.on('exit', () => this.failWorker('worker_exited'));
    return this.readyPromise;
  }

  private handleLine(line: string): void {
    let response: WorkerResponse;
    try {
      response = JSON.parse(line) as WorkerResponse;
    } catch {
      this.failWorker('worker_protocol_error');
      return;
    }
    if (response.type === 'ready') {
      if (this.readyTimer) clearTimeout(this.readyTimer);
      this.readyTimer = null;
      if (response.ok) this.readyResolve?.();
      else this.failWorker('model_unavailable');
      this.readyResolve = null;
      this.readyReject = null;
      return;
    }
    if (!response.requestId) return;
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.requestId);
    pending.resolve(response);
  }

  private send(payload: { features: Array<{ summary: string }> }): Promise<WorkerResponse> {
    if (!this.child?.stdin.writable) return Promise.reject(new Error('worker_unavailable'));
    const requestId = `leadtime-${++this.requestSequence}`;
    return new Promise<WorkerResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('worker_request_timeout'));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      this.child?.stdin.write(`${JSON.stringify({ requestId, ...payload })}\n`, (error) => {
        if (!error) return;
        const pending = this.pending.get(requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
        pending.reject(new Error('worker_write_failed'));
      });
    });
  }

  private failWorker(reason: string): void {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = null;
    this.readyReject?.(new Error(reason));
    this.readyResolve = null;
    this.readyReject = null;
    this.readyPromise = null;
    this.lines?.close();
    this.lines = null;
    if (this.child && !this.child.killed) this.child.kill();
    this.child = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }
}

export const taskLeadTimePredictionService = new TaskLeadTimePredictionService();
