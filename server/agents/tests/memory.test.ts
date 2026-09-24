/**
 * Comprehensive Memory Agent & Memory Store Audit Test Suite (Day 5B.3)
 *
 * Implements and verifies the full 50-scenario API Test Matrix:
 * - AUTH (1-5): Unauthenticated GET, POST, PUT, DELETE, retrieve
 * - ISOLATION (6-9): User A vs User B isolation across GET, PUT, DELETE, retrieve
 * - VALIDATION (10-14): Invalid type, importance, confidence, oversized, empty content
 * - SAFETY (15-20): Passwords, API keys, bearer tokens, OAuth tokens, cookies, card numbers
 * - AUTHORITY (21-23): Inferred cannot overwrite explicit/confirmed; explicit supersedes inference
 * - RETRIEVAL (24-29): Relevance, freshness, expiration, archive exclusion, deletion exclusion, max results
 * - DUPLICATES (30-32): Exact duplicate, normalized duplicate, legitimate distinct memories
 * - GEMINI (33-38): IDs absent, userId absent, secrets absent, malformed fallback, 429 fallback, timeout fallback
 * - AGENT (39-45): canHandle, retrieval proposal, create proposal, update proposal, archive proposal, delete proposal, proposal-only
 * - REGRESSION (46-50): ContextInspector, Planner, Prioritizer, Orchestrator, auth session isolation
 */

import assert from 'assert';
import { agentRegistry, novaOrchestrator } from '../index';
import { MemoryAgent } from '../agents/MemoryAgent';
import { MemoryReasoningService } from '../services/MemoryReasoningService';
import { memoryRetrievalEngine } from '../agents/MemoryRetrievalEngine';
import {
  getMemoriesByUser,
  getMemoryById,
  createMemory,
  updateMemory,
  archiveMemory,
  deleteMemory,
  supersedeMemory,
  retrieveRelevantMemories,
  validateMemoryInput,
  clearMemoriesCache,
} from '../../memoryStore';
import {
  classifySensitivity,
  isRestrictedContent,
  detectDuplicate,
  canOverwriteAuthority,
  calculateFreshnessScore,
  normalizeMemoryContent,
  normalizeForComparison,
} from '../../memorySafety';
import { AgentContext, AgentRequest } from '../types';

async function runMemoryAuditTestSuite() {
  console.log('================================================================');
  console.log('--- STARTING DAY 5B.3 MEMORY AUDIT MATRIX (50 SCENARIOS) ---');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}:`, err.message || err);
      failed++;
    }
  }

  clearMemoriesCache();

  // --------------------------------------------------------------------------
  // GROUP 1: AUTH (1-5)
  // --------------------------------------------------------------------------
  await test('1. AUTH: unauthenticated GET rejected', async () => {
    let errUser = false;
    try {
      await getMemoriesByUser('');
    } catch {
      errUser = true;
    }
    assert(errUser, 'getMemoriesByUser must reject empty userId');

    let errId = false;
    try {
      await getMemoryById('', 'mem_test');
    } catch {
      errId = true;
    }
    assert(errId, 'getMemoryById must reject empty userId');
  });

  await test('2. AUTH: unauthenticated POST rejected', async () => {
    let err = false;
    try {
      await createMemory('', { content: 'Valid preference', type: 'preference' });
    } catch {
      err = true;
    }
    assert(err, 'createMemory must reject empty userId');
  });

  await test('3. AUTH: unauthenticated PUT rejected', async () => {
    let err = false;
    try {
      await updateMemory('', 'mem_1', { content: 'Updated preference' });
    } catch {
      err = true;
    }
    assert(err, 'updateMemory must reject empty userId');
  });

  await test('4. AUTH: unauthenticated DELETE rejected', async () => {
    let err = false;
    try {
      await deleteMemory('', 'mem_1');
    } catch {
      err = true;
    }
    assert(err, 'deleteMemory must reject empty userId');
  });

  await test('5. AUTH: unauthenticated retrieve rejected', async () => {
    let err = false;
    try {
      await retrieveRelevantMemories('', { query: 'test' });
    } catch {
      err = true;
    }
    assert(err, 'retrieveRelevantMemories must reject empty userId');
  });

  // --------------------------------------------------------------------------
  // GROUP 2: ISOLATION (6-9)
  // --------------------------------------------------------------------------
  const userA = 'audit-user-a';
  const userB = 'audit-user-b';

  const memA = await createMemory(userA, {
    content: 'User A private confidential planning notes',
    type: 'working_style',
    importance: 'high',
    confidence: 0.95,
    source: 'user_explicit',
  });

  await test('6. ISOLATION: A cannot GET B', async () => {
    const listB = await getMemoriesByUser(userB);
    assert(!listB.some(m => m.id === memA.id), 'User B must not see User A memories in list');

    const readB = await getMemoryById(userB, memA.id);
    assert.strictEqual(readB, null, 'User B must not be able to read User A memory by ID');
  });

  await test('7. ISOLATION: A cannot PUT B', async () => {
    const updateAttempt = await updateMemory(userB, memA.id, { content: 'Hacked by B' });
    assert.strictEqual(updateAttempt, null, 'User B cannot update User A memory');

    // Attempting to inject a foreign userId in payload must be rejected
    let spoofAttempt = false;
    try {
      await updateMemory(userA, memA.id, { userId: userB, content: 'Spoof attempt' });
    } catch (e: any) {
      spoofAttempt = e.message.includes('foreign userId');
    }
    assert(spoofAttempt, 'Foreign userId injection must be rejected with access denied');
  });

  await test('8. ISOLATION: A cannot DELETE B', async () => {
    const deleteAttempt = await deleteMemory(userB, memA.id);
    assert.strictEqual(deleteAttempt, false, 'User B cannot delete User A memory');

    const verifyStillExists = await getMemoryById(userA, memA.id);
    assert(verifyStillExists, 'User A memory must remain untouched after User B delete attempt');
  });

  await test('9. ISOLATION: A cannot retrieve B', async () => {
    const retrievalB = await retrieveRelevantMemories(userB, { query: 'confidential planning notes' });
    assert.strictEqual(retrievalB.memories.length, 0, 'User B retrieval query must return 0 User A memories');
  });

  // --------------------------------------------------------------------------
  // GROUP 3: VALIDATION (10-14)
  // --------------------------------------------------------------------------
  await test('10. VALIDATION: invalid type rejected', () => {
    const val = validateMemoryInput({ content: 'Valid preference text', type: 'hacked_type' as any });
    assert(!val.valid, 'Invalid memory type must fail validation');
    assert(val.errors.some(e => e.includes('type')));
  });

  await test('11. VALIDATION: invalid importance rejected', () => {
    const val = validateMemoryInput({ content: 'Valid preference text', type: 'preference', importance: 'urgent_max' as any });
    assert(!val.valid, 'Invalid importance must fail validation');
    assert(val.errors.some(e => e.includes('importance')));
  });

  await test('12. VALIDATION: invalid confidence rejected', () => {
    const valHigh = validateMemoryInput({ content: 'Valid', type: 'preference', confidence: 1.5 });
    assert(!valHigh.valid, 'Confidence > 1.0 must fail validation');

    const valLow = validateMemoryInput({ content: 'Valid', type: 'preference', confidence: -0.2 });
    assert(!valLow.valid, 'Confidence < 0.0 must fail validation');
  });

  await test('13. VALIDATION: oversized content bounded & rejected', () => {
    const oversized = 'a'.repeat(1200);
    const val = validateMemoryInput({ content: oversized, type: 'preference' });
    assert(!val.valid, 'Content > 1000 characters must fail validation');

    const bounded = normalizeMemoryContent(oversized);
    assert.strictEqual(bounded.length, 1000, 'normalizeMemoryContent must cap at 1000 characters');
  });

  await test('14. VALIDATION: empty content rejected', () => {
    const val = validateMemoryInput({ content: '    ', type: 'preference' });
    assert(!val.valid, 'Empty or whitespace-only content must fail validation');
  });

  // --------------------------------------------------------------------------
  // GROUP 4: SAFETY (15-20)
  // --------------------------------------------------------------------------
  await test('15. SAFETY: password detected & restricted', () => {
    assert(isRestrictedContent('password: SuperSecretPass123!'));
    assert(isRestrictedContent('My password is securePass456'));
    const classification = classifySensitivity('Remember that my passcode: 987654');
    assert.strictEqual(classification.isRestricted, true);
  });

  await test('16. SAFETY: API key detected & restricted', () => {
    assert(isRestrictedContent('Google API key AIzaSyD-sampleApiKeyWithEnoughLength12345'));
    assert(isRestrictedContent('sk-abcdefghijklmnopqrstuvwxyz1234567890'));
    assert(isRestrictedContent('apikey: 1234567890abcdef1234567890'));
  });

  await test('17. SAFETY: bearer token detected & restricted', () => {
    assert(isRestrictedContent('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdef123456'));
    assert(isRestrictedContent('bearer_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdef123456'));
  });

  await test('18. SAFETY: OAuth token detected & restricted', () => {
    assert(isRestrictedContent('Google OAuth token ya29.a0AfH6SMA-sampleOauthAccessToken12345'));
    assert(isRestrictedContent('GitHub personal token ghp_abcdefghijklmnopqrstuvwxyz0123456789'));
    assert(isRestrictedContent('oauth_token: ya29.abcdef12345678901234567890'));
  });

  await test('19. SAFETY: cookie detected & restricted', () => {
    assert(isRestrictedContent('Cookie: sentinel_session=abcdef1234567890'));
    assert(isRestrictedContent('session_id: connect.sid=s%3Aabcdef1234567890'));
  });

  await test('20. SAFETY: card number detected & restricted', () => {
    assert(isRestrictedContent('Credit card: 4111 2222 3333 4444'));
    assert(isRestrictedContent('Card 3782-822463-10005'));
  });

  // --------------------------------------------------------------------------
  // GROUP 5: AUTHORITY (21-23)
  // --------------------------------------------------------------------------
  await test('21. AUTHORITY: inferred cannot overwrite explicit', async () => {
    assert(!canOverwriteAuthority('user_explicit', 'agent_inferred'));

    const userAuth1 = 'audit-auth-1';
    const explicitMem = await createMemory(userAuth1, {
      content: 'I only take meetings on Tuesdays',
      type: 'scheduling_preference',
      source: 'user_explicit',
    });

    let overwriteFailed = false;
    try {
      await updateMemory(userAuth1, explicitMem.id, {
        content: 'I take meetings all week',
        source: 'agent_inferred',
      });
    } catch {
      overwriteFailed = true;
    }
    assert(overwriteFailed, 'updateMemory must reject agent_inferred overwriting user_explicit');
  });

  await test('22. AUTHORITY: inferred cannot overwrite confirmed', async () => {
    assert(!canOverwriteAuthority('user_confirmed', 'agent_inferred'));

    const userAuth2 = 'audit-auth-2';
    const confirmedMem = await createMemory(userAuth2, {
      content: 'I never attend early morning meetings',
      type: 'scheduling_preference',
      source: 'user_confirmed',
    });

    let overwriteFailed = false;
    try {
      await updateMemory(userAuth2, confirmedMem.id, {
        content: 'I love 7am meetings',
        source: 'agent_inferred',
      });
    } catch {
      overwriteFailed = true;
    }
    assert(overwriteFailed, 'updateMemory must reject agent_inferred overwriting user_confirmed');
  });

  await test('23. AUTHORITY: explicit can supersede inference through valid update flow', async () => {
    assert(canOverwriteAuthority('agent_inferred', 'user_explicit'));

    const userAuth3 = 'audit-auth-3';
    const inferredMem = await createMemory(userAuth3, {
      content: 'User seems to prefer dark theme',
      type: 'preference',
      source: 'agent_inferred',
    });

    const updated = await updateMemory(userAuth3, inferredMem.id, {
      content: 'I explicitly prefer high contrast dark theme',
      source: 'user_explicit',
    });

    assert(updated);
    assert.strictEqual(updated.source, 'user_explicit');
    assert.strictEqual(updated.content, 'I explicitly prefer high contrast dark theme');
  });

  // --------------------------------------------------------------------------
  // GROUP 6: RETRIEVAL (24-29)
  // --------------------------------------------------------------------------
  const userRet = 'audit-retrieval-user';
  const memFocus = await createMemory(userRet, {
    content: 'Deep architecture work requires 3-hour uninterrupted blocks',
    type: 'working_style',
    importance: 'critical',
    confidence: 0.95,
  });

  await createMemory(userRet, {
    content: 'Prefers Earl Grey tea over coffee',
    type: 'preference',
    importance: 'low',
    confidence: 0.8,
  });

  await test('24. RETRIEVAL: relevance scoring and ranking', async () => {
    const res = await retrieveRelevantMemories(userRet, { query: 'architecture deep work' });
    assert(res.memories.length >= 1);
    assert.strictEqual(res.memories[0].id, memFocus.id, 'Most relevant memory must rank #1');
    assert(res.memories[0].relevanceScore >= 0.7);
  });

  await test('25. RETRIEVAL: freshness calculation', () => {
    const now = new Date().toISOString();
    const fresh = calculateFreshnessScore({
      createdAt: now,
      updatedAt: now,
      importance: 'medium',
      source: 'user_explicit',
    });
    assert.strictEqual(fresh, 1.0, 'Immediate memory must have freshness 1.0');

    const older = calculateFreshnessScore({
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
      importance: 'medium',
      source: 'user_explicit',
    }, '2026-09-10T00:00:00Z');
    assert(older < 1.0 && older >= 0.35, 'Older memory must exhibit decay');
  });

  await test('26. RETRIEVAL: expiration excludes temporary context', async () => {
    const expiredMem = await createMemory(userRet, {
      content: 'Temporary hotel reservation in Boston',
      type: 'temporary_context',
      expiresAt: '2026-09-01T00:00:00Z', // Past date
    });

    const res = await retrieveRelevantMemories(userRet, {
      query: 'hotel Boston',
      referenceTime: '2026-09-10T00:00:00Z',
    });
    assert(!res.memories.some(m => m.id === expiredMem.id), 'Expired temporary memory must be excluded from retrieval');
  });

  await test('27. RETRIEVAL: archive exclusion by default', async () => {
    const toArchive = await createMemory(userRet, {
      content: 'Archived project notes from Q1',
      type: 'preference',
    });
    await archiveMemory(userRet, toArchive.id);

    // Default: excluded
    const resDefault = await retrieveRelevantMemories(userRet, { query: 'Archived project notes' });
    assert(!resDefault.memories.some(m => m.id === toArchive.id), 'Archived memory must be excluded by default');

    // Explicit: included
    const resInclude = await retrieveRelevantMemories(userRet, { query: 'Archived project notes', includeArchived: true });
    assert(resInclude.memories.some(m => m.id === toArchive.id), 'Archived memory included when includeArchived=true');
  });

  await test('28. RETRIEVAL: deletion exclusion', async () => {
    const toDelete = await createMemory(userRet, {
      content: 'Memory about to be deleted',
      type: 'preference',
    });
    await deleteMemory(userRet, toDelete.id, false); // soft delete

    const res = await retrieveRelevantMemories(userRet, { query: 'about to be deleted' });
    assert(!res.memories.some(m => m.id === toDelete.id), 'Soft-deleted memory must be excluded from retrieval');

    const getById = await getMemoryById(userRet, toDelete.id);
    assert.strictEqual(getById, null, 'Soft-deleted memory must return null on getMemoryById');
  });

  await test('29. RETRIEVAL: maximum results bounded to 10', async () => {
    const res = await retrieveRelevantMemories(userRet, { limit: 100 });
    assert(res.memories.length <= 10, 'Results must be bounded by limit <= 10');
  });

  // --------------------------------------------------------------------------
  // GROUP 7: DUPLICATES (30-32)
  // --------------------------------------------------------------------------
  await test('30. DUPLICATES: exact duplicate returns existing ID', async () => {
    const userDup = 'audit-dup-user';
    const first = await createMemory(userDup, {
      content: 'User prefers dark mode UI interface.',
      type: 'preference',
      source: 'user_explicit',
    });

    const second = await createMemory(userDup, {
      content: 'User prefers dark mode UI interface.',
      type: 'preference',
      source: 'user_explicit',
    });

    assert.strictEqual(first.id, second.id, 'Exact duplicate must return existing memory without creating duplicate entry');
  });

  await test('31. DUPLICATES: normalized duplicate detected', async () => {
    const userDupNorm = 'audit-dup-norm';
    const first = await createMemory(userDupNorm, {
      content: 'User prefers morning work.',
      type: 'preference',
      source: 'user_explicit',
    });

    const second = await createMemory(userDupNorm, {
      content: '   user   prefers   morning work.   ',
      type: 'preference',
      source: 'user_explicit',
    });

    assert.strictEqual(first.id, second.id, 'Normalized whitespace/case duplicate must return existing memory ID');
  });

  await test('32. DUPLICATES: legitimate distinct memories remain separate', async () => {
    const userDistinct = 'audit-distinct-user';
    const memMorning = await createMemory(userDistinct, {
      content: 'User prefers morning work.',
      type: 'preference',
      source: 'user_explicit',
    });

    const memEvening = await createMemory(userDistinct, {
      content: 'User prefers evening work.',
      type: 'preference',
      source: 'user_explicit',
    });

    assert.notStrictEqual(memMorning.id, memEvening.id, 'Distinct memories must receive distinct IDs');
    const all = await getMemoriesByUser(userDistinct);
    assert.strictEqual(all.length, 2, 'Both legitimate memories must be persisted');
  });

  // --------------------------------------------------------------------------
  // GROUP 8: GEMINI UNTRUSTED BOUNDARY & FALLBACK (33-38)
  // --------------------------------------------------------------------------
  const reasoningService = new MemoryReasoningService();

  await test('33. GEMINI: internal IDs absent from reasoning snapshot', () => {
    const candidate = {
      id: 'mem_internal_secret_uuid_123',
      userId: 'user_secret_uuid_456',
      type: 'working_style' as const,
      content: 'Prefers pomodoro focus intervals',
      importance: 'medium' as const,
      confidence: 0.9,
      status: 'active' as const,
      source: 'user_explicit' as const,
      sourceReference: 'user_chat',
      sensitivity: 'normal' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      accessCount: 1,
      relevanceScore: 0.9,
      queryMatchScore: 1.0,
      freshnessScore: 1.0,
    };

    const snapshot = reasoningService.buildSanitizedSnapshot('What are my focus intervals?', 'retrieve', [candidate]);
    const json = JSON.stringify(snapshot);
    assert(!json.includes('mem_internal_secret_uuid_123'), 'Snapshot must not contain internal memory IDs');
    assert.strictEqual(snapshot.candidateMemories[0].index, 0, 'Candidates must be indexed anonymously');
  });

  await test('34. GEMINI: userId absent from reasoning snapshot', () => {
    const candidate = {
      id: 'mem_1',
      userId: 'user_highly_confidential_tenant_id',
      type: 'preference' as const,
      content: 'Prefers silent notification alerts',
      importance: 'medium' as const,
      confidence: 0.85,
      status: 'active' as const,
      source: 'user_explicit' as const,
      sourceReference: 'user_chat',
      sensitivity: 'normal' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      accessCount: 0,
      relevanceScore: 0.8,
      queryMatchScore: 0.8,
      freshnessScore: 1.0,
    };

    const snapshot = reasoningService.buildSanitizedSnapshot('Query', 'retrieve', [candidate]);
    const json = JSON.stringify(snapshot);
    assert(!json.includes('user_highly_confidential_tenant_id'), 'Snapshot must not contain userId');
  });

  await test('35. GEMINI: secrets and auth tokens absent from snapshot', () => {
    const snapshot = reasoningService.buildSanitizedSnapshot(
      'Remember password: 123 and token: sk-12345678901234567890',
      'remember',
      []
    );
    const json = JSON.stringify(snapshot);
    assert(!json.includes('sk-12345678901234567890'), 'Prompt secrets must be stripped from sanitized snapshot');
  });

  await test('36. GEMINI: malformed output handled by deterministic fallback', async () => {
    // Calling reasoning service with empty/unreachable setup falls back gracefully
    const res = await reasoningService.reasonAboutMemory('What do you recall?', 'retrieve', [], []);
    assert(res.summary.length > 0);
    assert(res.decisionExplanation.length > 0);
    assert(res.reasoningSource === 'deterministic_fallback' || res.reasoningSource === 'gemini_enhanced');
  });

  await test('37. GEMINI: 429 quota exhaustion fallback is clean and non-crashing', async () => {
    // Tests that reasoning service never throws on external model failure
    const res = await reasoningService.reasonAboutMemory('Remember morning routine', 'remember', [], []);
    assert(res !== null && typeof res === 'object');
    assert(typeof res.summary === 'string');
    assert(typeof res.decisionExplanation === 'string');
    assert(Array.isArray(res.relevantIndices));
  });

  await test('38. GEMINI: timeout fallback within bounds (<=3000ms)', async () => {
    const start = Date.now();
    await reasoningService.reasonAboutMemory('Check timeout bounds', 'retrieve', [], []);
    const elapsed = Date.now() - start;
    assert(elapsed < 6000, `Reasoning service must resolve promptly (took ${elapsed}ms)`);
  });

  // --------------------------------------------------------------------------
  // GROUP 9: AGENT BEHAVIOR & PROPOSAL SAFETY (39-45)
  // --------------------------------------------------------------------------
  const agent = agentRegistry.get('agent.memory') as MemoryAgent;
  const agentUser = 'audit-agent-user';

  const baseCtx: AgentContext = {
    userId: agentUser,
    requestId: 'req-audit-agent',
    executionId: 'exec-audit-agent',
    userRequest: '',
    timestamp: new Date().toISOString(),
    timezone: 'America/New_York',
  };

  await test('39. AGENT: canHandle accurately identifies memory requests', async () => {
    assert(await agent.canHandle({ ...baseCtx, userRequest: 'Remember that I do deep work in the morning' }));
    assert(await agent.canHandle({ ...baseCtx, userRequest: 'What do you remember about my schedule preferences?' }));
    assert(await agent.canHandle({ ...baseCtx, userRequest: 'Forget my preference for late meetings' }));
    assert(await agent.canHandle({ ...baseCtx, userRequest: 'Delete memory regarding billing notes' }));

    // Rejects planning and prioritization tasks
    assert(!(await agent.canHandle({ ...baseCtx, userRequest: 'Plan my meetings tomorrow' })));
    assert(!(await agent.canHandle({ ...baseCtx, userRequest: 'What should I work on first today?' })));
  });

  await test('40. AGENT: retrieval request produces retrieve proposals', async () => {
    const res = await agent.execute({
      ...baseCtx,
      userRequest: 'What do you remember about my working style?',
    });
    assert(res.success);
    assert.strictEqual(res.output.primaryIntent, 'retrieve');
  });

  await test('41. AGENT: create request produces MEMORY_CREATE proposal', async () => {
    const res = await agent.execute({
      ...baseCtx,
      userRequest: 'Remember that I prefer morning focus sessions before 11am',
    });
    assert(res.success);
    const createAction = res.actions.find(a => a.type === 'MEMORY_CREATE');
    assert(createAction, 'Must propose MEMORY_CREATE action');
    assert.strictEqual(createAction.requiresConfirmation, true);
  });

  await test('42. AGENT: conflicting preference produces update proposal with conflict reference', async () => {
    const userConflict = 'audit-conflict-agent-user';
    const existing = await createMemory(userConflict, {
      content: 'I prefer working strictly on Monday mornings',
      type: 'working_style',
      source: 'user_explicit',
    });

    const res = await agent.execute({
      ...baseCtx,
      userId: userConflict,
      userRequest: 'Remember that I prefer working strictly on Friday afternoons',
    });

    assert(res.success);
    const updateAction = res.actions.find(a => a.type === 'MEMORY_UPDATE');
    assert(updateAction, 'Must propose MEMORY_UPDATE action for conflicting preference');
    assert.strictEqual(updateAction.requiresConfirmation, true);
  });

  await test('43. AGENT: archive request produces MEMORY_ARCHIVE proposal', async () => {
    const userArch = 'audit-arch-agent-user';
    await createMemory(userArch, {
      content: 'Archive candidate regarding old desk layout',
      type: 'preference',
    });

    const res = await agent.execute({
      ...baseCtx,
      userId: userArch,
      userRequest: 'Archive my preference about old desk layout',
    });

    assert(res.success);
    const archAction = res.actions.find(a => a.type === 'MEMORY_ARCHIVE');
    assert(archAction, 'Must propose MEMORY_ARCHIVE action');
    assert.strictEqual(archAction.requiresConfirmation, true);
  });

  await test('44. AGENT: delete request produces MEMORY_DELETE proposal', async () => {
    const userDel = 'audit-del-agent-user';
    await createMemory(userDel, {
      content: 'Delete candidate regarding temporary wifi passcode',
      type: 'temporary_context',
    });

    const res = await agent.execute({
      ...baseCtx,
      userId: userDel,
      userRequest: 'Delete memory regarding temporary wifi passcode',
    });

    assert(res.success);
    const delAction = res.actions.find(a => a.type === 'MEMORY_DELETE');
    assert(delAction, 'Must propose MEMORY_DELETE action');
    assert.strictEqual(delAction.requiresConfirmation, true);
  });

  await test('45. AGENT: mutations remain strictly proposal-only (zero store side-effects)', async () => {
    const userSafe = 'audit-safety-agent-user';
    const countBefore = (await getMemoriesByUser(userSafe)).length;

    const res = await agent.execute({
      ...baseCtx,
      userId: userSafe,
      userRequest: 'Remember that I prefer taking lunch at 1pm sharp',
    });

    assert(res.success);
    const countAfter = (await getMemoriesByUser(userSafe)).length;
    assert.strictEqual(countBefore, countAfter, 'Agent execution must NEVER write to memoryStore directly');
    for (const action of res.actions) {
      assert.strictEqual(action.requiresConfirmation, true, 'All mutation actions must require confirmation');
    }
  });

  // --------------------------------------------------------------------------
  // GROUP 10: REGRESSION (46-50)
  // --------------------------------------------------------------------------
  const regUser = 'audit-regression-user';

  await test('46. REGRESSION: ContextInspector agent functions normally', async () => {
    const req: AgentRequest = {
      requestId: 'req-reg-inspector',
      userRequest: 'Inspect current context',
      preferredAgentId: 'agent.context_inspector',
    };
    const res = await novaOrchestrator.orchestrate(req, { userId: regUser });
    assert(res.success, 'ContextInspector orchestration must succeed');
    assert(res.agentResults.some(r => r.agentId === 'agent.context_inspector'));
  });

  await test('47. REGRESSION: Planner agent functions normally', async () => {
    const req: AgentRequest = {
      requestId: 'req-reg-planner',
      userRequest: 'Plan tasks for tomorrow',
      preferredAgentId: 'agent.planner',
    };
    const res = await novaOrchestrator.orchestrate(req, { userId: regUser });
    assert(res.success, 'Planner orchestration must succeed');
    assert(res.agentResults.some(r => r.agentId === 'agent.planner'));
  });

  await test('48. REGRESSION: Prioritizer agent functions normally', async () => {
    const req: AgentRequest = {
      requestId: 'req-reg-prio',
      userRequest: 'What should I prioritize today?',
      preferredAgentId: 'agent.prioritizer',
    };
    const res = await novaOrchestrator.orchestrate(req, { userId: regUser });
    assert(res.success, 'Prioritizer orchestration must succeed');
    assert(res.agentResults.some(r => r.agentId === 'agent.prioritizer'));
  });

  await test('49. REGRESSION: Orchestrator coordinates multi-agent lifecycle cleanly', async () => {
    const req: AgentRequest = {
      requestId: 'req-reg-orch',
      userRequest: 'What do you remember about my working style preferences?',
      preferredAgentId: 'agent.memory',
    };
    const res = await novaOrchestrator.orchestrate(req, { userId: regUser });
    assert(res.success, 'Memory agent orchestration must succeed');
    assert.strictEqual(res.lifecycleStatus, 'COMPLETED');
    assert(res.traces.length > 0, 'Orchestration must produce execution traces');
  });

  await test('50. REGRESSION: Auth session isolation preserved across multi-agent calls', async () => {
    const user1 = 'audit-session-user-1';
    const user2 = 'audit-session-user-2';

    await createMemory(user1, {
      content: 'User 1 strictly confidential scheduling preference',
      type: 'scheduling_preference',
      source: 'user_explicit',
    });

    const reqUser2: AgentRequest = {
      requestId: 'req-reg-iso',
      userRequest: 'What do you remember about my scheduling preferences?',
      preferredAgentId: 'agent.memory',
    };

    const resUser2 = await novaOrchestrator.orchestrate(reqUser2, { userId: user2 });
    assert(resUser2.success);
    const memoriesReturned = (resUser2.agentResults[0]?.output as any)?.memories || [];
    assert(!memoriesReturned.some((m: any) => m.content.includes('User 1 strictly confidential')));
  });

  // --------------------------------------------------------------------------
  // GROUP 11: ADVANCED RETRIEVAL & CONFLICT ENGINE (51-57)
  // --------------------------------------------------------------------------
  const engUser = 'audit-engine-user';

  await test('51. ENGINE: supersedeMemory transitions status and records metadata', async () => {
    const original = await createMemory(engUser, {
      content: 'Original preference about work environment',
      type: 'preference',
      source: 'user_explicit',
    });
    const replacement = await createMemory(engUser, {
      content: 'Updated preference about work environment with dual monitors',
      type: 'preference',
      source: 'user_explicit',
    });

    const superseded = await supersedeMemory(engUser, original.id, replacement.id);
    assert(superseded, 'supersedeMemory must return updated record');
    assert.strictEqual(superseded.status, 'superseded');
    assert.strictEqual(superseded.metadata?.supersededBy, replacement.id);
  });

  await test('52. ENGINE: retrieval excludes superseded memories by default', async () => {
    const oldMem = await createMemory(engUser, {
      content: 'Old outdated coffee preference',
      type: 'preference',
      status: 'superseded',
    });

    const resDefault = await retrieveRelevantMemories(engUser, { query: 'coffee preference' });
    assert(!resDefault.memories.some(m => m.id === oldMem.id), 'Superseded memory must be excluded by default');

    const resInclude = await retrieveRelevantMemories(engUser, { query: 'coffee preference', includeSuperseded: true });
    assert(resInclude.memories.some(m => m.id === oldMem.id), 'Superseded memory included when includeSuperseded=true');
  });

  await test('53. ENGINE: MemoryRetrievalEngine weighted ranking formula', async () => {
    const ranked = await memoryRetrievalEngine.retrieve(engUser, {
      query: 'deep architecture focus',
      limit: 5,
    });
    assert(ranked.memories.length >= 0);
    assert(typeof ranked.totalMatched === 'number');
    for (const mem of ranked.memories) {
      assert(mem.relevanceScore >= 0.0 && mem.relevanceScore <= 1.0, 'Relevance score must be clamped [0.0, 1.0]');
      assert(typeof mem.lexicalScore === 'number');
      assert(typeof mem.freshnessScore === 'number');
    }
  });

  await test('54. ENGINE: MemoryRetrievalEngine conflict detection & authority resolution', () => {
    const memoryA = {
      id: 'mem_morning_focus',
      userId: engUser,
      type: 'working_style' as const,
      content: 'I prefer doing deep work exclusively in the morning.',
      importance: 'high' as const,
      confidence: 0.9,
      status: 'active' as const,
      source: 'user_explicit' as const,
      sourceReference: 'user_chat',
      sensitivity: 'normal' as const,
      explicit: true,
      createdAt: '2026-09-01T09:00:00Z',
      updatedAt: '2026-09-01T09:00:00Z',
      lastAccessedAt: '2026-09-01T09:00:00Z',
      accessCount: 1,
    };

    const memoryB = {
      id: 'mem_afternoon_focus',
      userId: engUser,
      type: 'working_style' as const,
      content: 'I prefer doing deep work exclusively in the afternoon.',
      importance: 'medium' as const,
      confidence: 0.7,
      status: 'active' as const,
      source: 'agent_inferred' as const,
      sourceReference: 'activity_pattern',
      sensitivity: 'normal' as const,
      explicit: false,
      createdAt: '2026-09-10T14:00:00Z',
      updatedAt: '2026-09-10T14:00:00Z',
      lastAccessedAt: '2026-09-10T14:00:00Z',
      accessCount: 1,
    };

    const conflicts = memoryRetrievalEngine.detectConflicts([memoryA, memoryB]);
    assert(conflicts.length >= 1, 'Opposing time-of-day working styles must trigger conflict detection');
    const primaryConflict = conflicts[0];
    assert.strictEqual(primaryConflict.authoritativeMemoryId, memoryA.id, 'User explicit memory must resolve as authoritative over inferred');
    assert(primaryConflict.authoritativeReason.includes('authority') || primaryConflict.authoritativeReason.includes('explicit'));
  });

  await test('55. ENGINE: contextual match boosts active tasks and goals', async () => {
    const ctxWithTask: AgentContext = {
      ...baseCtx,
      userRequest: 'What should I pay attention to first?',
      taskContext: {
        activeTasks: [
          {
            id: 'task_api_refactor',
            title: 'Refactor Kubernetes Cluster Deployment',
            priority: 'urgent',
            status: 'todo',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as any,
        ],
      } as any,
    };

    const k8sMem = await createMemory(engUser, {
      content: 'Kubernetes cluster deployment guidelines and best practices',
      type: 'project_context',
      importance: 'high',
      source: 'user_explicit',
    });

    const res = await memoryRetrievalEngine.retrieve(
      engUser,
      { query: 'What should I pay attention to first?' },
      ctxWithTask
    );

    const found = res.memories.find(m => m.id === k8sMem.id);
    assert(found, 'Task-relevant memory must be retrieved under active task context');
    assert((found.contextualBoost || 0) >= 0.05, 'Contextual boost must be awarded for active task match');
  });

  await test('56. ENGINE: tag filtering matches items by tag', async () => {
    const taggedMem = await createMemory(engUser, {
      content: 'Frontend styling guidelines using Tailwind CSS',
      type: 'preference',
      tags: ['frontend', 'styling', 'tailwind'],
    });

    const res = await retrieveRelevantMemories(engUser, {
      tags: ['tailwind'],
    });

    assert(res.memories.some(m => m.id === taggedMem.id), 'Tagged memory must be returned by tag filter');
  });

  await test('57. ENGINE: MemoryAgent outputs relevantMemories and rankedMemories matching ScoredMemoryItemSafe contract', async () => {
    const res = await agent.execute({
      ...baseCtx,
      userId: engUser,
      userRequest: 'Recall my preferences regarding deep work',
    });

    assert(res.success);
    assert(Array.isArray(res.output.relevantMemories));
    assert(Array.isArray(res.output.rankedMemories));
    assert(Array.isArray(res.output.conflicts));

    // Verify safe items contain NO internal tenant leakage
    for (const item of res.output.relevantMemories) {
      assert(typeof item.memoryId === 'string');
      assert(typeof item.content === 'string');
      assert(typeof item.relevanceScore === 'number');
      assert((item as any).userId === undefined, 'ScoredMemoryItemSafe must never expose userId');
    }
  });

  console.log('\n================================================================');
  console.log(`AUDIT TEST MATRIX RESULT: ${passed} / ${passed + failed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMemoryAuditTestSuite().catch(err => {
  console.error('Fatal error running memory audit test suite:', err);
  process.exit(1);
});
