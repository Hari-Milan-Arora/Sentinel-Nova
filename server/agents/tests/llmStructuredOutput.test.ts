import assert from 'node:assert/strict';
import { parseStrictJsonObject } from '../services/structuredOutput';
import { PlanningReasoningService } from '../services/PlanningReasoningService';
import { PrioritizationReasoningService } from '../services/PrioritizationReasoningService';
import type { GeminiModelRouter } from '../services/GeminiModelRouter';
import type { PlannerOutput } from '../agents/plannerTypes';
import type { PrioritizerOutput } from '../agents/prioritizerTypes';

async function main() {
  assert.deepEqual(parseStrictJsonObject('{"a":1}', ['a'], ['a']), { a: 1 });
  assert.equal(parseStrictJsonObject('```json\n{"a":1}\n```', ['a'], ['a']), null);
  assert.equal(parseStrictJsonObject('{"a":1,"extra":true}', ['a'], ['a']), null);
  assert.equal(parseStrictJsonObject('{"a":1}', ['a', 'b'], ['a', 'b']), null);
  assert.equal(parseStrictJsonObject('[]', ['a'], ['a']), null);

  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'mock-key';
  try {
    const plan = {
      objectiveSummary: { activeGoals: 1, activeProjects: 1 },
      prioritizedItems: [{ taskId: 'trusted-task-id', title: 'Prepare milestone', priorityScore: 0.8, effortScore: 0.5, deadlineScore: 0.4 }],
      strategyCandidates: [],
      recommendedStrategy: { name: 'balanced' },
      rationale: 'Deterministic rationale',
      risks: [],
      confidence: 0.62,
    } as unknown as PlannerOutput;

    let request: any;
    const validRouter = {
      generateContent: async (value: unknown) => {
        request = value;
        return { ok: true, text: JSON.stringify({
          refinedRationale: 'A grounded rationale.',
          strategicInsight: 'Finish the next milestone.',
          additionalRisks: [],
          highlightedItemIndexes: [0],
        }) };
      },
    } as unknown as GeminiModelRouter;
    const planning = new PlanningReasoningService(validRouter);
    const enhancedPlan = await planning.enhancePlan(plan, 'Plan this work');
    assert.equal(enhancedPlan.enhanced, true);
    assert.equal(enhancedPlan.plan.confidence, plan.confidence, 'LLM must not set numerical confidence');
    assert.deepEqual(request.contents, JSON.stringify(planning.buildSanitizedSnapshot(plan, 'Plan this work')));
    assert.ok(request.systemInstruction);
    assert.equal(request.config.responseMimeType, 'application/json');
    assert.ok(request.config.responseJsonSchema);
    assert.equal(enhancedPlan.plan.metadata?.highlightedItemIndexes, undefined);
    assert.deepEqual(enhancedPlan.plan.metadata?.highlightedTaskIds, ['trusted-task-id']);

    const invalidRouter = {
      generateContent: async () => ({
        ok: true,
        text: JSON.stringify({
          refinedRationale: 'Should be rejected.',
          strategicInsight: 'Bad reference.',
          additionalRisks: [],
          highlightedItemIndexes: [99],
          actionType: 'COMPLETE_TASK',
        }),
      }),
    } as unknown as GeminiModelRouter;
    const failedClosed = await new PlanningReasoningService(invalidRouter).enhancePlan(plan, 'Plan');
    assert.equal(failedClosed.enhanced, false);
    assert.equal(failedClosed.plan.reasoningSource, 'deterministic_fallback');
    assert.equal(failedClosed.plan.rationale, plan.rationale);

    const priority = {
      workloadSummary: { activeGoals: 0, activeProjects: 0 },
      prioritizedItems: [{ taskId: 'task-1', title: 'Review deadline', importanceScore: 0.8, effortScore: 0.5, urgencyScore: 0.6, blockingImpactScore: 0 }],
      strategyCandidates: [],
      recommendedStrategy: { name: 'deadline_first' },
      rationale: 'Prioritize deadline evidence.',
      risks: [],
      confidence: 0.58,
    } as unknown as PrioritizerOutput;
    const priorityInvalidRouter = {
      generateContent: async () => ({ ok: true, text: '{malformed' }),
    } as unknown as GeminiModelRouter;
    const priorityResult = await new PrioritizationReasoningService(priorityInvalidRouter)
      .enhancePrioritization(priority, 'What first?');
    assert.equal(priorityResult.enhanced, false);
    assert.equal(priorityResult.output.reasoningSource, 'deterministic_fallback');
    assert.equal(priorityResult.output.confidence, priority.confidence);
  } finally {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }

  console.log('LLM structured output tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
