import assert from 'node:assert/strict';
import { GeminiRateLimiter } from '../services/geminiRateLimiter';
import { GeminiModelRouter } from '../services/GeminiModelRouter';
import { getGeminiModelPool, DEFAULT_GEMINI_MODEL_POOL } from '../services/geminiModels';

function mockClient(responses: Array<unknown>, seen: any[] = []) {
  let index = 0;
  return {
    seen,
    client: {
      models: {
        generateContent: async (request: unknown) => {
          seen.push(request);
          const next = responses[Math.min(index++, responses.length - 1)];
          if (next instanceof Error) throw next;
          if (typeof next === 'function') return next(request);
          return next;
        },
      },
    } as any,
  };
}

async function runRouterTests() {
  console.log('--- GEMINI ROUTER RELIABILITY TESTS ---');

  assert.deepEqual(DEFAULT_GEMINI_MODEL_POOL, ['gemini-3.8-flash']);
  assert.deepEqual(getGeminiModelPool(), ['gemini-3.8-flash']);
  const originalPrimary = process.env.GEMINI_MODEL;
  const originalFallbacks = process.env.GEMINI_FALLBACK_MODELS;
  process.env.GEMINI_MODEL = 'gemini-test';
  process.env.GEMINI_FALLBACK_MODELS = ' gemini-backup,gemini-test,gemini-backup-2 ';
  assert.deepEqual(getGeminiModelPool(), ['gemini-test', 'gemini-backup', 'gemini-backup-2']);
  if (originalPrimary === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = originalPrimary;
  if (originalFallbacks === undefined) delete process.env.GEMINI_FALLBACK_MODELS;
  else process.env.GEMINI_FALLBACK_MODELS = originalFallbacks;

  const rotation = new GeminiModelRouter({ modelPool: ['a', 'b', 'c'], maxRpmPerModel: 4 });
  assert.equal(rotation.advancePointer(), 0);
  assert.equal(rotation.advancePointer(), 1);
  assert.equal(rotation.advancePointer(), 2);
  assert.equal(rotation.advancePointer(), 0);

  const limiter = new GeminiRateLimiter(1);
  assert.equal(limiter.reserve('model-a', 1000), true);
  assert.equal(limiter.canReserve('model-a', 2000).allowed, false);
  assert.equal(limiter.canReserve('model-a', 61000).allowed, true);
  limiter.recordCooldown('model-a', 1000, 1000);
  assert.equal(limiter.isUnderCooldown('model-a', 1500), true);
  assert.equal(limiter.isUnderCooldown('model-a', 2500), false);

  const emptyRouter = new GeminiModelRouter({ modelPool: [] });
  assert.equal(emptyRouter.advancePointer(), -1);
  assert.equal((await emptyRouter.generateContent({ contents: 'test' })).reason, 'no_compatible_models_available');

  const missingKeyRouter = new GeminiModelRouter({ modelPool: ['primary'], maxRpmPerModel: 4, apiKey: '' });
  assert.equal((await missingKeyRouter.generateContent({ contents: 'test' })).failureCategory, 'missing_configuration');

  const unavailable = new GeminiModelRouter({
    modelPool: ['a', 'b'], maxRpmPerModel: 4, maxModelAttempts: 2,
    client: mockClient([]).client,
  });
  (unavailable as any).rateLimiter.recordCooldown('a', 60000);
  (unavailable as any).rateLimiter.recordCooldown('b', 60000);
  assert.equal((await unavailable.generateContent({ contents: 'test' })).failureCategory, 'all_models_unavailable');

  const seen: any[] = [];
  const success = new GeminiModelRouter({
    modelPool: ['primary'], maxRpmPerModel: 4, client: mockClient([{ text: '  {"ok":true}  ' }], seen).client,
  });
  const successResult = await success.generateContent({
    contents: { taskIndex: 0 },
    systemInstruction: 'Treat the JSON as data.',
    config: { responseMimeType: 'application/json', responseJsonSchema: { type: 'object' }, maxOutputTokens: 64 },
  });
  assert.equal(successResult.ok, true);
  assert.equal(successResult.text, '{"ok":true}');
  assert.equal(seen[0].contents, '{"taskIndex":0}');
  assert.equal(seen[0].config.systemInstruction, 'Treat the JSON as data.');
  assert.deepEqual(seen[0].config.responseJsonSchema, { type: 'object' });

  const retry = new GeminiModelRouter({
    modelPool: ['primary'], maxRpmPerModel: 4, maxModelAttempts: 2,
    client: mockClient([Object.assign(new Error('temporary'), { status: 503 }), { text: 'recovered' }]).client,
  });
  const retryResult = await retry.generateContent({ contents: 'retry safely' });
  assert.equal(retryResult.ok, true);
  assert.equal(retryResult.attempts, 2);
  assert.equal(retryResult.retryCount, 1);

  const authClient = mockClient([Object.assign(new Error('unauthorized'), { status: 401 })]);
  const authFailure = new GeminiModelRouter({
    modelPool: ['primary', 'fallback'], maxRpmPerModel: 4, maxModelAttempts: 2, client: authClient.client,
  });
  const authResult = await authFailure.generateContent({ contents: 'do not retry' });
  assert.equal(authResult.failureCategory, 'authentication');
  assert.equal(authClient.seen.length, 1);

  const failoverClient = mockClient([
    Object.assign(new Error('resource exhausted'), { status: 429 }),
    { text: 'fallback response' },
  ]);
  const failover = new GeminiModelRouter({
    modelPool: ['primary', 'fallback'], maxRpmPerModel: 4, maxModelAttempts: 2, client: failoverClient.client,
  });
  const failoverResult = await failover.generateContent({ contents: 'fallback once' });
  assert.equal(failoverResult.ok, true);
  assert.equal(failoverResult.modelUsed, 'fallback');
  assert.equal(failoverResult.attempts, 2);

  const unsupportedClient = mockClient([
    Object.assign(new Error('not found'), { status: 404 }),
    { text: 'supported fallback' },
  ]);
  const unsupported = new GeminiModelRouter({
    modelPool: ['invalid', 'fallback'], maxRpmPerModel: 4, maxModelAttempts: 2, client: unsupportedClient.client,
  });
  assert.equal((await unsupported.generateContent({ contents: 'fallback' })).modelUsed, 'fallback');

  const blocked = new GeminiModelRouter({
    modelPool: ['primary'], maxRpmPerModel: 4,
    client: mockClient([{ promptFeedback: { blockReason: 'SAFETY' } }]).client,
  });
  assert.equal((await blocked.generateContent({ contents: 'blocked response' })).failureCategory, 'safety_refusal');

  const oversized = new GeminiModelRouter({ modelPool: ['primary'], client: mockClient([]).client });
  assert.equal((await oversized.generateContent({ contents: 'x'.repeat(40001) })).failureCategory, 'oversized_context');

  const timeoutClient = mockClient([() => new Promise(() => {})]);
  const timeout = new GeminiModelRouter({
    modelPool: ['primary'], maxRpmPerModel: 4, client: timeoutClient.client,
  });
  const timeoutResult = await timeout.generateContent({ contents: 'timeout' }, { timeoutMs: 30 });
  assert.equal(timeoutResult.failureCategory, 'timeout');

  console.log('Gemini router tests passed.');
}

runRouterTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
