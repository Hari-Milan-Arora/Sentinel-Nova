/**
 * Isolated Unit Tests for Gemini Circular LLM Callback Router
 *
 * Tests:
 * 1. Single model success
 * 2. Circular rotation: model0 → model1
 * 3. Circular wrap-around: model9 → model0
 * 4. 4 RPM rolling window limit
 * 5. 429 Quota exhaustion rotation & cooldown
 * 6. All models unavailable structured failure
 * 7. Request deadline termination
 * 8. Empty model pool safety (no % 0)
 */

import { GeminiRateLimiter } from '../services/geminiRateLimiter';
import { GeminiModelRouter } from '../services/GeminiModelRouter';
import { getGeminiModelPool, DEFAULT_GEMINI_MODEL_POOL } from '../services/geminiModels';

async function runRouterTests() {
  console.log('--- STARTING GEMINI CIRCULAR ROUTER ISOLATION TESTS ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`, detail || '');
      failed++;
    }
  }

  // 1. Safe construction & Model configuration check
  const pool = getGeminiModelPool();
  assert(pool.length >= 10, 'Default model pool has at least 10 models', pool.length);
  assert(pool[0] === 'gemini-2.5-flash', 'Model 0 is gemini-2.5-flash');

  const router = new GeminiModelRouter({
    modelPool: ['model0', 'model1', 'model2', 'model3', 'model4', 'model5', 'model6', 'model7', 'model8', 'model9'],
    maxRpmPerModel: 4,
    maxModelAttempts: 10,
    routerTimeoutMs: 1500,
  });

  assert(router.getModelPool().length === 10, 'Router initialized with 10 candidate models');
  assert(router.getCurrentIndex() === 0, 'Pointer starts at index 0');

  // 2. Circular rotation: model0 -> model1
  const idx0 = router.advancePointer();
  assert(idx0 === 0, 'First advance returns index 0');
  assert(router.getCurrentIndex() === 1, 'Pointer advanced to index 1 (model0 -> model1)');

  // 3. Circular wrap-around: model9 -> model0
  for (let i = 1; i < 9; i++) {
    router.advancePointer();
  }
  assert(router.getCurrentIndex() === 9, 'Pointer is at index 9');
  const idx9 = router.advancePointer();
  assert(idx9 === 9, 'Advancing at index 9 returns 9');
  assert(router.getCurrentIndex() === 0, 'Pointer wrapped around: model9 -> model0');

  // 4. Rate Limiter: 4 RPM limit in rolling window
  const limiter = new GeminiRateLimiter(4);
  const now = Date.now();
  const testModel = 'test-model-alpha';

  assert(limiter.canReserve(testModel, now).allowed === true, 'RPM test: 1st reservation allowed');
  limiter.reserve(testModel, now);

  assert(limiter.canReserve(testModel, now + 1000).allowed === true, 'RPM test: 2nd reservation allowed');
  limiter.reserve(testModel, now + 1000);

  assert(limiter.canReserve(testModel, now + 2000).allowed === true, 'RPM test: 3rd reservation allowed');
  limiter.reserve(testModel, now + 2000);

  assert(limiter.canReserve(testModel, now + 3000).allowed === true, 'RPM test: 4th reservation allowed');
  limiter.reserve(testModel, now + 3000);

  // 5th reservation within same window must be BLOCKED
  const fifthCheck = limiter.canReserve(testModel, now + 4000);
  assert(fifthCheck.allowed === false, 'RPM test: 5th reservation blocked by 4 RPM limit');
  assert(fifthCheck.waitMs > 0, 'RPM test: waitMs is positive');
  assert(limiter.reserve(testModel, now + 4000) === false, 'RPM test: reserve() returns false when full');

  // After 60 seconds (window expired for first item), reservation must open up
  const afterWindowCheck = limiter.canReserve(testModel, now + 61000);
  assert(afterWindowCheck.allowed === true, 'RPM test: reservation opens up after 60-second window');

  // 5. Cooldown handling (429 handling)
  limiter.recordCooldown(testModel, 30000, now);
  assert(limiter.isUnderCooldown(testModel, now + 5000) === true, 'Model is under cooldown after 429');
  assert(limiter.canReserve(testModel, now + 5000).allowed === false, 'Reservation blocked during cooldown');
  assert(limiter.isUnderCooldown(testModel, now + 31000) === false, 'Model leaves cooldown after duration');

  // 6. Safe Empty Model Pool (% 0 protection)
  const emptyRouter = new GeminiModelRouter({ modelPool: [] });
  assert(emptyRouter.advancePointer() === -1, 'Empty pool advancePointer returns -1 safely without % 0');
  const emptyRes = await emptyRouter.generateContent({ contents: 'test' });
  assert(emptyRes.ok === false, 'Empty pool returns structured error');
  assert(emptyRes.exhausted === true, 'Empty pool marked as exhausted');
  assert(emptyRes.reason === 'no_compatible_models_available', 'Empty pool has expected structured reason');

  // 7. All models unavailable structured failure
  const unavailableRouter = new GeminiModelRouter({
    modelPool: ['m0', 'm1'],
    routerTimeoutMs: 200,
    maxModelAttempts: 4,
  });
  // Mark all models on cooldown
  (unavailableRouter as any).rateLimiter.recordCooldown('m0', 60000);
  (unavailableRouter as any).rateLimiter.recordCooldown('m1', 60000);

  const unavailableRes = await unavailableRouter.generateContent({ contents: 'test' });
  assert(unavailableRes.ok === false, 'All models unavailable returns structured ok: false');
  assert(unavailableRes.exhausted === true, 'All models unavailable marked exhausted');
  assert(
    unavailableRes.reason === 'all_models_unavailable' || unavailableRes.reason === 'deadline_exceeded',
    `Reason matches expected structured failure: ${unavailableRes.reason}`
  );

  // 8. Deadline termination
  const deadlineRouter = new GeminiModelRouter({
    modelPool: ['slow_model'],
    routerTimeoutMs: 150,
  });
  const deadlineRes = await deadlineRouter.generateContent({ contents: 'test' }, { timeoutMs: 100 });
  assert(deadlineRes.ok === false, 'Deadline exceeded returns ok: false');
  assert(deadlineRes.exhausted === true, 'Deadline exceeded marked exhausted');

  console.log(`\nISOLATION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runRouterTests().catch((err) => {
  console.error('Fatal isolation test error:', err);
  process.exit(1);
});
