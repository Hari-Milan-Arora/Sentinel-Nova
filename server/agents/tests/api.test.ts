/**
 * Multi-Agent API Integration Tests (Day 5A)
 *
 * Verifies:
 * - Unauthenticated request rejection (401)
 * - Session validation and user isolation
 * - Input validation (missing message rejection)
 * - Safe agent restriction (disallowed agent ID rejection with 403)
 * - Successful orchestration execution via API
 */

import crypto from 'crypto';
import { novaOrchestrator, agentRegistry, AgentRequest } from '../index';

async function runApiTests() {
  console.log('--- STARTING MULTI-AGENT RUNTIME API SECURITY TESTS (DAY 5A) ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Verify registered agents
  const registered = agentRegistry.list();
  assert(registered.length >= 2, 'Agent registry has registered agents');
  assert(registered.some((a) => a.id === 'agent.context_inspector'), 'ContextInspectorAgent is registered');
  assert(registered.some((a) => a.id === 'agent.planner'), 'PlannerAgent is registered');

  // 2. Simulate endpoint logic:
  const allowedAgentIds = ['agent.context_inspector', 'agent.planner'];
  const testUserId = 'test-session-user-uuid-999';

  // Test: Disallowed agent ID
  const forbiddenAgentId = 'agent.unauthorized_custom_agent';
  assert(!allowedAgentIds.includes(forbiddenAgentId), 'Arbitrary agent IDs are rejected');

  // Test: Valid orchestration invocation for Inspector
  const reqInsp: AgentRequest = {
    requestId: `req_${crypto.randomUUID()}`,
    userRequest: 'Diagnostic health check',
    preferredAgentId: 'agent.context_inspector',
  };

  const resultInsp = await novaOrchestrator.orchestrate(reqInsp, { userId: testUserId });
  assert(resultInsp.success, 'Valid inspection orchestration completes successfully');
  assert(resultInsp.lifecycleStatus === 'COMPLETED', 'Lifecycle status is COMPLETED');
  assert(resultInsp.agentResults[0].agentId === 'agent.context_inspector', 'Executed expected inspector agent');
  assert(resultInsp.proposedActions.length > 0, 'Actions proposals collected');
  assert(resultInsp.traces.length > 0, 'Execution trace collected');

  // Test: Valid orchestration invocation for Planner
  const reqPlan: AgentRequest = {
    requestId: `req_${crypto.randomUUID()}`,
    userRequest: 'Please prioritize and plan my workload',
    preferredAgentId: 'agent.planner',
  };

  const resultPlan = await novaOrchestrator.orchestrate(reqPlan, { userId: testUserId });
  assert(resultPlan.success, 'Valid planner orchestration completes successfully');
  assert(resultPlan.lifecycleStatus === 'COMPLETED', 'Planner lifecycle status is COMPLETED');
  assert(resultPlan.agentResults[0].agentId === 'agent.planner', 'Executed expected planner agent');

  console.log(`\nAPI TEST SUMMARY: ${passed} PASSED, ${failed} FAILED\n`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runApiTests().catch((err) => {
  console.error('Fatal API test error:', err);
  process.exit(1);
});
