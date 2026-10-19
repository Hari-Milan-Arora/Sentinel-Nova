import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const projectRoot = process.cwd();
const authSecret = 'isolated-outcome-http-test-secret';

function sessionCookie(id: string): string {
  const payload = Buffer.from(JSON.stringify({
    id, email: `${id}@example.test`, name: id,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', authSecret).update(payload).digest('base64url');
  return `sentinel_session=${payload}.${signature}`;
}

async function unusedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_port_unavailable');
  const { port } = address;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('test_server_exited_before_startup');
    try {
      const response = await fetch(url);
      if (response.status === 401) return;
    } catch { /* wait for listen */ }
    await delay(200);
  }
  throw new Error('test_server_startup_timeout');
}

async function main(): Promise<void> {
  const isolatedCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-outcome-http-'));
  const port = await unusedPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const tsxCli = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const serverFile = path.join(projectRoot, 'server.ts');
  const child = spawn(process.execPath, [tsxCli, serverFile], {
    cwd: isolatedCwd,
    env: {
      ...process.env,
      NODE_ENV: 'production', PORT: String(port), AUTH_SECRET: authSecret,
      GEMINI_API_KEY: '',
      SENTINEL_NOVA_ENABLE_EXPERIMENTAL_LEAD_TIME_MODEL: '',
      SENTINEL_NOVA_DATA_DIR: path.join(isolatedCwd, 'data'),
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  const request = (route: string, method = 'GET', user?: string, body?: unknown) => fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(user ? { Cookie: sessionCookie(user) } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = async (response: Response) => response.json() as Promise<Record<string, any>>;

  try {
    await waitForServer(`${baseUrl}/api/profile/ml-outcome-collection`, child);

    assert.equal((await request('/api/profile/ml-outcome-collection')).status, 401, 'GET requires existing auth middleware');
    assert.equal((await request('/api/profile/ml-outcome-collection', 'PUT', undefined, { enabled: true })).status, 401);
    assert.equal((await request('/api/tasks', 'GET')).status, 401);

    const consentPath = '/api/profile/ml-outcome-collection';
    assert.deepEqual(await json(await request(consentPath, 'GET', 'user-a')), { enabled: false, optedInAt: null }, 'consent defaults off');
    assert.deepEqual(await json(await request(`${consentPath}?userId=user-a`, 'GET', 'user-b')), { enabled: false, optedInAt: null }, 'caller identity, not query input, selects consent');
    assert.equal((await request(consentPath, 'PUT', 'user-a', { enabled: 'yes' })).status, 400);
    assert.equal((await request(consentPath, 'PUT', 'user-a', { enabled: true, userId: 'user-b' })).status, 400);
    assert.equal((await request(consentPath, 'PUT', 'user-a', { enabled: true, schemaVersion: 2 })).status, 400, 'unsupported request schema versions are rejected as extra fields');

    const profile = {
      timezone: 'Asia/Kolkata', sleepSchedule: { weekdaySleep: '23:00', weekdayWake: '07:00', weekendDifferent: false },
      recurringBlocks: [], preferredWorkingHours: { startTime: '09:00', endTime: '17:00', preferredPeriods: ['Morning'] },
      preferredPeriods: ['Morning'], dailyFocusCapacity: '2–4 hours', planningStyle: 'Important tasks first',
      bufferMinutes: 15, dailyMajorTaskTarget: '3–4', majorTasksPerDay: '3–4',
    };
    assert.equal((await request('/api/profile/planning', 'PUT', 'user-a', profile)).status, 200);

    const beforeOptIn = await json(await request('/api/tasks', 'POST', 'user-a', { title: 'Private pre-consent task' }));
    const beforeTaskId = beforeOptIn.task.id as string;
    assert.ok(beforeTaskId);
    assert.equal((await request(consentPath, 'PUT', 'user-a', { enabled: true })).status, 200);
    assert.deepEqual(await json(await request(consentPath, 'GET', 'user-a')).then(({ enabled, optedInAt }) => ({ enabled, optedInAt: Boolean(optedInAt) })), { enabled: true, optedInAt: true });
    assert.deepEqual(await json(await request(consentPath, 'GET', 'user-b')), { enabled: false, optedInAt: null }, 'consent is per-user');

    await request(`/api/tasks/${beforeTaskId}/complete`, 'POST', 'user-a', {});
    assert.equal(await fs.stat(path.join(isolatedCwd, 'data', 'task_ml_outcomes.json')).then(() => true, () => false), false,
      'a pre-consent task cannot acquire an outcome record when completed later');

    const dueDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const createdResponse = await request('/api/tasks', 'POST', 'user-a', {
      title: 'Do not store title', description: 'Do not store description', tags: ['do-not-store-tag'],
      priority: 'high', dueDate, dueTime: '17:00', estimatedMinutes: 75,
    });
    assert.equal(createdResponse.status, 201);
    const taskId = (await json(createdResponse)).task.id as string;
    const chatResponse = await request('/api/chat', 'POST', 'user-a', { message: 'What should I work on first?' });
    assert.equal(chatResponse.status, 200, 'authenticated natural-language prioritization works without a live provider key');
    const chatPayload = await json(chatResponse);
    assert.equal(typeof chatPayload.content, 'string');
    assert.ok(chatPayload.content.length > 0);
    assert.equal('confidenceScore' in chatPayload, false, 'deterministic fallback does not fabricate an LLM confidence score');

    const otherResponse = await request('/api/tasks', 'POST', 'user-b', { title: 'User B task' });
    const otherTaskId = (await json(otherResponse)).task.id as string;
    assert.equal((await request(`/api/tasks/${taskId}`, 'GET', 'user-b')).status, 404, 'task read stays tenant isolated');
    assert.equal((await request(`/api/tasks/${otherTaskId}`, 'GET', 'user-a')).status, 404);

    const storePath = path.join(isolatedCwd, 'data', 'task_ml_outcomes.json');
    const readStore = async () => JSON.parse(await fs.readFile(storePath, 'utf8')) as Record<string, any[]>;
    const initial = await readStore();
    assert.deepEqual(initial['user-a'].map((record) => record.taskId), [taskId], 'only post-consent eligible task is captured');
    assert.equal(initial['user-b'], undefined, 'non-consenting user has no outcome snapshot');
    const raw = await fs.readFile(storePath, 'utf8');
    for (const forbidden of ['Do not store title', 'Do not store description', 'do-not-store-tag']) assert.equal(raw.includes(forbidden), false);
    const original = initial['user-a'][0];
    assert.equal(original.features.priority.value, 'high');
    assert.equal(original.features.priority.source, 'user_entered');
    assert.equal(original.features.plannedDueDate.value, dueDate);
    assert.equal(original.features.plannedDueTime.value, '17:00');
    assert.equal(original.features.timezone.value, 'Asia/Kolkata');
    assert.equal(original.features.estimatedMinutes.value, 75);

    const missingEstimateResponse = await request('/api/tasks', 'POST', 'user-a', { title: 'Missing estimate task' });
    const missingEstimateTaskId = (await json(missingEstimateResponse)).task.id as string;
    let current = await readStore();
    const missing = current['user-a'].find((record) => record.taskId === missingEstimateTaskId);
    assert.equal(missing.features.estimatedMinutes.value, null, 'implicit task-store default is not captured as user data');
    assert.equal(missing.features.estimatedMinutes.source, 'unknown');
    assert.equal(missing.features.estimatedMinutes.observed, false);

    await request(`/api/tasks/${taskId}`, 'PUT', 'user-a', { priority: 'urgent', dueDate: '2030-01-01', estimatedMinutes: 240 });
    assert.equal((await request(`/api/tasks/${taskId}/complete`, 'POST', 'user-a', {})).status, 200);
    current = await readStore();
    const completed = current['user-a'].find((record) => record.taskId === taskId);
    assert.equal(completed.features.priority.value, 'high', 'prediction-time priority is immutable');
    assert.equal(completed.features.plannedDueDate.value, dueDate, 'prediction-time deadline is immutable');
    assert.equal(completed.features.estimatedMinutes.value, 75, 'prediction-time estimate is immutable');
    assert.equal(completed.completion.deadlineMet, true, 'captured due date and timezone ground the derived label');
    const completionEventId = completed.completion.eventId;
    const completionTime = completed.completion.completedAt;
    assert.equal((await request(`/api/tasks/${taskId}/complete`, 'POST', 'user-a', {})).status, 200);
    await request(`/api/tasks/${taskId}/reopen`, 'POST', 'user-a', {});
    await request(`/api/tasks/${taskId}/complete`, 'POST', 'user-a', {});
    current = await readStore();
    const afterReopen = current['user-a'].find((record) => record.taskId === taskId);
    assert.equal(afterReopen.completion.eventId, completionEventId, 'reopen does not overwrite or imply a new outcome cycle');
    assert.equal(afterReopen.completion.completedAt, completionTime);
    assert.equal(current['user-a'].filter((record) => record.taskId === taskId).length, 1);

    assert.equal((await request(`/api/tasks/${missingEstimateTaskId}`, 'DELETE', 'user-a')).status, 200);
    current = await readStore();
    assert.equal(current['user-a'].some((record) => record.taskId === missingEstimateTaskId), false, 'task deletion removes its snapshot');

    const invalidBodies = [null, [], { enabled: true, extra: 'private' }, { enabled: true, schemaVersion: 999 }];
    for (const body of invalidBodies) {
      const response = await request(consentPath, 'PUT', 'user-a', body);
      assert.equal(response.status, 400);
      const responseText = await response.text();
      assert.equal(responseText.includes('Do not store'), false);
      assert.equal(responseText.includes('user-b'), false);
      assert.equal(responseText.includes('task_ml_outcomes'), false);
    }

    assert.equal((await request(consentPath, 'PUT', 'user-b', { enabled: true })).status, 200);
    await request('/api/tasks', 'POST', 'user-b', { title: 'User B opted in task' });
    assert.equal((await request(consentPath, 'PUT', 'user-a', { enabled: false })).status, 200);
    assert.deepEqual(await json(await request(consentPath, 'GET', 'user-a')), { enabled: false, optedInAt: null });
    current = await readStore();
    assert.equal(current['user-a'], undefined, 'opting out purges only this user records');
    assert.equal(current['user-b'].length, 1, 'another user data survives a purge');

    if (process.platform !== 'win32') {
      const dataMode = (await fs.stat(path.join(isolatedCwd, 'data'))).mode & 0o777;
      const outcomeMode = (await fs.stat(storePath)).mode & 0o777;
      const profileMode = (await fs.stat(path.join(isolatedCwd, 'data', 'planning_profiles.json'))).mode & 0o777;
      assert.equal(dataMode, 0o700);
      assert.equal(outcomeMode, 0o600);
      assert.equal(profileMode, 0o600, 'consent-containing profile file is restricted to the server account');
    }
    console.log('ML outcome HTTP integration tests passed: auth, tenant isolation, consent lifecycle, task snapshots, deletion, and safe validation.');
  } finally {
    child.kill();
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once('exit', () => resolve());
      setTimeout(resolve, 5_000).unref();
    });
    await fs.rm(isolatedCwd, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'ml_outcome_http_test_failed');
  process.exitCode = 1;
});
