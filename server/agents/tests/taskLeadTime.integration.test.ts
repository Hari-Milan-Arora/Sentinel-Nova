/** Verifies the only lead-time consumer degrades honestly with the model disabled. */
import assert from 'node:assert/strict';
import { PrioritizerAgent } from '../agents/PrioritizerAgent';
import { taskLeadTimePredictionService } from '../services/TaskLeadTimePredictionService';
import type { AgentContext } from '../types';
import type { Task } from '../../../src/types';

async function main(): Promise<void> {
  const previousSwitch = process.env.SENTINEL_NOVA_ENABLE_EXPERIMENTAL_LEAD_TIME_MODEL;
  delete process.env.SENTINEL_NOVA_ENABLE_EXPERIMENTAL_LEAD_TIME_MODEL;
  const task: Task = {
    id: 'unavailable-lead-time-task',
    userId: 'lead-time-test-user',
    title: 'Prepare a software module review',
    status: 'todo',
    priority: 'high',
    tags: ['software-engineering'],
    subtasks: [],
    dependencyIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const context: AgentContext = {
    userId: task.userId,
    requestId: 'lead-time-unavailable-test',
    executionId: 'lead-time-unavailable-test-execution',
    userRequest: 'What should I prioritize?',
    timestamp: new Date().toISOString(),
    timezone: 'UTC',
    tasks: [task],
  };

  try {
    const result = await new PrioritizerAgent().execute(context);
    assert.equal(result.success, true);
    const prediction = (result.metadata.taskLeadTimePrediction ?? (result.output as { metadata?: { taskLeadTimePrediction?: unknown } })?.metadata?.taskLeadTimePrediction) as {
      status?: string;
      source?: string;
      reason?: string;
      predictions?: unknown[];
    };
    assert.deepEqual(prediction, {
      targetName: 'task_completion_lead_time',
      units: 'elapsed_calendar_days',
      status: 'unavailable',
      source: 'unavailable',
      predictions: [],
      reason: 'experimental_model_disabled',
    });
    assert.equal((result.output as { prioritizedItems?: Array<{ taskId: string }> })?.prioritizedItems?.[0]?.taskId, task.id);
    assert.ok((result.actions ?? []).every((action) => action.requiresConfirmation));
    console.log('PASS: PrioritizerAgent keeps deterministic ranking and exposes no lead-time estimate when the experimental model is disabled.');
  } finally {
    taskLeadTimePredictionService.stop();
    if (previousSwitch === undefined) delete process.env.SENTINEL_NOVA_ENABLE_EXPERIMENTAL_LEAD_TIME_MODEL;
    else process.env.SENTINEL_NOVA_ENABLE_EXPERIMENTAL_LEAD_TIME_MODEL = previousSwitch;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'lead_time_unavailable_test_failed');
  process.exitCode = 1;
});
