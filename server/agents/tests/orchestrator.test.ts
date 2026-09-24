/**
 * Multi-Agent Runtime Foundation Unit & Integration Tests (Day 5A)
 *
 * Verifies:
 * - Agent registration and duplicate prevention
 * - Capability discovery
 * - BaseAgent lifecycle and timeout isolation
 * - Context construction and user isolation
 * - Action proposal generation (ZERO execution)
 * - Deterministic ContextInspectorAgent execution
 * - NovaOrchestrator lifecycle and tracing
 */

import { BaseAgent } from '../Agent';
import { AgentRegistry } from '../AgentRegistry';
import { NovaOrchestrator } from '../NovaOrchestrator';
import { ContextInspectorAgent } from '../agents/ContextInspectorAgent';
import { AgentCapability, AgentContext, AgentResult } from '../types';
import { normalizeConfidence } from '../AgentResult';

// Test Agent that times out intentionally
class SlowTestAgent extends BaseAgent {
  public readonly id = 'agent.slow_test';
  public readonly name = 'Slow Test Agent';
  public readonly description = 'Agent for testing timeout boundaries';
  public readonly version = '1.0.0';
  public readonly capabilities: AgentCapability[] = ['testing'];

  constructor() {
    super(100); // 100ms timeout
  }

  public canHandle(): boolean {
    return true;
  }

  protected async run(): Promise<AgentResult> {
    // Sleep longer than timeout
    await new Promise((resolve) => setTimeout(resolve, 300));
    return this.createSuccess({} as AgentContext, { done: true });
  }
}

// Test Agent that throws intentionally
class CrashingTestAgent extends BaseAgent {
  public readonly id = 'agent.crashing_test';
  public readonly name = 'Crashing Test Agent';
  public readonly description = 'Agent for testing error isolation';
  public readonly version = '1.0.0';
  public readonly capabilities: AgentCapability[] = ['testing'];

  constructor() {
    super(1000);
  }

  public canHandle(): boolean {
    return true;
  }

  protected async run(): Promise<AgentResult> {
    throw new Error('Simulated agent explosion!');
  }
}

async function runTests() {
  console.log('--- STARTING MULTI-AGENT RUNTIME FOUNDATION TESTS (DAY 5A) ---');
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

  // 1. Confidence Normalization
  assert(normalizeConfidence(0.85) === 0.85, 'Confidence 0.85 stays 0.85');
  assert(normalizeConfidence(1.5) === 1.0, 'Confidence > 1.0 clamps to 1.0');
  assert(normalizeConfidence(-0.2) === 0.0, 'Confidence < 0.0 clamps to 0.0');
  assert(normalizeConfidence(undefined) === undefined, 'Confidence undefined stays undefined');

  // 2. Registry Tests
  const registry = new AgentRegistry();
  const inspector = new ContextInspectorAgent();
  registry.register(inspector);
  assert(registry.has(inspector.id), 'Registry correctly stores agent');
  assert(registry.get(inspector.id) === inspector, 'Registry retrieves agent by ID');

  let duplicateThrew = false;
  try {
    registry.register(inspector);
  } catch (err: any) {
    duplicateThrew = err.message.includes('DuplicateAgentRegistrationError');
  }
  assert(duplicateThrew, 'Registry prevents duplicate agent IDs');

  // 3. Capability Discovery
  const testingAgents = registry.findByCapability('testing');
  assert(testingAgents.length === 1 && testingAgents[0].id === inspector.id, 'Discovers agents by capability');
  const emptyAgents = registry.findByCapability('recovery');
  assert(emptyAgents.length === 0, 'Returns empty array for unrepresented capability');

  // 4. BaseAgent Execution & Timeout Boundary
  const slowAgent = new SlowTestAgent();
  const mockContext: AgentContext = {
    userId: 'user-test-123',
    requestId: 'req-1',
    executionId: 'exec-1',
    userRequest: 'Please inspect the state',
    timestamp: new Date().toISOString(),
    timezone: 'UTC',
    tasks: [],
    goals: [],
    projects: [],
  };

  const slowResult = await slowAgent.execute(mockContext);
  assert(!slowResult.success, 'Slow agent fails safely');
  assert(slowResult.errors[0]?.code === 'TIMEOUT', 'Slow agent returns TIMEOUT error code');

  // 5. BaseAgent Error Isolation
  const crashAgent = new CrashingTestAgent();
  const crashResult = await crashAgent.execute(mockContext);
  assert(!crashResult.success, 'Crashing agent does not crash process');
  assert(crashResult.errors[0]?.code === 'EXECUTION_FAILED', 'Crashing agent returns EXECUTION_FAILED error code');
  assert(crashResult.errors[0]?.message === 'Simulated agent explosion!', 'Crashing agent reports error message safely');

  // 6. ContextInspectorAgent Deterministic Execution & Action Proposals
  const inspectResult = await inspector.execute(mockContext);
  assert(inspectResult.success, 'ContextInspectorAgent succeeds');
  assert(inspectResult.confidence === 1.0, 'Inspector returns confidence 1.0');
  assert(inspectResult.actions.length === 1, 'Inspector generates 1 action proposal');
  assert(inspectResult.actions[0].type === 'INSPECT_CONTEXT', 'Action proposal is INSPECT_CONTEXT');
  assert(inspectResult.actions[0].requiresConfirmation === false, 'Inspection action proposal is low risk');
  assert((inspectResult.output as any).runtimeStatus === 'operational', 'Runtime status is operational');

  // 7. NovaOrchestrator Lifecycle & Tracing
  const orchestrator = new NovaOrchestrator({ registry });
  const orchestrationResult = await orchestrator.orchestrate(
    {
      requestId: 'req-test-lifecycle',
      userRequest: 'inspect current system health',
      preferredAgentId: inspector.id,
    },
    { userId: 'user-test-123' }
  );

  assert(orchestrationResult.success, 'Orchestrator completes successfully');
  assert(orchestrationResult.lifecycleStatus === 'COMPLETED', 'Lifecycle status is COMPLETED');
  assert(orchestrationResult.agentResults.length === 1, 'Orchestration contains 1 agent result');
  assert(orchestrationResult.traces.length === 1, 'Orchestration records 1 execution trace');
  assert(orchestrationResult.traces[0].agentId === inspector.id, 'Trace records correct agentId');
  assert(orchestrationResult.traces[0].durationMs >= 0, 'Trace records valid duration');
  assert(orchestrationResult.proposedActions.length === 1, 'Orchestration aggregates proposed actions');

  // 8. Unknown Agent Rejection
  const unknownResult = await orchestrator.orchestrate(
    {
      requestId: 'req-unknown',
      userRequest: 'run unknown',
      preferredAgentId: 'agent.non_existent',
    },
    { userId: 'user-test-123' }
  );
  assert(!unknownResult.success, 'Unknown agent request fails cleanly');
  assert(unknownResult.lifecycleStatus === 'FAILED', 'Lifecycle status is FAILED for unknown agent');
  assert(unknownResult.error?.code === 'NO_CAPABLE_AGENT', 'Error code is NO_CAPABLE_AGENT');

  console.log(`\nTEST SUMMARY: ${passed} PASSED, ${failed} FAILED\n`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
