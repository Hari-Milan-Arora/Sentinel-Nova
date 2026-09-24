/**
 * Context Inspector Agent for Sentinel Nova Multi-Agent Runtime (Day 5A)
 *
 * A deterministic test/diagnostic agent used to verify:
 * - Runtime orchestration
 * - Context delivery and scoping
 * - Lifecycle state transitions
 * - Action proposal generation
 * - Result normalization
 *
 * This agent makes NO external calls, performs NO database mutations, and has ZERO side effects.
 */

import { BaseAgent } from '../Agent';
import { AgentCapability, AgentContext, AgentResult } from '../types';

export class ContextInspectorAgent extends BaseAgent {
  public readonly id = 'agent.context_inspector';
  public readonly name = 'Context Inspector Agent';
  public readonly description =
    'Deterministic diagnostic agent for verifying the multi-agent runtime, context propagation, and result lifecycle.';
  public readonly version = '1.0.0';
  public readonly capabilities: AgentCapability[] = ['inspection', 'testing'];

  constructor() {
    super(5000); // 5 second timeout
  }

  public canHandle(context: AgentContext): boolean {
    const req = (context.userRequest || '').toLowerCase();
    return (
      req.includes('inspect') ||
      req.includes('diagnostic') ||
      req.includes('health') ||
      req.includes('test') ||
      req.includes('runtime') ||
      req.trim().length === 0
    );
  }

  protected async run(context: AgentContext): Promise<AgentResult> {
    const proposal = this.createActionProposal({
      type: 'INSPECT_CONTEXT',
      description: `Diagnostic snapshot created for request: "${context.userRequest.slice(0, 40)}"`,
      target: `user:${context.userId}`,
      parameters: {
        timestamp: context.timestamp,
        timezone: context.timezone,
        hasProfile: !!context.profile,
        taskCount: context.tasks?.length ?? 0,
        goalCount: context.goals?.length ?? 0,
        projectCount: context.projects?.length ?? 0,
        calendarConfigured: !!context.calendarStatus,
      },
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    return this.createSuccess(
      context,
      {
        verified: true,
        echoRequest: context.userRequest,
        contextSummary: {
          userId: context.userId,
          hasProfile: !!context.profile,
          taskCount: context.tasks?.length ?? 0,
          goalCount: context.goals?.length ?? 0,
          projectCount: context.projects?.length ?? 0,
          calendarConnected: context.calendarStatus?.status === 'connected',
          timezone: context.timezone,
        },
        runtimeStatus: 'operational',
      },
      {
        confidence: 1.0,
        actions: [proposal],
        warnings: [],
        metadata: {
          testAgent: true,
          mode: 'deterministic',
        },
      }
    );
  }
}
