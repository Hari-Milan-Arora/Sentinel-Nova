/**
 * Reviewer Agent for Sentinel Nova Multi-Agent Runtime (Day 5C Step 2)
 *
 * Provides a deterministic, read-only safety-review layer and validation gate.
 * Inspects proposed AgentActions to answer:
 * "Is this proposed action safe, valid, authorized, and appropriate to execute?"
 *
 * SAFETY MANDATES:
 * 1. ZERO autonomous action execution (Reviewer is a gate, not an executor).
 * 2. Reviewer approval is NOT user confirmation. requiresConfirmation is ALWAYS true.
 * 3. Lifecycle invariant: PROPOSED -> REVIEWED -> WAITING_FOR_USER_CONFIRMATION -> CONFIRMED -> TOOL EXECUTION.
 * 4. ZERO mutations to tasks, goals, projects, calendar, memories, or database.
 * 5. ZERO LLM calls, ZERO external network calls, ZERO recursive agent invocations.
 * 6. ZERO ToolManager invocations.
 * 7. Identity strictly derived from authenticated context; reject cross-user parameter injection.
 * 8. Reject any Google Calendar mutations (calendar is read-only).
 * 9. Reject actions containing credentials, secrets, or bearer tokens.
 * 10. Strictly deterministic evaluation.
 */

import { BaseAgent } from '../Agent';
import {
  AgentCapability,
  AgentContext,
  AgentResult,
  AgentAction,
} from '../types';
import { agentRegistry } from '../AgentRegistry';
import { getTaskById, getActiveTasksByUser, ServerTask } from '../../taskStore';
import { getPlanningProfile } from '../../profileStore';
import { getCachedEvents, getUserCalendarStatus } from '../../calendarStore';
import { calculateAvailability } from '../../../src/utils/availabilityEngine';
import { Task, CalendarEvent, CalendarStatusResponse, UserPlanningProfile } from '../../../src/types';

export type ReviewRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ActionReviewResult {
  approved: boolean;
  actionId: string;
  riskLevel: ReviewRiskLevel;
  requiresConfirmation: boolean;
  reasons: string[];
  warnings: string[];
}

export interface ReviewerContextInput {
  userId: string;
  profile?: UserPlanningProfile | null;
  tasks?: (Task | ServerTask)[];
  calendarEvents?: CalendarEvent[];
  calendarStatus?: CalendarStatusResponse | null;
}

const TRUSTED_SOURCE_AGENTS = new Set<string>([
  'agent.orchestrator',
  'agent.scheduler',
  'agent.planner',
  'agent.prioritizer',
  'agent.memory',
  'agent.context_inspector',
  'agent.reviewer',
  'agent.recovery',
]);

const SECRET_PATTERNS = [
  /bearer\s+[a-zA-Z0-9_\-\.]+/i,
  /ya29\.[a-zA-Z0-9_\-\.]+/,
  /ghp_[a-zA-Z0-9]{10,}/,
  /github_pat_[a-zA-Z0-9_]{10,}/,
  /\bsk[-_](?:live|test)?[a-zA-Z0-9]{10,}\b/i,
  /\beyJh[a-zA-Z0-9_\-]{15,}\.[a-zA-Z0-9_\-]{15,}/i,
];

const SECRET_KEY_NAMES = new Set<string>([
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'token',
  'secret',
  'clientsecret',
  'client_secret',
  'password',
  'privatekey',
  'private_key',
  'sessionsecret',
  'session_secret',
  'cookie',
  'authorization',
  'authtoken',
  'auth_token',
  'api_key',
  'apikey',
]);

export class ReviewerAgent extends BaseAgent {
  public readonly id = 'agent.reviewer';
  public readonly name = 'Reviewer Agent';
  public readonly description =
    'Deterministic safety-review agent and action validation gate for Sentinel Nova action proposals.';
  public readonly version = '1.0.0';
  public readonly capabilities: AgentCapability[] = ['review', 'analysis'];

  constructor() {
    super(5000); // 5-second deterministic timeout
  }

  /**
   * Determine whether this agent can handle the review request.
   */
  public canHandle(context: AgentContext): boolean {
    const req = (context.userRequest || '').toLowerCase();
    return (
      req.includes('review') ||
      req.includes('safety') ||
      req.includes('validate action') ||
      req.includes('verify action') ||
      req.includes('action safety') ||
      Boolean(context.parameters && (context.parameters.action || context.parameters.actionToReview))
    );
  }

  /**
   * Agent execution entry point via Nova Orchestrator.
   * ReviewerAgent creates ZERO action proposals and performs ZERO mutations.
   */
  protected async run(context: AgentContext): Promise<AgentResult> {
    const actionToReview = (context.parameters?.action ||
      context.parameters?.actionToReview) as AgentAction | undefined;

    if (!actionToReview) {
      return this.createSuccess(
        context,
        {
          status: 'NO_ACTION_PROVIDED',
          message: 'ReviewerAgent is active. Provide an action in context.parameters.action to review.',
        },
        {
          confidence: 1.0,
          actions: [], // ZERO proposals
          warnings: ['No action proposal was supplied to ReviewerAgent.'],
        }
      );
    }

    const review = await this.reviewAction(actionToReview, context);

    return this.createSuccess(
      context,
      review,
      {
        confidence: 1.0,
        actions: [], // ZERO proposals
        warnings: review.warnings,
        metadata: {
          approved: review.approved,
          riskLevel: review.riskLevel,
          requiresConfirmation: review.requiresConfirmation,
        },
      }
    );
  }

  /**
   * Inspects and validates an AgentAction against strict safety, authorization,
   * feasibility, and non-mutation constraints.
   */
  public async reviewAction(
    action: AgentAction,
    context: ReviewerContextInput | AgentContext
  ): Promise<ActionReviewResult> {
    const reasons: string[] = [];
    const warnings: string[] = [];

    // 1. Authenticated User Context Validation
    if (!context || !context.userId || typeof context.userId !== 'string' || !context.userId.trim()) {
      return {
        approved: false,
        actionId: (action && typeof action.actionId === 'string' && action.actionId) || '',
        riskLevel: 'critical',
        requiresConfirmation: true,
        reasons: ['Authentication failure: Context must contain a valid authenticated userId.'],
        warnings: [],
      };
    }
    const userId = context.userId.trim();

    // 2. Action Structure Validation
    if (!action || typeof action !== 'object') {
      return {
        approved: false,
        actionId: '',
        riskLevel: 'critical',
        requiresConfirmation: true,
        reasons: ['Malformed action: Action must be a valid non-null object.'],
        warnings: [],
      };
    }

    const actionId = typeof action.actionId === 'string' ? action.actionId.trim() : '';
    if (!actionId) {
      return {
        approved: false,
        actionId: '',
        riskLevel: 'high',
        requiresConfirmation: true,
        reasons: ['Missing required non-empty actionId.'],
        warnings: [],
      };
    }

    // 3. Secrets / Tokens Detection
    if (this.containsSecretsOrTokens(action)) {
      return {
        approved: false,
        actionId,
        riskLevel: 'critical',
        requiresConfirmation: true,
        reasons: ['Security violation: Action contains unauthorized credentials, secrets, or tokens.'],
        warnings: [],
      };
    }

    // 4. Google Calendar Mutation Check (Calendar is strictly read-only)
    if (this.isCalendarMutationAttempt(action)) {
      return {
        approved: false,
        actionId,
        riskLevel: 'high',
        requiresConfirmation: true,
        reasons: ['Security violation: Google Calendar mutation is strictly forbidden (calendar is read-only).'],
        warnings: [],
      };
    }

    // 5. Supported Action Type Check (milestone supports SCHEDULE_TASK and RECOVERY_* proposals)
    const isRecoveryAction =
      action.type === 'RECOVERY_RETRY' ||
      action.type === 'RECOVERY_ADJUST' ||
      action.type === 'RECOVERY_REPLAN' ||
      action.type === 'RECOVERY_ALTERNATIVE' ||
      action.type === 'RECOVERY_ASK_USER' ||
      action.type === 'RECOVERY_ABORT';

    const isTaskAction =
      action.type === 'SCHEDULE_TASK' ||
      action.type === 'COMPLETE_TASK' ||
      action.type === 'REOPEN_TASK';

    if (!isTaskAction && !isRecoveryAction) {
      return {
        approved: false,
        actionId,
        riskLevel: 'high',
        requiresConfirmation: true,
        reasons: [
          `Unsupported action type "${action.type}". Only SCHEDULE_TASK, COMPLETE_TASK, REOPEN_TASK, and RECOVERY_* actions are supported for execution review.`,
        ],
        warnings: [],
      };
    }

    // 6. Source Agent Validation & Trust Verification
    const sourceAgentId = typeof action.sourceAgentId === 'string' ? action.sourceAgentId.trim() : '';
    if (!sourceAgentId) {
      return {
        approved: false,
        actionId,
        riskLevel: 'high',
        requiresConfirmation: true,
        reasons: ['Action missing valid sourceAgentId.'],
        warnings: [],
      };
    }

    const isTrustedSource =
      TRUSTED_SOURCE_AGENTS.has(sourceAgentId) || agentRegistry.has(sourceAgentId);
    if (!isTrustedSource) {
      return {
        approved: false,
        actionId,
        riskLevel: 'high',
        requiresConfirmation: true,
        reasons: [`Action source agent "${sourceAgentId}" is untrusted or unregistered.`],
        warnings: [],
      };
    }

    // 7. Explicit User Confirmation Requirement Verification
    // Every action must enforce requiresConfirmation: true
    if (action.requiresConfirmation !== true) {
      return {
        approved: false,
        actionId,
        riskLevel: 'high',
        requiresConfirmation: true,
        reasons: ['Action violates confirmation invariant: requiresConfirmation must be true.'],
        warnings: [],
      };
    }

    // 8. User Identity Parameter Injection Check
    const params = action.parameters;
    if (!params || typeof params !== 'object') {
      return {
        approved: false,
        actionId,
        riskLevel: 'high',
        requiresConfirmation: true,
        reasons: ['Action parameters must be a valid object.'],
        warnings: [],
      };
    }

    // Strict boundary: Never trust client or parameter supplied user identity
    const injectedUserId =
      (params as Record<string, unknown>).userId ||
      (params as Record<string, unknown>).user_id ||
      (params as Record<string, unknown>).targetUserId ||
      (params as Record<string, unknown>).overrideUserId;

    if (injectedUserId !== undefined && injectedUserId !== null) {
      if (typeof injectedUserId !== 'string' || injectedUserId.trim() !== userId) {
        return {
          approved: false,
          actionId,
          riskLevel: 'critical',
          requiresConfirmation: true,
          reasons: ['Access denied: Action parameters attempt unauthorized user identity injection.'],
          warnings: [],
        };
      }
    }

    // Handle recovery actions validation
    if (isRecoveryAction) {
      const referencedTaskId =
        (params.taskId as string) ||
        (params.originalTaskId as string) ||
        (params.alternativeTaskId as string);

      if (referencedTaskId && typeof referencedTaskId === 'string') {
        let task: Task | ServerTask | null = null;
        if (context.tasks && Array.isArray(context.tasks)) {
          task = context.tasks.find((t) => t.id === referencedTaskId.trim()) || null;
        }
        if (!task) {
          try {
            task = await getTaskById(userId, referencedTaskId.trim());
          } catch {
            // Task fetch handled safely
          }
        }
        if (!task || task.userId !== userId) {
          return {
            approved: false,
            actionId,
            riskLevel: 'critical',
            requiresConfirmation: true,
            reasons: ['Access denied: Referenced task in recovery action does not belong to authenticated user.'],
            warnings: [],
          };
        }
      }

      reasons.push(
        `Recovery proposal ${action.type} is verified, structurally valid, and strictly requires user confirmation.`
      );
      return {
        approved: true,
        actionId,
        riskLevel: action.riskLevel || 'low',
        requiresConfirmation: true,
        reasons,
        warnings,
      };
    }

    // 9. Target Task ID Verification
    const rawTaskId = params.taskId || action.target;
    if (!rawTaskId || typeof rawTaskId !== 'string' || !rawTaskId.trim()) {
      return {
        approved: false,
        actionId,
        riskLevel: 'high',
        requiresConfirmation: true,
        reasons: [`Missing required taskId for ${action.type}.`],
        warnings: [],
      };
    }
    const taskId = rawTaskId.trim();

    // 9b. Complete / Reopen task verification
    if (action.type === 'COMPLETE_TASK' || action.type === 'REOPEN_TASK') {
      let task: Task | ServerTask | null = null;
      if (context.tasks && Array.isArray(context.tasks)) {
        task = context.tasks.find((t) => t.id === taskId) || null;
      }
      if (!task) {
        try {
          task = await getTaskById(userId, taskId);
        } catch {
          // Handled safely
        }
      }
      if (!task) {
        return {
          approved: false,
          actionId,
          riskLevel: 'high',
          requiresConfirmation: true,
          reasons: [`Task with ID "${taskId}" does not exist.`],
          warnings: [],
        };
      }
      if (task.userId !== userId) {
        return {
          approved: false,
          actionId,
          riskLevel: 'critical',
          requiresConfirmation: true,
          reasons: ['Access denied: Task does not belong to authenticated user.'],
          warnings: [],
        };
      }
      if (action.type === 'COMPLETE_TASK' && task.status === 'completed') {
        warnings.push(`Task "${task.title}" is already marked as completed.`);
      }
      if (action.type === 'REOPEN_TASK' && task.status !== 'completed') {
        warnings.push(`Task "${task.title}" is already open.`);
      }
      reasons.push(
        `Action ${action.type} for task "${task.title}" is verified and awaiting user confirmation.`
      );
      return {
        approved: true,
        actionId,
        riskLevel: 'low',
        requiresConfirmation: true,
        reasons,
        warnings,
      };
    }

    // 10. Scheduling Timestamps Validation
    const scheduledStart = params.scheduledStart;
    const scheduledEnd = params.scheduledEnd;

    if (
      typeof scheduledStart !== 'string' ||
      typeof scheduledEnd !== 'string' ||
      !scheduledStart.trim() ||
      !scheduledEnd.trim()
    ) {
      return {
        approved: false,
        actionId,
        riskLevel: 'medium',
        requiresConfirmation: true,
        reasons: ['Invalid or missing scheduledStart or scheduledEnd timestamp.'],
        warnings: [],
      };
    }

    const startDate = new Date(scheduledStart);
    const endDate = new Date(scheduledEnd);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return {
        approved: false,
        actionId,
        riskLevel: 'medium',
        requiresConfirmation: true,
        reasons: ['Malformed timestamp format for scheduledStart or scheduledEnd.'],
        warnings: [],
      };
    }

    if (startDate.getTime() >= endDate.getTime()) {
      return {
        approved: false,
        actionId,
        riskLevel: 'medium',
        requiresConfirmation: true,
        reasons: ['scheduledStart must be chronologically before scheduledEnd.'],
        warnings: [],
      };
    }

    const scheduledDurationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
    if (scheduledDurationMinutes <= 0) {
      return {
        approved: false,
        actionId,
        riskLevel: 'medium',
        requiresConfirmation: true,
        reasons: ['Scheduled duration must be greater than zero.'],
        warnings: [],
      };
    }

    // Multi-day check: Single-day focus rule
    const targetDateStr = scheduledStart.split('T')[0];
    const targetEndDateStr = scheduledEnd.split('T')[0];
    if (targetDateStr !== targetEndDateStr) {
      return {
        approved: false,
        actionId,
        riskLevel: 'medium',
        requiresConfirmation: true,
        reasons: ['Multi-day schedule windows are prohibited under single-day focus constraints.'],
        warnings: [],
      };
    }

    // 11. Task Existence & Ownership Verification (Strict read-only)
    let task: Task | ServerTask | null = null;
    if (context.tasks && Array.isArray(context.tasks)) {
      task = context.tasks.find((t) => t.id === taskId) || null;
    }

    if (!task) {
      try {
        task = await getTaskById(userId, taskId);
      } catch (err: any) {
        return {
          approved: false,
          actionId,
          riskLevel: 'high',
          requiresConfirmation: true,
          reasons: [`Database error while verifying task: ${err.message || 'Unknown error'}`],
          warnings: [],
        };
      }
    }

    if (!task) {
      return {
        approved: false,
        actionId,
        riskLevel: 'high',
        requiresConfirmation: true,
        reasons: [`Task with ID "${taskId}" not found for authenticated user.`],
        warnings: [],
      };
    }

    if (task.userId !== userId) {
      return {
        approved: false,
        actionId,
        riskLevel: 'critical',
        requiresConfirmation: true,
        reasons: ['Access denied: Task does not belong to authenticated user.'],
        warnings: [],
      };
    }

    if (task.status === 'completed' || task.status === 'cancelled') {
      return {
        approved: false,
        actionId,
        riskLevel: 'medium',
        requiresConfirmation: true,
        reasons: [`Task is already marked as ${task.status}.`],
        warnings: [],
      };
    }

    // 12. Task Duration Requirement Verification
    const taskEstimatedMinutes = task.estimatedMinutes || 30;
    if (scheduledDurationMinutes < taskEstimatedMinutes) {
      return {
        approved: false,
        actionId,
        riskLevel: 'medium',
        requiresConfirmation: true,
        reasons: [
          `Scheduled window duration (${scheduledDurationMinutes}m) is less than required task duration (${taskEstimatedMinutes}m).`,
        ],
        warnings: [],
      };
    }

    // 13. Feasibility & Hard Constraints Re-check (Read-only)
    const profile = context.profile || (await getPlanningProfile(userId));
    const calStatus = context.calendarStatus || getUserCalendarStatus(userId);
    const cachedEvents = context.calendarEvents || getCachedEvents(userId);
    const activeTasks =
      context.tasks && Array.isArray(context.tasks)
        ? context.tasks
        : await getActiveTasksByUser(userId);

    const availability = calculateAvailability({
      dateStr: targetDateStr,
      profile,
      events: cachedEvents,
      selectedCalendarIds: calStatus?.selectedCalendarIds || [],
      tasks: activeTasks as ServerTask[],
    });

    const reqStartMs = startDate.getTime();
    const reqEndMs = endDate.getTime();

    // Check availability within free windows
    const fitsInFreeWindow = availability.freeWindows.some((fw) => {
      const fwStartMs = new Date(fw.start).getTime();
      const fwEndMs = new Date(fw.end).getTime();
      return reqStartMs >= fwStartMs && reqEndMs <= fwEndMs;
    });

    if (!fitsInFreeWindow) {
      return {
        approved: false,
        actionId,
        riskLevel: 'high',
        requiresConfirmation: true,
        reasons: [
          'Proposed time window is infeasible: conflicts with sleep rhythm, fixed blocks, or calendar commitments.',
        ],
        warnings: [],
      };
    }

    // Check conflict with other already-scheduled tasks
    const conflictingTask = (activeTasks as (ServerTask | Task)[]).find((other) => {
      if (other.id === task!.id) return false;
      if (!other.scheduledStart || !other.scheduledEnd) return false;
      if (other.status === 'completed' || other.status === 'cancelled') return false;

      const otherStartMs = new Date(other.scheduledStart).getTime();
      const otherEndMs = new Date(other.scheduledEnd).getTime();
      if (isNaN(otherStartMs) || isNaN(otherEndMs)) return false;

      return Math.max(reqStartMs, otherStartMs) < Math.min(reqEndMs, otherEndMs);
    });

    if (conflictingTask) {
      return {
        approved: false,
        actionId,
        riskLevel: 'high',
        requiresConfirmation: true,
        reasons: [
          `Proposed window conflicts with already-scheduled task: "${conflictingTask.title}".`,
        ],
        warnings: [],
      };
    }

    // 14. Due Date Warning Check (Non-blocking)
    if (task.dueDate) {
      const dueMs = new Date(task.dueDate).getTime();
      if (!isNaN(dueMs) && reqEndMs > dueMs) {
        warnings.push(`Scheduled window ends after task due date (${task.dueDate}).`);
      }
    }

    // 15. All Validation Invariants Satisfied
    reasons.push(
      `Action SCHEDULE_TASK is valid, safe, and feasible for task "${task.title}".`,
      'All constraints satisfied: task ownership verified, availability confirmed, zero conflicts.'
    );

    return {
      approved: true,
      actionId,
      riskLevel: 'low',
      requiresConfirmation: true, // Invariant: confirmation remains required
      reasons,
      warnings,
    };
  }

  /**
   * Scans an action for credentials, tokens, or private secrets.
   */
  private containsSecretsOrTokens(action: AgentAction): boolean {
    const textToScan: string[] = [];

    if (action.description) textToScan.push(action.description);
    if (action.target) textToScan.push(action.target);

    // Scan parameters recursively
    const inspectValue = (val: unknown, keyName?: string): boolean => {
      if (keyName && SECRET_KEY_NAMES.has(keyName.toLowerCase().replace(/[^a-z]/g, ''))) {
        if (typeof val === 'string' && val.trim().length > 0) {
          return true;
        }
      }

      if (typeof val === 'string') {
        for (const pattern of SECRET_PATTERNS) {
          if (pattern.test(val)) {
            return true;
          }
        }
      } else if (val && typeof val === 'object') {
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
          if (inspectValue(v, k)) return true;
        }
      }

      return false;
    };

    if (action.parameters && typeof action.parameters === 'object') {
      if (inspectValue(action.parameters)) return true;
    }

    for (const text of textToScan) {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(text)) return true;
      }
    }

    return false;
  }

  /**
   * Checks if an action attempts to mutate Google Calendar.
   */
  private isCalendarMutationAttempt(action: AgentAction): boolean {
    const type = (action.type || '').toUpperCase();
    if (
      type.includes('CALENDAR') ||
      type.includes('EVENT_CREATE') ||
      type.includes('EVENT_UPDATE') ||
      type.includes('EVENT_DELETE')
    ) {
      return true;
    }

    const params = action.parameters;
    if (params && typeof params === 'object') {
      const p = params as Record<string, unknown>;
      if (
        p.calendarWrite === true ||
        p.writeCalendar === true ||
        p.syncToGoogleCalendar === true ||
        p.exportToCalendar === true ||
        p.modifyCalendar === true ||
        p.createCalendarEvent === true ||
        p.createEvent === true ||
        p.deleteCalendarEvent === true
      ) {
        return true;
      }
    }

    return false;
  }
}

export const reviewerAgent = new ReviewerAgent();

if (!agentRegistry.has(reviewerAgent.id)) {
  agentRegistry.register(reviewerAgent);
}
