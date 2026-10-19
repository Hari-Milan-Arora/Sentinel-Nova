import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ServerTask } from '../../taskStore';
import { TaskOutcomeStore, validateTaskOutcomeRecord } from '../../mlOutcomeStore';

const task = (userId: string, id: string, createdAt = '2026-10-01T08:00:00.000Z'): ServerTask => ({
  id,
  userId,
  title: 'Sensitive title must not be stored',
  description: 'Sensitive description must not be stored',
  status: 'todo',
  priority: 'high',
  dueDate: '2026-10-10',
  dueTime: '17:00',
  estimatedMinutes: 90,
  tags: ['private-tag'],
  subtasks: [],
  dependencyIds: [],
  scheduledStart: null,
  scheduledEnd: null,
  createdAt,
  updatedAt: createdAt,
  completedAt: null,
});

async function main(): Promise<void> {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-outcomes-'));
  const consent = new Map<string, boolean>([['user-a', true], ['user-b', true]]);
  const store = new TaskOutcomeStore(path.join(temp, 'outcomes.json'), async (userId) => consent.get(userId) === true);
  try {
    const original = task('user-a', 'task-a');
    const snapshot = await store.recordTaskSnapshot('user-a', original, {
      priority: original.priority,
      dueDate: original.dueDate,
      dueTime: original.dueTime,
      estimatedMinutes: original.estimatedMinutes,
    }, 'user_entered', 'Asia/Kolkata');
    assert.ok(snapshot);
    assert.equal(snapshot.features.priority.source, 'user_entered');
    assert.equal(snapshot.features.estimatedMinutes.value, 90);
    assert.equal(snapshot.features.createdAt.source, 'system_observed');
    assert.equal(snapshot.features.taskCategory.value, null, 'no task category field exists in Nova Task');
    assert.equal(snapshot.predictionTime, original.createdAt);
    assert.equal(validateTaskOutcomeRecord(snapshot).valid, true);

    const duplicateSnapshot = await store.recordTaskSnapshot('user-a', { ...original, priority: 'urgent' }, {
      priority: 'urgent',
    }, 'user_entered', 'Asia/Kolkata');
    assert.equal(duplicateSnapshot?.recordId, snapshot.recordId);
    assert.equal(duplicateSnapshot?.features.priority.value, 'high', 'the first prediction-time snapshot is immutable');

    const completed: ServerTask = {
      ...original,
      status: 'completed',
      completedAt: '2026-10-11T13:00:00.000Z',
      priority: 'urgent',
      dueDate: '2026-10-20',
      estimatedMinutes: 240,
    };
    const labeled = await store.recordTaskCompletion('user-a', completed);
    assert.equal(labeled?.completion?.elapsedCalendarMinutes, 14_700);
    assert.equal(labeled?.completion?.deadlineMet, false, 'deadline label uses deadline/timezone snapshotted before completion');
    assert.equal(labeled?.features.priority.value, 'high');
    assert.equal(labeled?.features.plannedDueDate.value, '2026-10-10');
    assert.equal(labeled?.features.estimatedMinutes.value, 90);
    assert.equal(labeled?.completion?.deadlineLabelSource, 'derived');
    const persisted = await fs.readFile(path.join(temp, 'outcomes.json'), 'utf8');
    assert.equal(persisted.includes('Sensitive title'), false);
    assert.equal(persisted.includes('Sensitive description'), false);
    assert.equal(persisted.includes('private-tag'), false);

    const duplicateCompletion = await store.recordTaskCompletion('user-a', {
      ...completed,
      completedAt: '2026-10-12T13:00:00.000Z',
    });
    assert.equal(duplicateCompletion?.completion?.eventId, labeled?.completion?.eventId, 'completion is idempotent per task outcome');
    assert.equal((await store.listForUser('user-a')).length, 1);

    const missing = await store.recordTaskSnapshot('user-b', task('user-b', 'task-b'), {}, 'unknown', null);
    assert.ok(missing);
    assert.equal(missing.features.estimatedMinutes.value, null, 'default 30-minute estimate is not mislabeled as supplied');
    assert.equal(missing.features.estimatedMinutes.observed, false);
    assert.equal(missing.features.plannedDueDate.value, null);
    assert.equal(missing.features.plannedDueDate.observed, false);
    assert.equal((await store.listForUser('user-a')).length, 1);
    assert.equal((await store.listForUser('user-b')).length, 1, 'tenant lists only return the selected user partition');

    const boundary = await store.recordTaskSnapshot('user-b', task('user-b', 'boundary'), {
      priority: 'medium', dueDate: '2026-10-10', dueTime: '17:00',
    }, 'user_entered', 'Asia/Kolkata');
    assert.ok(boundary);
    const exactDeadline = await store.recordTaskCompletion('user-b', {
      ...task('user-b', 'boundary'), status: 'completed', completedAt: '2026-10-10T11:30:00.000Z',
    });
    assert.equal(exactDeadline?.completion?.deadlineMet, true, 'timezone conversion respects the exact due minute');
    const afterDeadline = await store.recordTaskSnapshot('user-b', task('user-b', 'boundary-seconds'), {
      dueDate: '2026-10-10', dueTime: '17:00',
    }, 'user_entered', 'Asia/Kolkata');
    assert.ok(afterDeadline);
    const lateBySeconds = await store.recordTaskCompletion('user-b', {
      ...task('user-b', 'boundary-seconds'), status: 'completed', completedAt: '2026-10-10T11:30:59.000Z',
    });
    assert.equal(lateBySeconds?.completion?.deadlineMet, false, 'seconds after the deadline are late');

    const outcomeFile = path.join(temp, 'outcomes.json');
    if (process.platform !== 'win32') {
      const mode = (await fs.stat(outcomeFile)).mode & 0o777;
      assert.equal(mode, 0o600, 'outcome JSON is restricted to the server account');
    }
    assert.deepEqual((await fs.readdir(temp)).filter((name) => name.endsWith('.tmp')), [], 'atomic writes leave no temporary files');
    consent.set('user-c', false);
    assert.equal(await store.recordTaskSnapshot('user-c', task('user-c', 'task-c')), null, 'collection is denied without opt-in');
    assert.deepEqual(await store.listForUser('user-c'), []);

    const invalidTime = JSON.parse(JSON.stringify(snapshot));
    invalidTime.completion = {
      eventId: 'bad-time',
      completedAt: '2026-09-30T08:00:00.000Z',
      completionSource: 'system_observed',
      elapsedCalendarMinutes: 0,
      deadlineMet: null,
      deadlineLabelSource: 'unknown',
    };
    assert.equal(validateTaskOutcomeRecord(invalidTime).valid, false, 'completion before prediction time is rejected');
    const leaked = { ...snapshot, title: original.title };
    assert.equal(validateTaskOutcomeRecord(leaked).valid, false, 'unsupported free-text fields are rejected');
    const badTimestamp = { ...snapshot, predictionTime: 'not-a-time' };
    assert.equal(validateTaskOutcomeRecord(badTimestamp).valid, false);
    const invalidDate = JSON.parse(JSON.stringify(snapshot));
    invalidDate.features.plannedDueDate = { value: '2026-02-30', source: 'user_entered', observed: true };
    assert.equal(validateTaskOutcomeRecord(invalidDate).valid, false, 'impossible local dates are rejected');

    consent.set('user-a', false);
    assert.deepEqual(await store.listForUser('user-a'), [], 'opt-out hides outcome records');
    await store.clearForUser('user-a');
    consent.set('user-a', true);
    assert.deepEqual(await store.listForUser('user-a'), [], 'revocation purges accumulated records');
    const corruptPath = path.join(temp, 'corrupt.json');
    await fs.writeFile(corruptPath, '{broken json', 'utf8');
    await new TaskOutcomeStore(corruptPath, () => true).clearForUser('user-a');
    assert.deepEqual(JSON.parse(await fs.readFile(corruptPath, 'utf8')), {}, 'unreadable optional data is replaced with an empty store during privacy deletion');
    console.log('ML outcome store tests passed: opt-in, isolation, provenance, snapshots, missing data, timestamps, deduplication, and leakage validation.');
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'ml_outcome_store_test_failed');
  process.exitCode = 1;
});
